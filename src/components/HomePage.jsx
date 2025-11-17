import React, { useState, useEffect } from 'react';
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

export default function HomePage({ onPracticeText }) {
  const [folders, setFolders] = useState([]);
  const [texts, setTexts] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('default');
  const [showNewTextModal, setShowNewTextModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [newItemName, setNewItemName] = useState('');
  const [newTextContent, setNewTextContent] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setFolders(getFolders());
    setTexts(getTexts());
  };

  const handleCreateFolder = () => {
    if (newItemName.trim()) {
      createFolder(newItemName.trim());
      setNewItemName('');
      setShowNewFolderModal(false);
      loadData();
    }
  };

  const handleCreateText = () => {
    if (newItemName.trim() && newTextContent.trim()) {
      createText(newItemName.trim(), newTextContent.trim(), selectedFolder);
      setNewItemName('');
      setNewTextContent('');
      setShowNewTextModal(false);
      loadData();
    }
  };

  const handleEditFolder = (folder) => {
    setEditingItem(folder);
    setNewItemName(folder.name);
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (editingItem && newItemName.trim()) {
      if (editingItem.content !== undefined) {
        // It's a text
        updateText(editingItem.id, { title: newItemName, content: newTextContent });
      } else {
        // It's a folder
        updateFolder(editingItem.id, newItemName.trim());
      }
      setEditingItem(null);
      setNewItemName('');
      setNewTextContent('');
      setShowEditModal(false);
      loadData();
    }
  };

  const handleDeleteFolder = (folderId) => {
    if (folderId === 'default') return;
    if (confirm('Delete this folder? Texts will be moved to Uncategorized.')) {
      deleteFolder(folderId);
      if (selectedFolder === folderId) {
        setSelectedFolder('default');
      }
      loadData();
    }
  };

  const handleDeleteText = (textId) => {
    if (confirm('Delete this text?')) {
      deleteText(textId);
      loadData();
    }
  };

  const handleEditText = (text) => {
    setEditingItem(text);
    setNewItemName(text.title);
    setNewTextContent(text.content);
    setShowEditModal(true);
  };

  const handleMoveText = (textId, folderId) => {
    moveText(textId, folderId);
    loadData();
  };

  const filteredTexts = texts.filter(t => t.folderId === selectedFolder);

  return (
    <div className="min-h-screen bg-gray-50"
         style={{
           fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif'
         }}>
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-6 border-b border-gray-200">
            <h1 className="text-2xl font-light text-black tracking-tight">
              Text Memorisation
            </h1>
            <p className="text-xs text-gray-500 mt-1">Organize and practice</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs uppercase tracking-wider text-gray-600 font-medium">
                Folders
              </h2>
              <button
                onClick={() => setShowNewFolderModal(true)}
                className="text-gray-600 hover:text-black transition-colors"
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
                        ? 'bg-black text-white'
                        : 'hover:bg-gray-100 text-gray-700'
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
                          className={`p-1 rounded hover:bg-gray-200 ${
                            selectedFolder === folder.id ? 'hover:bg-gray-800' : ''
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
                          className={`p-1 rounded hover:bg-gray-200 ${
                            selectedFolder === folder.id ? 'hover:bg-gray-800' : ''
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
          <div className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-light text-black">
              {folders.find(f => f.id === selectedFolder)?.name || 'Folder'}
            </h2>
            <button
              onClick={() => setShowNewTextModal(true)}
              className="px-4 py-2 bg-black text-white text-sm font-light tracking-wide hover:bg-gray-800 transition-colors uppercase"
            >
              New Text
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {filteredTexts.length === 0 ? (
              <div className="text-center py-16">
                <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <p className="text-gray-500 font-light">No texts yet</p>
                <p className="text-gray-400 text-sm mt-1">Click "New Text" to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTexts.map(text => (
                  <div
                    key={text.id}
                    className="bg-white border border-gray-200 rounded-sm p-4 hover:border-black transition-colors group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium text-black text-sm flex-1 min-w-0 truncate">
                        {text.title}
                      </h3>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEditText(text)}
                          className="p-1 rounded hover:bg-gray-100"
                          title="Edit"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteText(text.id)}
                          className="p-1 rounded hover:bg-gray-100"
                          title="Delete"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    <p className="text-gray-600 text-xs font-light mb-3 line-clamp-3">
                      {text.content.substring(0, 100)}...
                    </p>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => onPracticeText(text)}
                        className="px-3 py-1 bg-black text-white text-xs uppercase tracking-wider font-medium hover:bg-gray-800 transition-colors"
                      >
                        Practice
                      </button>
                      <select
                        value={text.folderId}
                        onChange={(e) => handleMoveText(text.id, e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-black"
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
          <div className="bg-white rounded-sm max-w-md w-full p-6">
            <h3 className="text-lg font-light text-black mb-4">New Folder</h3>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Folder name"
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-black mb-4"
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowNewFolderModal(false);
                  setNewItemName('');
                }}
                className="px-4 py-2 border border-gray-300 hover:border-black transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newItemName.trim()}
                className="px-4 py-2 bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 transition-colors text-sm"
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
          <div className="bg-white rounded-sm max-w-2xl w-full p-6">
            <h3 className="text-lg font-light text-black mb-4">New Text</h3>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Title"
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-black mb-3"
              autoFocus
            />
            <textarea
              value={newTextContent}
              onChange={(e) => setNewTextContent(e.target.value)}
              placeholder="Paste your text here..."
              className="w-full h-64 px-3 py-2 border border-gray-300 focus:outline-none focus:border-black resize-none mb-4"
              style={{ fontFamily: 'monospace' }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowNewTextModal(false);
                  setNewItemName('');
                  setNewTextContent('');
                }}
                className="px-4 py-2 border border-gray-300 hover:border-black transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateText}
                disabled={!newItemName.trim() || !newTextContent.trim()}
                className="px-4 py-2 bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 transition-colors text-sm"
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
          <div className="bg-white rounded-sm max-w-2xl w-full p-6">
            <h3 className="text-lg font-light text-black mb-4">
              Edit {editingItem.content !== undefined ? 'Text' : 'Folder'}
            </h3>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder={editingItem.content !== undefined ? 'Title' : 'Folder name'}
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-black mb-3"
              autoFocus
            />
            {editingItem.content !== undefined && (
              <textarea
                value={newTextContent}
                onChange={(e) => setNewTextContent(e.target.value)}
                placeholder="Text content"
                className="w-full h-64 px-3 py-2 border border-gray-300 focus:outline-none focus:border-black resize-none mb-4"
                style={{ fontFamily: 'monospace' }}
              />
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingItem(null);
                  setNewItemName('');
                  setNewTextContent('');
                }}
                className="px-4 py-2 border border-gray-300 hover:border-black transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!newItemName.trim() || (editingItem.content !== undefined && !newTextContent.trim())}
                className="px-4 py-2 bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 transition-colors text-sm"
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
