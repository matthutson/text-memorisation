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
export const getCachedFolders = () => getCache('folders')?.data || null;
export const getCachedTexts = () => getCache('texts_all')?.data || null;

// ---- Folder operations ----

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

export const createFolder = async (name) => {
  const newFolder = {
    id: `folder-${Date.now()}`,
    name,
    created_at: Date.now()
  };

  const { data, error } = await supabase
    .from('folders')
    .insert([newFolder])
    .select()
    .single();

  if (error) {
    console.error('Error creating folder:', error);
    throw error;
  }

  invalidateCache('folders');
  return mapFolder(data);
};

export const updateFolder = async (id, name) => {
  const { data, error } = await supabase
    .from('folders')
    .update({ name, updated_at: Date.now() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating folder:', error);
    throw error;
  }

  invalidateCache('folders');
  return mapFolder(data);
};

export const deleteFolder = async (id) => {
  if (id === 'default') {
    throw new Error('Cannot delete default folder');
  }

  // Move texts from deleted folder to default
  await supabase
    .from('texts')
    .update({ folder_id: 'default' })
    .eq('folder_id', id);

  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting folder:', error);
    throw error;
  }

  invalidateCache('folders');
  invalidateCache('texts_all');
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
  ultimateGuitarUrl: text.ultimate_guitar_url,
  soundsliceUrl: text.soundslice_url,
  folderId: text.folder_id,
  createdAt: text.created_at,
  updatedAt: text.updated_at
});

export const getTexts = async (folderId = null) => {
  const cacheKey = folderId ? `texts_${folderId}` : 'texts_all';
  const cached = getCache(cacheKey);
  if (cached && !cached.isStale) return cached.data;

  let query = supabase
    .from('texts')
    .select('*')
    .order('created_at', { ascending: false });

  if (folderId) {
    query = query.eq('folder_id', folderId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching texts:', error);
    return cached?.data || [];
  }

  const result = data.map(mapText);
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
  setCache(cacheKey, result);
  return result;
};

export const createText = async (
  title,
  content,
  folderId = 'default',
  artist = '',
  youtubeUrl = '',
  strummingPattern = '',
  imageData = '',
  musicXML = '',
  stems = [],
  ultimateGuitarUrl = '',
  soundsliceUrl = ''
) => {
  const newText = {
    id: `text-${Date.now()}`,
    title,
    artist,
    content,
    youtube_url: youtubeUrl,
    strumming_pattern: strummingPattern,
    image_data: imageData,
    music_xml: musicXML,
    stems,
    ultimate_guitar_url: ultimateGuitarUrl,
    soundslice_url: soundsliceUrl,
    folder_id: folderId,
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

  const result = mapText(data);
  invalidateCache('texts_all');
  invalidateCache(`texts_${folderId}`);
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
  if (updates.ultimateGuitarUrl !== undefined) dbUpdates.ultimate_guitar_url = updates.ultimateGuitarUrl;
  if (updates.soundsliceUrl !== undefined) dbUpdates.soundslice_url = updates.soundsliceUrl;
  if (updates.folderId !== undefined) dbUpdates.folder_id = updates.folderId;

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

export const moveText = async (id, folderId) => {
  const result = await updateText(id, { folderId });
  // Also invalidate folder-specific caches
  invalidateCache('texts_all');
  return result;
};
