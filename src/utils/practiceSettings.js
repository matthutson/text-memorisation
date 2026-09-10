//
// Remembers how a song was last practised: its speed, its key, the loop, the
// mix, how much of the words were hidden. These belong to the song rather than
// to the app, so a song you sing a tone down stays a tone down next time.
//
// They live in the browser rather than the database because they are personal
// working state, they change on every drag of a slider, and losing them costs
// nothing. Everything is written under one key so a single read sets up a song.
//
const KEY = 'repetoire.practice-settings.v1';
const KEEP = 60; // songs remembered before the oldest are dropped

const readStore = () => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // A private window, a full disk, or storage turned off: practise anyway
    return {};
  }
};

const writeStore = (store) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Nothing to do but carry on without remembering
  }
};

/** Everything remembered about every song, for when many are needed at once */
export const loadAllSettings = () => readStore();

/** Everything remembered about one song. An unknown song gives an empty object. */
export const loadSettings = (songId) => {
  if (!songId) return {};
  const entry = readStore()[songId];
  return entry && typeof entry === 'object' ? entry : {};
};

// Slider drags would otherwise write on every pixel, so changes are collected
// and flushed once the hand comes to rest.
let pending = new Map();
let timer = null;

const flush = () => {
  timer = null;
  if (!pending.size) return;
  const store = readStore();
  pending.forEach((patch, songId) => {
    store[songId] = { ...store[songId], ...patch, savedAt: Date.now() };
  });
  pending = new Map();

  const songs = Object.keys(store);
  if (songs.length > KEEP) {
    songs
      .sort((a, b) => (store[b].savedAt || 0) - (store[a].savedAt || 0))
      .slice(KEEP)
      .forEach(id => delete store[id]);
  }
  writeStore(store);
};

/** Remember a few settings for a song. Values merge into what is already there. */
export const saveSettings = (songId, patch) => {
  if (!songId || !patch) return;
  pending.set(songId, { ...pending.get(songId), ...patch });
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 400);
};

// A tab closing mid-drag should still keep the last move
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

/** Read a stored value only when it is the kind of thing we expect. */
export const numberOr = (value, fallback, { min = -Infinity, max = Infinity } = {}) =>
  (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback);

export const boolOr = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
