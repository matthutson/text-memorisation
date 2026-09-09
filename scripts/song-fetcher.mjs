#!/usr/bin/env node
//
// Turns a queued YouTube link into backing stems on the song.
//
// This runs on your own machine rather than on Vercel because YouTube refuses
// datacenter addresses: yt-dlp from a cloud host answers "Sign in to confirm
// you're not a bot". From a home connection it just works.
//
// It downloads the audio, hands it to the app's own /api/lalal endpoints (so
// the licence key stays on the server) and writes the finished stems back on
// to the song. Leave it running and songs fill themselves in.
//
//   yt-dlp and ffmpeg must be on PATH:  brew install yt-dlp ffmpeg
//   npm run fetch-songs            keep watching for new jobs
//   npm run fetch-songs -- --once  take one job and stop
//
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const APP_URL = (process.env.APP_URL || 'https://text-memorisation.vercel.app').replace(/\/$/, '');
const POLL_SECONDS = Number(process.env.POLL_SECONDS || 20);
const runOnce = process.argv.includes('--once');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (a .env file in the repo works).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const safeName = (name) => name.replace(/[[\]]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');

const run = (command, args, { capture = false } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  let out = '';
  let err = '';
  if (capture) {
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { err += chunk; });
  }
  child.on('error', reject);
  child.on('close', code => {
    if (code === 0) resolve(out.trim());
    else reject(new Error(`${command} exited with ${code}${err ? `: ${err.trim().split('\n').slice(-3).join(' ')}` : ''}`));
  });
});

const api = async (endpoint, body) => {
  const response = await fetch(`${APP_URL}/api/lalal/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || `${endpoint} failed (${response.status})`);
  return data;
};

const setStage = async (job, stage) => {
  process.stdout.write(`  ${stage}\n`);
  await supabase.from('jobs').update({ stage, updated_at: Date.now() }).eq('id', job.id);
};

const finish = async (job, status, message = '') => {
  await supabase.from('jobs')
    .update({ status, message, stage: status === 'done' ? 'Finished' : 'Stopped', updated_at: Date.now() })
    .eq('id', job.id);
};

/** Download the audio and return { path, title } */
const download = async (job, directory) => {
  await setStage(job, 'Downloading from YouTube');
  const title = await run('yt-dlp', ['--no-playlist', '--print', '%(title)s', '--skip-download', job.source_url], { capture: true });
  await run('yt-dlp', [
    '--no-playlist',
    '-x', '--audio-format', 'mp3', '--audio-quality', '0',
    '-o', join(directory, 'audio.%(ext)s'),
    job.source_url
  ]);
  const files = await readdir(directory);
  const audio = files.find(file => file.endsWith('.mp3'));
  if (!audio) throw new Error('yt-dlp produced no mp3');
  return { path: join(directory, audio), title: title.split('\n')[0] || 'Backing track' };
};

const processJob = async (job) => {
  console.log(`\n▶ ${job.source_url}`);
  const directory = await mkdtemp(join(tmpdir(), 'repetoire-'));
  const sourcePath = `${job.text_id}/source-${Date.now()}.mp3`;

  try {
    const { path, title } = await download(job, directory);

    await setStage(job, 'Uploading the audio');
    const audio = await readFile(path);
    const { error: uploadError } = await supabase.storage
      .from('stems')
      .upload(sourcePath, audio, { contentType: 'audio/mpeg', upsert: true });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
    const { data: { publicUrl } } = supabase.storage.from('stems').getPublicUrl(sourcePath);

    await setStage(job, 'Splitting the stems');
    const uploaded = await api('upload', { url: publicUrl, filename: `${safeName(title)}.mp3` });
    const { task_id: taskId } = await api('split', { source_id: uploaded.id, stem: 'vocals' });

    let tracks = null;
    while (!tracks) {
      await wait(5000);
      const { result } = await api('check', { task_ids: [taskId] });
      const task = result?.[taskId];
      if (!task) throw new Error('The split task disappeared');
      if (task.status === 'error' || task.status === 'server_error') throw new Error(task.error?.detail || 'The split failed');
      if (task.status === 'cancelled') throw new Error('The split was cancelled');
      if (task.status === 'success') tracks = task.result?.tracks || [];
      else await setStage(job, `Splitting the stems (${task.progress || 0}%)`);
    }

    await setStage(job, 'Saving the stems');
    const stems = [];
    for (const track of tracks) {
      const isBacking = track.type === 'back';
      const extension = (track.name || track.url).split('.').pop().split('?')[0] || 'mp3';
      const path = `${job.text_id}/${Date.now()}-${safeName(`${title}-${isBacking ? 'backing' : 'vocals'}.${extension}`)}`;
      const saved = await api('import', { url: track.url, path });
      stems.push({
        label: `${title} — ${isBacking ? 'Backing' : 'Vocals'}`,
        src: saved.publicUrl,
        volume: 1,
        muted: false,
        color: isBacking ? '#3b82f6' : '#f59e0b',
        storagePath: saved.storagePath
      });
    }

    // Keep any tracks the song already had
    const { data: song } = await supabase.from('texts').select('stems').eq('id', job.text_id).single();
    const existing = Array.isArray(song?.stems) ? song.stems : [];
    const { error: saveError } = await supabase
      .from('texts')
      .update({ stems: [...existing, ...stems], updated_at: Date.now() })
      .eq('id', job.text_id);
    if (saveError) throw new Error(`Could not attach the stems: ${saveError.message}`);

    await finish(job, 'done');
    console.log(`✓ ${title}: ${stems.length} stems attached`);
  } catch (error) {
    console.error(`✗ ${error.message}`);
    await finish(job, 'error', error.message);
  } finally {
    // The source copy has done its job either way
    await supabase.storage.from('stems').remove([sourcePath]).catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
};

const claimNextJob = async () => {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    if (/does not exist|schema cache/i.test(error.message || '')) {
      console.error('No jobs table yet. Run the backing track jobs section of supabase-schema.sql.');
      process.exit(1);
    }
    console.error('Could not read jobs:', error.message);
    return null;
  }
  if (!data.length) return null;

  const job = data[0];
  const { data: claimed } = await supabase
    .from('jobs')
    .update({ status: 'running', stage: 'Starting', updated_at: Date.now() })
    .eq('id', job.id)
    .eq('status', 'queued')
    .select();

  return claimed?.length ? job : null;
};

console.log(`Watching for backing track jobs (${APP_URL})`);
if (runOnce) console.log('Single job mode');

for (;;) {
  const job = await claimNextJob();
  if (job) await processJob(job);
  if (runOnce && job) break;
  if (runOnce && !job) { console.log('Nothing queued'); break; }
  await wait(POLL_SECONDS * 1000);
}
