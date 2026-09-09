// Transposes a track without changing its speed.
//
// The stem player drives playback through AudioBufferSourceNode.playbackRate,
// which moves pitch and tempo together. To change one without the other the
// audio is re-rendered offline with SoundTouch and handed back as a blob URL
// the player can load like any other file.

import { SimpleFilter, SoundTouch, WebAudioBufferSource } from 'soundtouchjs';

const FRAMES_PER_PASS = 8192;
const PASSES_PER_YIELD = 24;

const cache = new Map(); // `${url}@${semitones}` -> object URL

const yieldToUi = () => new Promise(resolve => setTimeout(resolve, 0));

/** Interleaved stereo float samples as a 16 bit PCM wav */
const encodeWav = (left, right, sampleRate) => {
  const frames = left.length;
  const bytes = 44 + frames * 4;
  const view = new DataView(new ArrayBuffer(bytes));

  const writeText = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, 'RIFF');
  view.setUint32(4, bytes - 8, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, frames * 4, true);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, l * 32767, true);
    view.setInt16(offset + 2, r * 32767, true);
    offset += 4;
  }

  return new Blob([view], { type: 'audio/wav' });
};

/**
 * Render `url` transposed by `semitones` and return an object URL for the
 * result. Zero semitones returns the original url untouched.
 */
export const renderPitchShifted = async (url, semitones, onProgress = () => {}) => {
  if (!semitones) return url;

  const key = `${url}@${semitones}`;
  if (cache.has(key)) return cache.get(key);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read the track (${response.status})`);
  const encoded = await response.arrayBuffer();

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  let audioBuffer;
  try {
    audioBuffer = await context.decodeAudioData(encoded);
  } finally {
    if (context.state !== 'closed') context.close();
  }

  const soundtouch = new SoundTouch();
  soundtouch.tempo = 1;
  soundtouch.pitchSemitones = semitones;
  const filter = new SimpleFilter(new WebAudioBufferSource(audioBuffer), soundtouch);

  // Tempo is unchanged, so the output is the same length give or take a tail
  const capacity = audioBuffer.length + FRAMES_PER_PASS;
  const left = new Float32Array(capacity);
  const right = new Float32Array(capacity);
  const target = new Float32Array(FRAMES_PER_PASS * 2);

  let written = 0;
  let passes = 0;
  let extracted = filter.extract(target, FRAMES_PER_PASS);
  while (extracted > 0 && written < capacity) {
    const count = Math.min(extracted, capacity - written);
    for (let i = 0; i < count; i++) {
      left[written + i] = target[i * 2];
      right[written + i] = target[i * 2 + 1];
    }
    written += count;

    // Keep the interface responsive while a few million frames go through
    if (++passes % PASSES_PER_YIELD === 0) {
      onProgress(Math.min(99, Math.round((written / audioBuffer.length) * 100)));
      await yieldToUi();
    }
    extracted = filter.extract(target, FRAMES_PER_PASS);
  }

  const blob = encodeWav(left.subarray(0, written), right.subarray(0, written), audioBuffer.sampleRate);
  const objectUrl = URL.createObjectURL(blob);
  cache.set(key, objectUrl);
  onProgress(100);
  return objectUrl;
};

/** Free every rendered copy of `url` that is no longer on screen */
export const releasePitchShifted = (keepUrls = []) => {
  const keep = new Set(keepUrls);
  for (const [key, objectUrl] of cache.entries()) {
    if (keep.has(objectUrl)) continue;
    URL.revokeObjectURL(objectUrl);
    cache.delete(key);
  }
};
