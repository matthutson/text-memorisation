#!/usr/bin/env node
//
// Turns a queued YouTube link into backing stems on the song.
//
// This runs on your own machine rather than on Vercel for two reasons. YouTube
// refuses datacenter addresses: yt-dlp from a cloud host answers "Sign in to
// confirm you're not a bot". And the splitting is done by StemDeck, which is a
// local service on 127.0.0.1 that a deployed function could never reach.
//
// StemDeck takes the YouTube URL itself, downloads it, and separates it with
// Demucs on this machine. Asking it for the vocals alone also gets us its
// "original" complement track, which is every other stem summed: the backing.
// Those two are copied into Supabase storage and attached to the song, which
// is the same pair the app used to get back from LALAL.AI.
//
//   StemDeck must be running:  cd ~/Developer/stemdeck && ./run.sh start
//   npm run fetch-songs            keep watching for new jobs
//   npm run fetch-songs -- --once  take one job and stop
//
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const STEMDECK_URL = (process.env.STEMDECK_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const POLL_SECONDS = Number(process.env.POLL_SECONDS || 20);
// StemDeck keeps every job in its own library. Deleting ours once the stems are
// safely in Supabase keeps the disk in check, but it is destructive and off by
// default: set STEMDECK_CLEANUP=1 to turn it on.
const CLEANUP = process.env.STEMDECK_CLEANUP === '1';
const runOnce = process.argv.includes('--once');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (a .env file in the repo works).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const safeName = (name) => name.replace(/[[\]]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');

const stemdeck = async (path, options = {}) => {
  let response;
  try {
    response = await fetch(`${STEMDECK_URL}${path}`, options);
  } catch (error) {
    throw new Error(`StemDeck is not reachable at ${STEMDECK_URL} (${error.message}). Start it with ./run.sh start`);
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail || `${path} failed (${response.status})`);
  }
  return response;
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

/** Hand the link to StemDeck and wait for the separation. Returns its job state. */
const separate = async (job) => {
  await setStage(job, 'Sending to StemDeck');
  const created = await stemdeck('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Selecting the vocals alone is what makes StemDeck build the "original"
    // complement track, which is the backing we want. Asking for all six would
    // give us no complement at all.
    body: JSON.stringify({ url: job.source_url, stems: ['vocals'] })
  });
  const { job_id: stemdeckId } = await created.json();

  let last = '';
  for (;;) {
    await wait(5000);
    const state = await (await stemdeck(`/api/jobs/${stemdeckId}`)).json();

    if (state.status === 'error') {
      throw new Error(state.error_detail || state.error || 'StemDeck could not separate this song');
    }
    if (state.status === 'cancelled') throw new Error('The StemDeck job was cancelled');
    if (state.status === 'unavailable') throw new Error('StemDeck finished but its stem files are missing');
    if (state.status === 'done') return { ...state, stemdeckId };

    // Demucs on a CPU takes minutes, so the stage is worth showing on the song
    const stage = `${state.stage || state.status}${state.progress ? ` (${Math.round(state.progress)}%)` : ''}`;
    if (stage !== last) {
      last = stage;
      await setStage(job, stage);
    }
  }
};

/** Copy one StemDeck stem into Supabase storage and describe it for the song. */
const saveStem = async (job, state, name, label, color) => {
  const audio = Buffer.from(await (await stemdeck(`/api/jobs/${state.stemdeckId}/stems/${name}.mp3`)).arrayBuffer());
  const title = state.title || 'Backing track';
  const path = `${job.text_id}/${Date.now()}-${safeName(`${title}-${label.toLowerCase()}.mp3`)}`;

  const { error } = await supabase.storage
    .from('stems')
    .upload(path, audio, { contentType: 'audio/mpeg', upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: { publicUrl } } = supabase.storage.from('stems').getPublicUrl(path);
  return { label: `${title} — ${label}`, src: publicUrl, volume: 1, muted: false, color, storagePath: path };
};

const processJob = async (job) => {
  console.log(`\n▶ ${job.source_url}`);
  let state = null;

  try {
    state = await separate(job);

    await setStage(job, 'Saving the stems');
    const stems = [
      // "original" is every stem except the vocals, summed: the backing track
      await saveStem(job, state, 'original', 'Backing', '#3b82f6'),
      await saveStem(job, state, 'vocals', 'Vocals', '#f59e0b')
    ];

    // Keep any tracks the song already had
    const { data: song } = await supabase.from('texts').select('stems').eq('id', job.text_id).single();
    const existing = Array.isArray(song?.stems) ? song.stems : [];
    const { error: saveError } = await supabase
      .from('texts')
      .update({ stems: [...existing, ...stems], updated_at: Date.now() })
      .eq('id', job.text_id);
    if (saveError) throw new Error(`Could not attach the stems: ${saveError.message}`);

    await finish(job, 'done');
    console.log(`✓ ${state.title}: ${stems.length} stems attached`);
  } catch (error) {
    console.error(`✗ ${error.message}`);
    await finish(job, 'error', error.message);
  } finally {
    if (CLEANUP && state?.stemdeckId) {
      await stemdeck(`/api/jobs/${state.stemdeckId}`, { method: 'DELETE' }).catch(() => {});
    }
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

// Fail at the start rather than halfway through someone's first job
const health = await fetch(`${STEMDECK_URL}/api/health`).catch(() => null);
if (!health?.ok) {
  console.error(`StemDeck is not running at ${STEMDECK_URL}. Start it with: cd ~/Developer/stemdeck && ./run.sh start`);
  process.exit(1);
}

console.log(`Watching for backing track jobs (StemDeck at ${STEMDECK_URL})`);
if (runOnce) console.log('Single job mode');

for (;;) {
  const job = await claimNextJob();
  if (job) await processJob(job);
  if (runOnce && job) break;
  if (runOnce && !job) { console.log('Nothing queued'); break; }
  await wait(POLL_SECONDS * 1000);
}
