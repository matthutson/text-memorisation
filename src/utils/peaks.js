// Computes a normalised waveform (peak per bucket) for an audio file.
//
// The stem player's <fc-waveform> expects a pre-rendered BBC audiowaveform JSON
// file, which we don't have for user-uploaded stems, so we decode the audio in
// the browser once and cache the result.

const PEAK_BUCKETS = 1400;
const CACHE_PREFIX = 'peaks_';
const memoryCache = new Map();

const cacheKey = (url) => {
  // Storage paths are unique per upload, so the pathname is a stable key
  try {
    return CACHE_PREFIX + new URL(url).pathname;
  } catch {
    return CACHE_PREFIX + url;
  }
};

const readCache = (url) => {
  if (memoryCache.has(url)) return memoryCache.get(url);
  try {
    const raw = localStorage.getItem(cacheKey(url));
    if (!raw) return null;
    const { peaks, duration } = JSON.parse(raw);
    if (!Array.isArray(peaks) || !duration) return null;
    const result = { peaks: peaks.map(p => p / 100), duration };
    memoryCache.set(url, result);
    return result;
  } catch {
    return null;
  }
};

const writeCache = (url, result) => {
  memoryCache.set(url, result);
  try {
    localStorage.setItem(cacheKey(url), JSON.stringify({
      // Store as small integers to keep the cache entry a few KB
      peaks: result.peaks.map(p => Math.round(p * 100)),
      duration: result.duration
    }));
  } catch {
    // Cache is best-effort; a full localStorage just means we decode again
  }
};

// Reduce a channel to `buckets` peak amplitudes
const bucketPeaks = (channel, buckets) => {
  const size = Math.floor(channel.length / buckets) || 1;
  const peaks = new Array(buckets).fill(0);
  for (let b = 0; b < buckets; b++) {
    const start = b * size;
    const end = Math.min(start + size, channel.length);
    let max = 0;
    for (let i = start; i < end; i++) {
      const value = Math.abs(channel[i]);
      if (value > max) max = value;
    }
    peaks[b] = max;
  }
  const loudest = peaks.reduce((max, p) => Math.max(max, p), 0);
  return loudest > 0 ? peaks.map(p => p / loudest) : peaks;
};

/** Peaks for audio that has already been decoded, e.g. by the player */
export const peaksFromBuffer = (url, audioBuffer) => {
  const cached = readCache(url);
  if (cached) return cached;
  const result = {
    peaks: bucketPeaks(audioBuffer.getChannelData(0), PEAK_BUCKETS),
    duration: audioBuffer.duration
  };
  writeCache(url, result);
  return result;
};

/**
 * Decode `url` and return { peaks: number[] (0-1), duration: seconds }.
 * Results are cached in memory and localStorage.
 */
export const getPeaks = async (url) => {
  const cached = readCache(url);
  if (cached) return cached;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch audio (${response.status})`);
  const arrayBuffer = await response.arrayBuffer();

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  try {
    const buffer = await context.decodeAudioData(arrayBuffer);
    const result = {
      peaks: bucketPeaks(buffer.getChannelData(0), PEAK_BUCKETS),
      duration: buffer.duration
    };
    writeCache(url, result);
    return result;
  } finally {
    // Free the decoding context; playback uses the stem player's own context
    if (context.state !== 'closed') context.close();
  }
};
