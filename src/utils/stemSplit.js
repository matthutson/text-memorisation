// Splits a song into vocal and backing stems with LALAL.AI.
//
// The licence key lives in the Vercel functions under /api/lalal, so nothing
// here ever sees it. The song is uploaded to storage first, because Vercel
// caps request bodies at 4.5MB and songs are usually bigger than that.

import { supabase } from './supabase';

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 15 * 60 * 1000;

const post = async (endpoint, body) => {
  const response = await fetch(`/api/lalal/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.detail || `${endpoint} failed (${response.status})`);
  }
  return data;
};

const safeName = (name) =>
  name.replace(/[[\]]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// The tracks the lead and back vocal splitter returns, and what to call them.
// Together these three are the whole song: instrumental, lead, harmonies.
const PARTS = {
  no_vocals: { name: 'Instrumental', file: 'instrumental', color: '#3b82f6', order: 0 },
  'vocals@1': { name: 'Backing vocals', file: 'backing-vocals', color: '#8b5cf6', order: 1 },
  'vocals@0': { name: 'Lead vocal', file: 'lead-vocal', color: '#f59e0b', order: 2 },
  // A song the splitter finds only one voice in comes back the plain way
  vocals: { name: 'Vocals', file: 'vocals', color: '#f59e0b', order: 2 }
};

// The mixer reads top to bottom, so put the backing first and the lead last
const inMixOrder = (tracks) => tracks
  .filter(track => PARTS[track.label])
  .sort((a, b) => PARTS[a.label].order - PARTS[b.label].order);

/** Processing minutes left on the licence, or null when not configured */
export const getMinutesLeft = async () => {
  try {
    const { minutes_left: minutes } = await post('limits');
    return typeof minutes === 'number' ? minutes : null;
  } catch {
    return null;
  }
};

/**
 * Upload `file`, split it, and return stems ready to store on the song.
 * `onProgress({ stage, percent, message })` is called as it goes.
 */
export const splitIntoStems = async (file, { textId, onProgress = () => {} } = {}) => {
  if (!textId) throw new Error('Save the song before splitting a track for it');

  // 1. Park the source file in storage so the API function can stream it
  onProgress({ stage: 'uploading', percent: 5, message: 'Uploading the song…' });
  const sourcePath = `${textId}/source-${Date.now()}-${safeName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from('stems')
    .upload(sourcePath, file, { cacheControl: '3600', upsert: false });
  if (uploadError) throw new Error(`Could not upload the song: ${uploadError.message}`);

  const { data: { publicUrl: sourceUrl } } = supabase.storage
    .from('stems')
    .getPublicUrl(sourcePath);

  try {
    // 2. Hand it to LALAL.AI
    onProgress({ stage: 'sending', percent: 15, message: 'Sending to LALAL.AI…' });
    const uploaded = await post('upload', { url: sourceUrl, filename: file.name });

    onProgress({ stage: 'splitting', percent: 20, message: 'Splitting…' });
    // 'lead_back' is the lead and back vocal splitter: the lead voice and the
    // harmonies come back separately, so the harmonies can be sung along with
    // while the lead is muted. mp3 rather than the source format, because a wav
    // backing track is twenty times the size and is downloaded every time the
    // song is opened.
    const { task_id: taskId } = await post('split', {
      source_id: uploaded.id,
      stem: 'vocals',
      multivocal: 'lead_back',
      encoder_format: 'mp3'
    });

    // 3. Wait for it, reporting the reported percentage
    const startedAt = Date.now();
    let tracks = null;
    while (!tracks) {
      if (Date.now() - startedAt > POLL_TIMEOUT) throw new Error('The split timed out');
      await wait(POLL_INTERVAL);

      const { result } = await post('check', { task_ids: [taskId] });
      const task = result?.[taskId];
      if (!task) throw new Error('The split task disappeared');

      if (task.status === 'error' || task.status === 'server_error') {
        throw new Error(task.error?.detail || 'The split failed');
      }
      if (task.status === 'cancelled') throw new Error('The split was cancelled');
      if (task.status === 'success') {
        tracks = task.result?.tracks || [];
      } else {
        const percent = 20 + Math.round(((task.progress || 0) / 100) * 60);
        onProgress({ stage: 'splitting', percent, message: `Splitting… ${task.progress || 0}%` });
      }
    }

    // 4. Copy the results into storage: LALAL.AI's own URLs expire
    onProgress({ stage: 'saving', percent: 85, message: 'Saving the stems…' });
    const base = file.name.replace(/\.[^/.]+$/, '');
    const stems = [];
    // 'mix_no_lead' also comes back: the mix with only the lead taken out. It
    // is the instrumental and the harmonies already added together, so keeping
    // it would play the instrumental twice with every fader up. Muting the lead
    // gives the same thing.
    for (const track of inMixOrder(tracks)) {
      const part = PARTS[track.label];
      const path = `${textId}/${Date.now()}-${safeName(`${base}-${part.file}.mp3`)}`;
      const saved = await post('import', { url: track.url, path });
      stems.push({
        label: `${base} — ${part.name}`,
        src: saved.publicUrl,
        volume: 1.0,
        muted: false,
        color: part.color,
        storagePath: saved.storagePath
      });
    }

    if (!stems.length) throw new Error('The split returned no tracks we recognise');

    onProgress({ stage: 'done', percent: 100, message: 'Done' });
    return stems;
  } finally {
    // The source copy has served its purpose either way
    await supabase.storage.from('stems').remove([sourcePath]).catch(() => {});
  }
};
