import React, { useState, useEffect, useRef } from 'react';
import {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  getTexts,
  createText,
  updateText,
  deleteText,
  moveText
} from '../utils/storage';

export default function HomePage({ onPracticeText, isDarkMode, onToggleDarkMode }) {
  const [folders, setFolders] = useState([]);
  const [texts, setTexts] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('default');
  const [showNewTextModal, setShowNewTextModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [newItemName, setNewItemName] = useState('');
  const [newTextArtist, setNewTextArtist] = useState('');
  const [newTextYoutubeUrl, setNewTextYoutubeUrl] = useState('');
  const [newTextContent, setNewTextContent] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [foldersData, textsData] = await Promise.all([
      getFolders(),
      getTexts()
    ]);
    setFolders(foldersData);
    setTexts(textsData);
  };

  const handleCreateFolder = async () => {
    if (newItemName.trim()) {
      await createFolder(newItemName.trim());
      setNewItemName('');
      setShowNewFolderModal(false);
      await loadData();
    }
  };

  const handleCreateText = async () => {
    if (newItemName.trim() && newTextContent.trim()) {
      await createText(newItemName.trim(), newTextContent.trim(), selectedFolder, newTextArtist.trim(), newTextYoutubeUrl.trim(), '', '');
      setNewItemName('');
      setNewTextArtist('');
      setNewTextYoutubeUrl('');
      setNewTextContent('');
      setShowNewTextModal(false);
      await loadData();
    }
  };

  const handleEditFolder = (folder) => {
    setEditingItem(folder);
    setNewItemName(folder.name);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (editingItem && newItemName.trim()) {
      if (editingItem.content !== undefined) {
        // It's a text
        await updateText(editingItem.id, { title: newItemName, artist: newTextArtist, youtubeUrl: newTextYoutubeUrl, content: newTextContent });
      } else {
        // It's a folder
        await updateFolder(editingItem.id, newItemName.trim());
      }
      setEditingItem(null);
      setNewItemName('');
      setNewTextArtist('');
      setNewTextYoutubeUrl('');
      setNewTextContent('');
      setShowEditModal(false);
      await loadData();
    }
  };

  const handleDeleteFolder = async (folderId) => {
    if (folderId === 'default') return;
    if (confirm('Delete this folder? Texts will be moved to Uncategorized.')) {
      await deleteFolder(folderId);
      if (selectedFolder === folderId) {
        setSelectedFolder('default');
      }
      await loadData();
    }
  };

  const handleDeleteText = async (textId) => {
    if (confirm('Delete this text?')) {
      await deleteText(textId);
      await loadData();
    }
  };

  const handleEditText = (text) => {
    setEditingItem(text);
    setNewItemName(text.title);
    setNewTextArtist(text.artist || '');
    setNewTextYoutubeUrl(text.youtubeUrl || '');
    setNewTextContent(text.content);
    setShowEditModal(true);
  };

  const handleMoveText = async (textId, folderId) => {
    await moveText(textId, folderId);
    await loadData();
  };

  const filteredTexts = texts.filter(t => t.folderId === selectedFolder);

  return (
    <div className={`min-h-screen transition-colors ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}
         style={{
           fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif'
         }}>
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className={`w-64 md:w-64 border-r flex flex-col transition-colors ${
          isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <div className={`p-6 border-b flex items-center justify-between transition-colors ${
            isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <div className="flex-1">
              <h1 className={`text-2xl font-light tracking-tight transition-colors ${
                isDarkMode ? 'text-white' : 'text-black'
              }`}>
                Text Memorisation
              </h1>
              <p className={`text-xs mt-1 transition-colors ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}>Organize and practice</p>
            </div>
            {/* Dark mode toggle */}
            <button
              onClick={onToggleDarkMode}
              className={`p-2 rounded transition-colors ${
                isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
              }`}
              title={isDarkMode ? 'Light mode' : 'Dark mode'}
            >
              {isDarkMode ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/>
                  <line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className={`text-xs uppercase tracking-wider font-medium transition-colors ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Folders
              </h2>
              <button
                onClick={() => setShowNewFolderModal(true)}
                className={`transition-colors ${
                  isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'
                }`}
                title="New folder"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </button>
            </div>

            <div className="space-y-1">
              {folders.map(folder => (
                <div key={folder.id} className="group">
                  <div
                    onClick={() => setSelectedFolder(folder.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors ${
                      selectedFolder === folder.id
                        ? (isDarkMode ? 'bg-gray-700 text-white' : 'bg-black text-white')
                        : (isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-700')
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                      <span className="text-sm font-light truncate">{folder.name}</span>
                      <span className="text-xs opacity-60">
                        ({texts.filter(t => t.folderId === folder.id).length})
                      </span>
                    </div>
                    {folder.id !== 'default' && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditFolder(folder);
                          }}
                          className={`p-1 rounded transition-colors ${
                            selectedFolder === folder.id
                              ? (isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-800')
                              : (isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-200')
                          }`}
                          title="Edit folder"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFolder(folder.id);
                          }}
                          className={`p-1 rounded transition-colors ${
                            selectedFolder === folder.id
                              ? (isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-800')
                              : (isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-200')
                          }`}
                          title="Delete folder"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          <div className={`border-b px-4 md:px-6 py-4 flex items-center justify-between transition-colors ${
            isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
          }`}>
            <h2 className={`text-xl font-light transition-colors ${
              isDarkMode ? 'text-white' : 'text-black'
            }`}>
              {folders.find(f => f.id === selectedFolder)?.name || 'Folder'}
            </h2>
            <button
              onClick={() => setShowNewTextModal(true)}
              className={`px-4 py-2 text-sm font-light tracking-wide transition-colors uppercase ${
                isDarkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-black text-white hover:bg-gray-800'
              }`}
            >
              New Text
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {filteredTexts.length === 0 ? (
              <div className="text-center py-16">
                <svg className={`mx-auto h-12 w-12 mb-4 transition-colors ${
                  isDarkMode ? 'text-gray-600' : 'text-gray-400'
                }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <p className={`font-light transition-colors ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                }`}>No texts yet</p>
                <p className={`text-sm mt-1 transition-colors ${
                  isDarkMode ? 'text-gray-500' : 'text-gray-400'
                }`}>Click "New Text" to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTexts.map(text => (
                  <div
                    key={text.id}
                    className={`border rounded-sm p-4 transition-colors group ${
                      isDarkMode
                        ? 'bg-gray-800 border-gray-700 hover:border-gray-500'
                        : 'bg-white border-gray-200 hover:border-black'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-medium text-sm truncate transition-colors ${
                          isDarkMode ? 'text-white' : 'text-black'
                        }`}>
                          {text.title}
                        </h3>
                        {text.artist && (
                          <p className={`text-xs font-light truncate transition-colors ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            {text.artist}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEditText(text)}
                          className={`p-1 rounded transition-colors ${
                            isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                          }`}
                          title="Edit"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteText(text.id)}
                          className={`p-1 rounded transition-colors ${
                            isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                          }`}
                          title="Delete"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    <p className={`text-xs font-light mb-3 line-clamp-3 transition-colors ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      {text.content.substring(0, 100)}...
                    </p>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <button
                        onClick={() => onPracticeText(text)}
                        className={`px-3 py-1 text-xs uppercase tracking-wider font-medium transition-colors ${
                          isDarkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-black text-white hover:bg-gray-800'
                        }`}
                      >
                        Practice
                      </button>
                      <select
                        value={text.folderId}
                        onChange={(e) => handleMoveText(text.id, e.target.value)}
                        className={`text-xs border rounded px-2 py-1 focus:outline-none transition-colors ${
                          isDarkMode
                            ? 'border-gray-600 bg-gray-700 text-gray-200 focus:border-gray-500'
                            : 'border-gray-300 bg-white text-black focus:border-black'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {folders.map(folder => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className={`rounded-sm max-w-md w-full p-6 transition-colors ${
            isDarkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            <h3 className={`text-lg font-light mb-4 transition-colors ${
              isDarkMode ? 'text-white' : 'text-black'
            }`}>New Folder</h3>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Folder name"
              className={`w-full px-3 py-2 border focus:outline-none mb-4 transition-colors ${
                isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-500'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
              }`}
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowNewFolderModal(false);
                  setNewItemName('');
                }}
                className={`px-4 py-2 border text-sm transition-colors ${
                  isDarkMode
                    ? 'border-gray-600 text-gray-200 hover:border-gray-500'
                    : 'border-gray-300 text-black hover:border-black'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newItemName.trim()}
                className={`px-4 py-2 text-sm transition-colors ${
                  isDarkMode
                    ? 'bg-gray-700 text-white hover:bg-gray-600 disabled:bg-gray-700 disabled:opacity-50'
                    : 'bg-black text-white hover:bg-gray-800 disabled:bg-gray-300'
                }`}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Text Modal */}
      {showNewTextModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className={`rounded-sm max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto transition-colors ${
            isDarkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            <h3 className={`text-lg font-light mb-4 transition-colors ${
              isDarkMode ? 'text-white' : 'text-black'
            }`}>New Text</h3>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Title"
              className={`w-full px-3 py-2 border focus:outline-none mb-3 transition-colors ${
                isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-500'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
              }`}
              autoFocus
            />
            <input
              type="text"
              value={newTextArtist}
              onChange={(e) => setNewTextArtist(e.target.value)}
              placeholder="Artist (optional)"
              className={`w-full px-3 py-2 border focus:outline-none mb-3 transition-colors ${
                isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-500'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
              }`}
            />
            <input
              type="url"
              value={newTextYoutubeUrl}
              onChange={(e) => setNewTextYoutubeUrl(e.target.value)}
              placeholder="YouTube URL (optional)"
              className={`w-full px-3 py-2 border focus:outline-none mb-3 transition-colors ${
                isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-500'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
              }`}
            />
            <textarea
              value={newTextContent}
              onChange={(e) => setNewTextContent(e.target.value)}
              placeholder="Paste your text here..."
              className={`w-full h-64 px-3 py-2 border focus:outline-none resize-none mb-4 transition-colors ${
                isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-500'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
              }`}
              style={{ fontFamily: 'monospace' }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowNewTextModal(false);
                  setNewItemName('');
                  setNewTextArtist('');
                  setNewTextYoutubeUrl('');
                  setNewTextContent('');
                }}
                className={`px-4 py-2 border text-sm transition-colors ${
                  isDarkMode
                    ? 'border-gray-600 text-gray-200 hover:border-gray-500'
                    : 'border-gray-300 text-black hover:border-black'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateText}
                disabled={!newItemName.trim() || !newTextContent.trim()}
                className={`px-4 py-2 text-sm transition-colors ${
                  isDarkMode
                    ? 'bg-gray-700 text-white hover:bg-gray-600 disabled:bg-gray-700 disabled:opacity-50'
                    : 'bg-black text-white hover:bg-gray-800 disabled:bg-gray-300'
                }`}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className={`rounded-sm max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto transition-colors ${
            isDarkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            <h3 className={`text-lg font-light mb-4 transition-colors ${
              isDarkMode ? 'text-white' : 'text-black'
            }`}>
              Edit {editingItem.content !== undefined ? 'Text' : 'Folder'}
            </h3>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder={editingItem.content !== undefined ? 'Title' : 'Folder name'}
              className={`w-full px-3 py-2 border focus:outline-none mb-3 transition-colors ${
                isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-500'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
              }`}
              autoFocus
            />
            {editingItem.content !== undefined && (
              <>
                <input
                  type="text"
                  value={newTextArtist}
                  onChange={(e) => setNewTextArtist(e.target.value)}
                  placeholder="Artist (optional)"
                  className={`w-full px-3 py-2 border focus:outline-none mb-3 transition-colors ${
                    isDarkMode
                      ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-500'
                      : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
                  }`}
                />
                <input
                  type="url"
                  value={newTextYoutubeUrl}
                  onChange={(e) => setNewTextYoutubeUrl(e.target.value)}
                  placeholder="YouTube URL (optional)"
                  className={`w-full px-3 py-2 border focus:outline-none mb-3 transition-colors ${
                    isDarkMode
                      ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-500'
                      : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
                  }`}
                />
                <textarea
                  value={newTextContent}
                  onChange={(e) => setNewTextContent(e.target.value)}
                  placeholder="Text content"
                  className={`w-full h-64 px-3 py-2 border focus:outline-none resize-none mb-4 transition-colors ${
                    isDarkMode
                      ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-500'
                      : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
                  }`}
                  style={{ fontFamily: 'monospace' }}
                />
              </>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingItem(null);
                  setNewItemName('');
                  setNewTextArtist('');
                  setNewTextYoutubeUrl('');
                  setNewTextContent('');
                }}
                className={`px-4 py-2 border text-sm transition-colors ${
                  isDarkMode
                    ? 'border-gray-600 text-gray-200 hover:border-gray-500'
                    : 'border-gray-300 text-black hover:border-black'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!newItemName.trim() || (editingItem.content !== undefined && !newTextContent.trim())}
                className={`px-4 py-2 text-sm transition-colors ${
                  isDarkMode
                    ? 'bg-gray-700 text-white hover:bg-gray-600 disabled:bg-gray-700 disabled:opacity-50'
                    : 'bg-black text-white hover:bg-gray-800 disabled:bg-gray-300'
                }`}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
