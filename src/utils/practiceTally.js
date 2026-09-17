//
// How many times each song has been opened to practise.
//
// A count of openings, not of minutes: the question it answers is "what have I
// actually been going back to", and a song you open and abandon still counts as
// a time you reached for it. It lives in the browser next to the practice
// settings, for the same reasons — it is personal, it changes constantly, and
// nothing breaks if a new machine starts the tally from nought.
//
const KEY = 'repetoire.practice-tally.v1';

const readStore = () => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // A private window or storage turned off: practise anyway, uncounted
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

/** The whole tally: song id -> { count, last } */
export const loadTally = () => readStore();

/** How many times one song has been opened */
export const countFor = (tally, songId) => tally?.[songId]?.count || 0;

/**
 * Count one opening of a song and give back the tally that results, so the
 * caller can put the new number on the screen without a second read.
 */
export const recordPractice = (songId) => {
  if (!songId) return readStore();
  const store = readStore();
  const seen = store[songId] || { count: 0 };
  store[songId] = { count: seen.count + 1, last: Date.now() };
  writeStore(store);
  return store;
};

/** Forget a song's tally — used when the song itself goes */
export const forgetPractice = (songId) => {
  if (!songId) return;
  const store = readStore();
  if (!(songId in store)) return;
  delete store[songId];
  writeStore(store);
};

/** Wipe the lot, for a fresh start */
export const clearTally = () => writeStore({});
