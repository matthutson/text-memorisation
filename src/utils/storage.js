// Storage utility for managing texts and folders in Supabase
import { supabase } from './supabase';

// ---- Local cache helpers ----
const CACHE_PREFIX = 'cache_';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes before background refresh

const getCache = (key) => {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    return { data, timestamp, isStale: Date.now() - timestamp > CACHE_TTL };
  } catch {
    return null;
  }
};

const setCache = (key, data) => {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (e) {
    // localStorage full — clear old caches and retry once
    clearOldCaches();
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, timestamp: Date.now() }));
    } catch {
      // Still full, skip caching
    }
  }
};

const invalidateCache = (key) => {
  localStorage.removeItem(CACHE_PREFIX + key);
};

const clearOldCaches = () => {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
  }
  // Remove oldest entries (by timestamp)
  const entries = keys.map(k => {
    try {
      const { timestamp } = JSON.parse(localStorage.getItem(k));
      return { key: k, timestamp };
    } catch {
      return { key: k, timestamp: 0 };
    }
  }).sort((a, b) => a.timestamp - b.timestamp);
  // Remove oldest half
  const toRemove = entries.slice(0, Math.ceil(entries.length / 2));
  toRemove.forEach(e => localStorage.removeItem(e.key));
};

// Synchronous cache getters — return cached data instantly (or null if no cache)
export const getCachedTexts = () => getCache('texts_all')?.data || null;

// ---- Tag operations ----
//
// A song has any number of tags, joined through text_tags. Installations that
// haven't run the tags migration yet fall back to reading folders as tags, so
// the app keeps working until the SQL is applied.

const mapTag = (tag) => ({
  id: tag.id,
  name: tag.name,
  createdAt: tag.created_at
});

let tagsTableMissing = false;

const isMissingTable = (error) =>
  error?.code === '42P01' || error?.code === 'PGRST205' || /does not exist/i.test(error?.message || '');

export const getCachedTags = () => getCache('tags')?.data || null;

export const getTags = async () => {
  const cached = getCache('tags');
  if (cached && !cached.isStale) return cached.data;

  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    if (isMissingTable(error)) {
      // Before the migration: show the old folders as tags
      tagsTableMissing = true;
      const folders = await getFolders();
      return folders.filter(folder => folder.id !== 'default');
    }
    console.error('Error fetching tags:', error);
    return cached?.data || [];
  }

  const result = data.map(mapTag);
  setCache('tags', result);
  return result;
};

export const createTag = async (name) => {
  const newTag = {
    id: `tag-${Date.now()}`,
    name,
    created_at: Date.now()
  };

  const { data, error } = await supabase
    .from('tags')
    .insert([newTag])
    .select()
    .single();

  if (error) {
    console.error('Error creating tag:', error);
    throw error;
  }

  invalidateCache('tags');
  return mapTag(data);
};

export const updateTag = async (id, name) => {
  const { data, error } = await supabase
    .from('tags')
    .update({ name, updated_at: Date.now() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating tag:', error);
    throw error;
  }

  invalidateCache('tags');
  invalidateCache('texts_all');
  return mapTag(data);
};

export const deleteTag = async (id) => {
  // text_tags rows cascade, so songs simply lose the tag
  const { error } = await supabase.from('tags').delete().eq('id', id);

  if (error) {
    console.error('Error deleting tag:', error);
    throw error;
  }

  invalidateCache('tags');
  invalidateCache('texts_all');
};

/** Replace the whole tag set for one song */
export const setTextTags = async (textId, tagIds) => {
  const { error: deleteError } = await supabase
    .from('text_tags')
    .delete()
    .eq('text_id', textId);

  if (deleteError) {
    console.error('Error clearing tags:', deleteError);
    throw deleteError;
  }

  if (tagIds.length > 0) {
    const { error } = await supabase
      .from('text_tags')
      .insert(tagIds.map(tagId => ({ text_id: textId, tag_id: tagId })));

    if (error) {
      console.error('Error saving tags:', error);
      throw error;
    }
  }

  invalidateCache('texts_all');
  invalidateCache(`text_${textId}`);
};

/** Map of text id -> tag ids */
const getTagsByText = async () => {
  if (tagsTableMissing) return null;

  const { data, error } = await supabase.from('text_tags').select('text_id, tag_id');
  if (error) {
    if (isMissingTable(error)) tagsTableMissing = true;
    else console.error('Error fetching tag links:', error);
    return null;
  }

  const byText = {};
  for (const row of data) {
    (byText[row.text_id] = byText[row.text_id] || []).push(row.tag_id);
  }
  return byText;
};

// ---- Folder operations (superseded by tags, kept for the fallback) ----

const mapFolder = (folder) => ({
  id: folder.id,
  name: folder.name,
  createdAt: folder.created_at,
  updatedAt: folder.updated_at
});

export const getFolders = async () => {
  // Return cached data immediately if available
  const cached = getCache('folders');
  if (cached && !cached.isStale) return cached.data;

  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching folders:', error);
    // Return stale cache on error
    return cached?.data || [];
  }

  const result = data.map(mapFolder);
  setCache('folders', result);
  return result;
};

// ---- Text operations ----

const mapText = (text) => ({
  id: text.id,
  title: text.title,
  artist: text.artist,
  content: text.content,
  youtubeUrl: text.youtube_url,
  strummingPattern: text.strumming_pattern,
  imageData: text.image_data,
  musicXML: text.music_xml,
  stems: text.stems,
  bookmarks: text.bookmarks,
  tagIds: text.tagIds || [],
  ultimateGuitarUrl: text.ultimate_guitar_url,
  soundsliceUrl: text.soundslice_url,
  folderId: text.folder_id,
  createdAt: text.created_at,
  updatedAt: text.updated_at
});

export const getTexts = async () => {
  const cacheKey = 'texts_all';
  const cached = getCache(cacheKey);
  if (cached && !cached.isStale) return cached.data;

  const { data, error } = await supabase
    .from('texts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching texts:', error);
    return cached?.data || [];
  }

  const tagsByText = await getTagsByText();
  const result = data.map(row => {
    const text = mapText(row);
    // Before the migration the old folder stands in as the song's one tag
    text.tagIds = tagsByText
      ? (tagsByText[row.id] || [])
      : (row.folder_id && row.folder_id !== 'default' ? [row.folder_id] : []);
    return text;
  });
  setCache(cacheKey, result);
  return result;
};

export const getText = async (id) => {
  const cacheKey = `text_${id}`;
  const cached = getCache(cacheKey);
  if (cached && !cached.isStale) return cached.data;

  const { data, error } = await supabase
    .from('texts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching text:', error);
    return cached?.data || null;
  }

  const result = mapText(data);
  const tagsByText = await getTagsByText();
  result.tagIds = tagsByText
    ? (tagsByText[data.id] || [])
    : (data.folder_id && data.folder_id !== 'default' ? [data.folder_id] : []);
  setCache(cacheKey, result);
  return result;
};

export const createText = async ({
  title,
  content,
  artist = '',
  youtubeUrl = '',
  ultimateGuitarUrl = '',
  soundsliceUrl = '',
  tagIds = []
}) => {
  const newText = {
    id: `text-${Date.now()}`,
    title,
    artist,
    content,
    youtube_url: youtubeUrl,
    ultimate_guitar_url: ultimateGuitarUrl,
    soundslice_url: soundsliceUrl,
    // texts.folder_id is NOT NULL and no longer read; tags do the organising
    folder_id: 'default',
    created_at: Date.now(),
    updated_at: Date.now()
  };

  const { data, error } = await supabase
    .from('texts')
    .insert([newText])
    .select()
    .single();

  if (error) {
    console.error('Error creating text:', error);
    throw error;
  }

  if (tagIds.length > 0) {
    await setTextTags(data.id, tagIds);
  }

  const result = mapText(data);
  result.tagIds = tagIds;
  invalidateCache('texts_all');
  return result;
};

export const updateText = async (id, updates) => {
  // Convert camelCase to snake_case for Supabase
  const dbUpdates = {
    updated_at: Date.now()
  };

  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.artist !== undefined) dbUpdates.artist = updates.artist;
  if (updates.content !== undefined) dbUpdates.content = updates.content;
  if (updates.youtubeUrl !== undefined) dbUpdates.youtube_url = updates.youtubeUrl;
  if (updates.strummingPattern !== undefined) dbUpdates.strumming_pattern = updates.strummingPattern;
  if (updates.imageData !== undefined) dbUpdates.image_data = updates.imageData;
  if (updates.musicXML !== undefined) dbUpdates.music_xml = updates.musicXML;
  if (updates.stems !== undefined) dbUpdates.stems = updates.stems;
  if (updates.bookmarks !== undefined) dbUpdates.bookmarks = updates.bookmarks;
  if (updates.ultimateGuitarUrl !== undefined) dbUpdates.ultimate_guitar_url = updates.ultimateGuitarUrl;
  if (updates.soundsliceUrl !== undefined) dbUpdates.soundslice_url = updates.soundsliceUrl;

  const { data, error } = await supabase
    .from('texts')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating text:', error);
    throw error;
  }

  const result = mapText(data);
  invalidateCache(`text_${id}`);
  invalidateCache('texts_all');
  return result;
};

export const deleteText = async (id) => {
  const { error } = await supabase
    .from('texts')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting text:', error);
    throw error;
  }

  invalidateCache(`text_${id}`);
  invalidateCache('texts_all');
};

// ---- Backing track jobs ----
//
// A job asks for a YouTube link to be turned into stems. The work happens in
// scripts/song-fetcher.mjs, running on a machine YouTube will talk to.

const mapJob = (job) => ({
  id: job.id,
  textId: job.text_id,
  sourceUrl: job.source_url,
  status: job.status,
  stage: job.stage,
  message: job.message,
  createdAt: job.created_at,
  updatedAt: job.updated_at
});

export const queueBackingTrack = async (textId, sourceUrl) => {
  const job = {
    id: `job-${Date.now()}`,
    text_id: textId,
    source_url: sourceUrl,
    status: 'queued',
    stage: 'Waiting for the helper',
    created_at: Date.now(),
    updated_at: Date.now()
  };

  const { data, error } = await supabase.from('jobs').insert([job]).select().single();

  if (error) {
    console.error('Error queueing backing track:', error);
    throw error;
  }
  return mapJob(data);
};

/** The most recent job for a song, or null */
export const getJobForText = async (textId) => {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('text_id', textId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    if (!isMissingTable(error)) console.error('Error fetching job:', error);
    return null;
  }
  return data.length ? mapJob(data[0]) : null;
};
