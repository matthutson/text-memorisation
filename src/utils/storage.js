// Storage utility for managing texts and folders in localStorage

const STORAGE_KEY = 'text-memorisation-data';

// Initialize storage structure
const getStorage = () => {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    const initialData = {
      folders: [
        { id: 'default', name: 'Uncategorized', createdAt: Date.now() }
      ],
      texts: []
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialData));
    return initialData;
  }
  return JSON.parse(data);
};

const saveStorage = (data) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

// Folder operations
export const getFolders = () => {
  const { folders } = getStorage();
  return folders;
};

export const createFolder = (name) => {
  const data = getStorage();
  const newFolder = {
    id: `folder-${Date.now()}`,
    name,
    createdAt: Date.now()
  };
  data.folders.push(newFolder);
  saveStorage(data);
  return newFolder;
};

export const updateFolder = (id, name) => {
  const data = getStorage();
  const folder = data.folders.find(f => f.id === id);
  if (folder) {
    folder.name = name;
    saveStorage(data);
  }
  return folder;
};

export const deleteFolder = (id) => {
  if (id === 'default') {
    throw new Error('Cannot delete default folder');
  }
  const data = getStorage();
  // Move texts from deleted folder to default
  data.texts.forEach(text => {
    if (text.folderId === id) {
      text.folderId = 'default';
    }
  });
  data.folders = data.folders.filter(f => f.id !== id);
  saveStorage(data);
};

// Text operations
export const getTexts = (folderId = null) => {
  const { texts } = getStorage();
  if (folderId) {
    return texts.filter(t => t.folderId === folderId);
  }
  return texts;
};

export const getText = (id) => {
  const { texts } = getStorage();
  return texts.find(t => t.id === id);
};

export const createText = (title, content, folderId = 'default') => {
  const data = getStorage();
  const newText = {
    id: `text-${Date.now()}`,
    title,
    content,
    folderId,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  data.texts.push(newText);
  saveStorage(data);
  return newText;
};

export const updateText = (id, updates) => {
  const data = getStorage();
  const text = data.texts.find(t => t.id === id);
  if (text) {
    Object.assign(text, updates, { updatedAt: Date.now() });
    saveStorage(data);
  }
  return text;
};

export const deleteText = (id) => {
  const data = getStorage();
  data.texts = data.texts.filter(t => t.id !== id);
  saveStorage(data);
};

export const moveText = (id, folderId) => {
  return updateText(id, { folderId });
};
