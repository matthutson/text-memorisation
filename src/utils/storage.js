// Storage utility for managing texts and folders in Supabase
import { supabase } from './supabase';

// Folder operations
export const getFolders = async () => {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching folders:', error);
    return [];
  }

  // Convert snake_case to camelCase for consistency
  return data.map(folder => ({
    id: folder.id,
    name: folder.name,
    createdAt: folder.created_at,
    updatedAt: folder.updated_at
  }));
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

  return {
    id: data.id,
    name: data.name,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
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

  return {
    id: data.id,
    name: data.name,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
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
};

// Text operations
export const getTexts = async (folderId = null) => {
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
    return [];
  }

  // Convert snake_case to camelCase for consistency
  return data.map(text => ({
    id: text.id,
    title: text.title,
    artist: text.artist,
    content: text.content,
    youtubeUrl: text.youtube_url,
    strummingPattern: text.strumming_pattern,
    imageData: text.image_data,
    musicXML: text.music_xml,
    stems: text.stems,
    folderId: text.folder_id,
    createdAt: text.created_at,
    updatedAt: text.updated_at
  }));
};

export const getText = async (id) => {
  const { data, error } = await supabase
    .from('texts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching text:', error);
    return null;
  }

  return {
    id: data.id,
    title: data.title,
    artist: data.artist,
    content: data.content,
    youtubeUrl: data.youtube_url,
    strummingPattern: data.strumming_pattern,
    imageData: data.image_data,
    musicXML: data.music_xml,
    stems: data.stems,
    folderId: data.folder_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
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
  stems = []
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

  return {
    id: data.id,
    title: data.title,
    artist: data.artist,
    content: data.content,
    youtubeUrl: data.youtube_url,
    strummingPattern: data.strumming_pattern,
    imageData: data.image_data,
    musicXML: data.music_xml,
    stems: data.stems,
    folderId: data.folder_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
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

  return {
    id: data.id,
    title: data.title,
    artist: data.artist,
    content: data.content,
    youtubeUrl: data.youtube_url,
    strummingPattern: data.strumming_pattern,
    imageData: data.image_data,
    musicXML: data.music_xml,
    stems: data.stems,
    folderId: data.folder_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
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
};

export const moveText = async (id, folderId) => {
  return updateText(id, { folderId });
};
