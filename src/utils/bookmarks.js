// Bookmarks tie a moment in the audio to a line of the lyrics.
//
// They live in the `bookmarks` column on `texts` (see supabase-schema.sql).
// Installations that haven't run the migration yet keep working: every save is
// mirrored to localStorage, which is also used as the fallback on read.

import { updateText } from './storage';

const LOCAL_PREFIX = 'bookmarks_';

const localKey = (textId) => LOCAL_PREFIX + textId;

const readLocal = (textId) => {
  try {
    const raw = localStorage.getItem(localKey(textId));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLocal = (textId, bookmarks) => {
  try {
    localStorage.setItem(localKey(textId), JSON.stringify(bookmarks));
  } catch {
    // Best-effort mirror
  }
};

export const sortBookmarks = (bookmarks) =>
  [...bookmarks].sort((a, b) => a.time - b.time);

export const loadBookmarks = (textData) => {
  if (!textData?.id) return [];
  const stored = Array.isArray(textData.bookmarks) ? textData.bookmarks : null;
  return sortBookmarks(stored?.length ? stored : readLocal(textData.id));
};

export const saveBookmarks = async (textId, bookmarks) => {
  if (!textId) return;
  const sorted = sortBookmarks(bookmarks);
  writeLocal(textId, sorted);
  try {
    await updateText(textId, { bookmarks: sorted });
  } catch (error) {
    // The column may not exist yet — localStorage keeps the marks either way
    console.warn('[bookmarks] Could not save to database, kept locally:', error?.message || error);
  }
};

/** The bookmark that is currently playing, i.e. the last one at or before `time` */
export const bookmarkAt = (bookmarks, time) => {
  let found = null;
  for (const bookmark of bookmarks) {
    if (bookmark.time <= time + 0.02) found = bookmark;
    else break;
  }
  return found;
};

export const nextBookmark = (bookmarks, time) =>
  bookmarks.find(bookmark => bookmark.time > time + 0.25) || null;

export const previousBookmark = (bookmarks, time) => {
  // Behaves like a transport button: a little way into a mark, jump to its start
  let found = null;
  for (const bookmark of bookmarks) {
    if (bookmark.time < time - 1.5) found = bookmark;
    else break;
  }
  return found;
};
