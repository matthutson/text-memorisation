import React, { useState, useEffect } from 'react';
import {
  getTexts,
  createText,
  updateText,
  deleteText,
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  getCachedFolders,
  getCachedTexts
} from '../utils/storage';
import QuillEditor from './QuillEditor';
import { Dialog, Button, Flex, Text, TextField, IconButton, Tooltip, Select } from '@radix-ui/themes';

export default function HomePage({ onPracticeText, isDarkMode, onToggleDarkMode }) {
  const [folders, setFolders] = useState(() => getCachedFolders() || []);
  const [selectedFolderId, setSelectedFolderId] = useState('all');
  const [allTexts, setAllTexts] = useState(() => {
    const cached = getCachedTexts();
    return cached ? cached.sort((a, b) => b.createdAt - a.createdAt) : [];
  });
  const [showNewTextModal, setShowNewTextModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showEditFolderModal, setShowEditFolderModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingFolder, setEditingFolder] = useState(null);
  const [newItemName, setNewItemName] = useState('');
  const [newTextArtist, setNewTextArtist] = useState('');
  const [newTextYoutubeUrl, setNewTextYoutubeUrl] = useState('');
  const [newTextUltimateGuitarUrl, setNewTextUltimateGuitarUrl] = useState('');
  const [newTextSoundsliceUrl, setNewTextSoundsliceUrl] = useState('');
  const [newTextContent, setNewTextContent] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [newTextFolderId, setNewTextFolderId] = useState('default');
  const [editingTextFolderId, setEditingTextFolderId] = useState('default');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const foldersData = await getFolders();
    setFolders(foldersData);
    const textsData = await getTexts();
    const sortedTexts = textsData.sort((a, b) => b.createdAt - a.createdAt);
    setAllTexts(sortedTexts);
  };

  const texts = selectedFolderId === 'all'
    ? allTexts
    : allTexts.filter(t => t.folderId === selectedFolderId);

  const handleCreateText = async () => {
    if (newItemName.trim() && newTextContent.trim()) {
      // Use selected folder if valid, otherwise default
      const folderId = newTextFolderId || (selectedFolderId === 'all' ? 'default' : selectedFolderId);
      await createText(
        newItemName.trim(),
        newTextContent.trim(),
        folderId,
        newTextArtist.trim(),
        newTextYoutubeUrl.trim(),
        '',
        '',
        '',
        [],
        newTextUltimateGuitarUrl.trim(),
        newTextSoundsliceUrl.trim()
      );
      setNewItemName('');
      setNewTextArtist('');
      setNewTextYoutubeUrl('');
      setNewTextUltimateGuitarUrl('');
      setNewTextSoundsliceUrl('');
      setNewTextContent('');
      setNewTextFolderId('default');
      setShowNewTextModal(false);
      await loadData();
    }
  };

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      await createFolder(newFolderName.trim());
      setNewFolderName('');
      setShowNewFolderModal(false);
      await loadData();
    }
  };

  const handleEditFolder = (folder) => {
    setEditingFolder(folder);
    setNewFolderName(folder.name);
    setShowEditFolderModal(true);
  };

  const handleSaveFolder = async () => {
    if (editingFolder && newFolderName.trim()) {
      await updateFolder(editingFolder.id, newFolderName.trim());
      setEditingFolder(null);
      setNewFolderName('');
      setShowEditFolderModal(false);
      await loadData();
    }
  };

  const handleDeleteFolder = async (folderId) => {
    if (confirm('Delete this folder? All texts will be moved to Uncategorized.')) {
      await deleteFolder(folderId);
      if (selectedFolderId === folderId) {
        setSelectedFolderId('all');
      }
      await loadData();
    }
  };

  const handleEditText = (text) => {
    setEditingItem(text);
    setNewItemName(text.title);
    setNewTextArtist(text.artist || '');
    setNewTextYoutubeUrl(text.youtubeUrl || '');
    setNewTextUltimateGuitarUrl(text.ultimateGuitarUrl || '');
    setNewTextSoundsliceUrl(text.soundsliceUrl || '');
    setNewTextContent(text.content);
    setEditingTextFolderId(text.folderId || 'default');
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (editingItem && newItemName.trim()) {
      await updateText(editingItem.id, {
        title: newItemName,
        artist: newTextArtist,
        youtubeUrl: newTextYoutubeUrl,
        ultimateGuitarUrl: newTextUltimateGuitarUrl,
        soundsliceUrl: newTextSoundsliceUrl,
        content: newTextContent,
        folderId: editingTextFolderId
      });
      setEditingItem(null);
      setNewItemName('');
      setNewTextArtist('');
      setNewTextYoutubeUrl('');
      setNewTextUltimateGuitarUrl('');
      setNewTextSoundsliceUrl('');
      setNewTextContent('');
      setShowEditModal(false);
      await loadData();
    }
  };

  const handleDeleteText = async (textId) => {
    if (confirm('Delete this text?')) {
      await deleteText(textId);
      await loadData();
    }
  };

  return (
    <div
      className="min-h-screen transition-colors"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif',
        backgroundColor: isDarkMode ? '#111827' : '#f9fafb'
      }}>
      {/* Header */}
      <div className={`border-b-custom px-3 md:px-6 py-3 md:py-5 flex items-center justify-between transition-colors relative z-30 ${isDarkMode ? 'border-blue-600 bg-gray-800' : 'border-black bg-white'
        }`}>
        <div className="flex items-center gap-2">
          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`md:hidden p-2 rounded-lg transition-colors ${isDarkMode
              ? 'hover:bg-gray-700 text-white'
              : 'hover:bg-gray-100 text-black'
              }`}
            aria-label="Toggle menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 className={`text-lg md:text-2xl font-bold uppercase tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-black'
            }`}>
            THE REPETOIRE
          </h1>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={onToggleDarkMode}
            className={`p-2 md:p-2.5 rounded-xl border-[1.5px] transition-colors ${isDarkMode
              ? 'border-gray-600 hover:bg-gray-700 text-gray-300'
              : 'border-gray-300 hover:bg-gray-100 text-gray-600'
              }`}
            title={isDarkMode ? 'Light mode' : 'Dark mode'}
          >
            {isDarkMode ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => {
              setNewTextFolderId(selectedFolderId === 'all' ? 'default' : selectedFolderId);
              setShowNewTextModal(true);
            }}
            className={`px-3 md:px-5 py-2 md:py-2.5 text-xs md:text-sm font-bold tracking-wide transition-colors uppercase rounded-xl border-[1.5px] ${isDarkMode
              ? 'bg-white text-black border-white hover:bg-gray-100'
              : 'bg-black text-white border-black hover:bg-gray-800'
              }`}
          >
            <span className="hidden sm:inline">New Text</span>
            <span className="sm:hidden">+</span>
          </button>
        </div>
      </div>

      {/* Mobile Sidebar Overlay - removed to keep screen visible */}

      {/* Main Layout with Sidebar */}
      <div className="flex">
        {/* Sidebar */}
        <div
          className={`
            w-64 border-r-2 min-h-screen
            ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-white'}
            transition-transform duration-300 ease-in-out
            fixed top-0 left-0 bottom-0 z-50
            md:sticky md:top-0 md:translate-x-0 md:z-0
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          `}
        >
          <div className="p-4">
            <div className="mb-4">
              <Button
                variant="outline"
                color="blue"
                size="3"
                style={{ width: '100%', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}
                onClick={() => setShowNewFolderModal(true)}
              >
                New Folder
              </Button>
            </div>

            {/* All Texts */}
            <div
              onClick={() => {
                setSelectedFolderId('all');
                setIsSidebarOpen(false);
              }}
              className={`px-4 py-3 rounded-xl cursor-pointer transition-all mb-2 border-[1.5px] ${selectedFolderId === 'all'
                ? isDarkMode
                  ? 'bg-blue-600 text-white border-blue-600 font-bold'
                  : 'bg-black text-white border-black font-bold'
                : isDarkMode
                  ? 'border-gray-700 text-blue-400 hover:border-gray-600 hover:bg-gray-700'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm">All Texts</span>
                <span className={`text-xs tabular-nums ${selectedFolderId === 'all'
                  ? ''
                  : isDarkMode ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                  {allTexts.length}
                </span>
              </div>
            </div>

            {/* Folder List */}
            <div className="space-y-1">
              {folders.map(folder => (
                <div
                  key={folder.id}
                  className={`px-4 py-3 rounded-xl transition-all border-[1.5px] group ${selectedFolderId === folder.id
                    ? isDarkMode
                      ? 'bg-blue-600 text-white border-blue-600 font-bold'
                      : 'bg-black text-white border-black font-bold'
                    : isDarkMode
                      ? 'border-gray-700 text-blue-400 hover:border-gray-600 hover:bg-gray-700'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-sm cursor-pointer flex-1"
                      onClick={() => {
                        setSelectedFolderId(folder.id);
                        setIsSidebarOpen(false);
                      }}
                    >
                      {folder.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className={`text-xs tabular-nums mr-2 ${selectedFolderId === folder.id
                        ? ''
                        : isDarkMode ? 'text-gray-500' : 'text-gray-400'
                        }`}>
                        {allTexts.filter(t => t.folderId === folder.id).length}
                      </span>
                      {folder.id !== 'default' && (
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ display: 'inline-flex', gap: '2px' }}>
                          <Tooltip content="Edit folder">
                            <IconButton
                              variant="ghost"
                              size="1"
                              color="gray"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditFolder(folder);
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </IconButton>
                          </Tooltip>
                          <Tooltip content="Delete folder">
                            <IconButton
                              variant="ghost"
                              size="1"
                              color="red"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFolder(folder.id);
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </IconButton>
                          </Tooltip>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 md:p-6">
          {selectedFolderId === 'all' ? (
            // Show folder cards when "All Texts" is selected
            allTexts.length === 0 ? (
              <div className="text-center py-16 md:py-24 px-4">
                <svg className={`mx-auto h-12 md:h-16 w-12 md:w-16 mb-4 md:mb-6 transition-colors ${isDarkMode ? 'text-gray-600' : 'text-gray-400'
                  }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className={`text-base md:text-lg font-light transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>No texts yet</p>
                <p className={`text-sm mt-2 transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-400'
                  }`}>Tap "+" to get started</p>
              </div>
            ) : (
              <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-4 mt-4">
                  {folders.map(folder => {
                    const folderTexts = allTexts.filter(t => t.folderId === folder.id);
                    return (
                      <div
                        key={folder.id}
                        onClick={() => setSelectedFolderId(folder.id)}
                        className={`rounded-xl md:rounded-2xl p-3 md:p-5 transition-all group hover:shadow-xl border-2 cursor-pointer ${isDarkMode
                          ? 'bg-gray-800 border-blue-500 hover:border-blue-400'
                          : 'bg-white border-gray-900 hover:border-gray-700'
                          }`}
                      >
                        <div className="flex items-start justify-between mb-2 md:mb-3">
                          <div className="flex-1 min-w-0">
                            <div className={`mb-2 md:mb-3 transition-colors ${isDarkMode ? 'text-blue-400' : 'text-blue-600'
                              }`}>
                              <svg className="w-5 h-5 md:w-8 md:h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                              </svg>
                            </div>
                            <h3 className={`font-bold text-sm md:text-lg transition-colors ${isDarkMode ? 'text-white' : 'text-black'
                              }`}>
                              {folder.name}
                            </h3>
                            <p className={`text-[11px] md:text-sm font-light mt-1 md:mt-2 transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                              {folderTexts.length} {folderTexts.length === 1 ? 'text' : 'texts'}
                            </p>
                          </div>
                        </div>
                        {folderTexts.length > 0 && (
                          <div className={`text-xs font-light transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-500'
                            }`}>
                            {folderTexts.slice(0, 3).map((t, idx) => (
                              <div key={t.id} className="truncate">
                                • {t.title}
                              </div>
                            ))}
                            {folderTexts.length > 3 && (
                              <div className="mt-1">+ {folderTexts.length - 3} more</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : (
            // Show text cards when a specific folder is selected
            texts.length === 0 ? (
              <div className="text-center py-16 md:py-24 px-4">
                <svg className={`mx-auto h-12 md:h-16 w-12 md:w-16 mb-4 md:mb-6 transition-colors ${isDarkMode ? 'text-gray-600' : 'text-gray-400'
                  }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className={`text-base md:text-lg font-light transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>No texts in this folder</p>
                <p className={`text-sm mt-2 transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-400'
                  }`}>Tap "+" to add a text</p>
              </div>
            ) : (
              <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-4 mt-4">
                  {texts.map(text => (
                    <div
                      key={text.id}
                      className={`rounded-xl md:rounded-2xl p-3 md:p-5 transition-all group hover:shadow-xl border-2 ${isDarkMode
                        ? 'bg-gray-800 border-blue-500 hover:border-blue-400'
                        : 'bg-white border-gray-900 hover:border-gray-700'
                        }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className={`font-bold text-sm md:text-base transition-colors ${isDarkMode ? 'text-white' : 'text-black'
                            }`}>
                            {text.title}
                          </h3>
                          {text.artist && (
                            <p className={`text-xs md:text-sm font-light truncate mt-1 transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                              {text.artist}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity ml-2">
                          <button
                            onClick={() => handleEditText(text)}
                            className={`p-2 rounded-xl transition-all ${isDarkMode
                              ? 'hover:bg-gray-700 text-gray-400 hover:text-white'
                              : 'hover:bg-gray-100 text-gray-600 hover:text-black'
                              }`}
                            title="Edit"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteText(text.id)}
                            className={`p-2 rounded-xl transition-all ${isDarkMode
                              ? 'hover:bg-red-900 text-gray-400 hover:text-red-400'
                              : 'hover:bg-red-50 text-gray-600 hover:text-red-600'
                              }`}
                            title="Delete"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* External Links */}
                      {(text.ultimateGuitarUrl || text.soundsliceUrl) && (
                        <div className="flex gap-2 mb-3">
                          {text.ultimateGuitarUrl && (
                            <a
                              href={text.ultimateGuitarUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`no-underline px-2 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg border-[1.5px] transition-all shadow-sm ${isDarkMode ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-500 hover:shadow-md' : 'bg-black text-white border-black hover:bg-gray-800 hover:shadow-md'
                                }`}
                              style={{ textDecoration: 'none' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              Ultimate Guitar
                            </a>
                          )}
                          {text.soundsliceUrl && (
                            <a
                              href={text.soundsliceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`no-underline px-2 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg border-[1.5px] transition-all shadow-sm ${isDarkMode ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-500 hover:shadow-md' : 'bg-black text-white border-black hover:bg-gray-800 hover:shadow-md'
                                }`}
                              style={{ textDecoration: 'none' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              Soundslice
                            </a>
                          )}
                        </div>
                      )}

                      <button
                        onClick={() => onPracticeText(text)}
                        className={`w-full px-4 py-3 text-xs md:text-sm font-bold uppercase tracking-wider transition-all rounded-xl shadow-md hover:shadow-lg ${isDarkMode
                          ? 'bg-blue-600 text-white hover:bg-blue-500'
                          : 'bg-black text-white hover:bg-gray-800'
                          }`}
                      >
                        Practice
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* New Folder Modal */}
      <Dialog.Root open={showNewFolderModal} onOpenChange={(open) => {
        setShowNewFolderModal(open);
        if (!open) setNewFolderName('');
      }}>
        <Dialog.Content maxWidth="400px">
          <Dialog.Title>New Folder</Dialog.Title>
          <Flex direction="column" gap="4" mt="4">
            <TextField.Root
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              size="3"
              autoFocus
            />
            <Flex gap="3" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray" size="2">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                size="2"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                Create
              </Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Edit Folder Modal */}
      <Dialog.Root open={showEditFolderModal && !!editingFolder} onOpenChange={(open) => {
        setShowEditFolderModal(open);
        if (!open) { setEditingFolder(null); setNewFolderName(''); }
      }}>
        <Dialog.Content maxWidth="400px">
          <Dialog.Title>Edit Folder</Dialog.Title>
          <Flex direction="column" gap="4" mt="4">
            <TextField.Root
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              size="3"
              autoFocus
            />
            <Flex gap="3" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray" size="2">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                size="2"
                onClick={handleSaveFolder}
                disabled={!newFolderName.trim()}
              >
                Save
              </Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* New Text Modal */}
      {
        showNewTextModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div
              className={`rounded-3xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto border-[1.5px] transition-colors ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'
                }`}>
              <h3 className={`text-xl font-semibold mb-5 transition-colors ${isDarkMode ? 'text-white' : 'text-black'
                }`}>New Text</h3>
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Title"
                className={`w-full px-4 py-3 border-[1.5px] rounded-xl focus:outline-none mb-4 transition-colors ${isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-400'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
                  }`}
                autoFocus
              />
              <input
                type="text"
                value={newTextArtist}
                onChange={(e) => setNewTextArtist(e.target.value)}
                placeholder="Artist (optional)"
                className={`w-full px-4 py-3 border-[1.5px] rounded-xl focus:outline-none mb-4 transition-colors ${isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-400'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
                  }`}
              />
              <input
                type="url"
                value={newTextYoutubeUrl}
                onChange={(e) => setNewTextYoutubeUrl(e.target.value)}
                placeholder="YouTube URL (optional)"
                className={`w-full px-4 py-3 border-[1.5px] rounded-xl focus:outline-none mb-4 transition-colors ${isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-400'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
                  }`}
              />
              <div className="grid grid-cols-2 gap-4 mb-4">
                <input
                  type="url"
                  value={newTextUltimateGuitarUrl}
                  onChange={(e) => setNewTextUltimateGuitarUrl(e.target.value)}
                  placeholder="Ultimate Guitar URL (optional)"
                  className={`w-full px-4 py-3 border-[1.5px] rounded-xl focus:outline-none transition-colors ${isDarkMode
                    ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-400'
                    : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
                    }`}
                />
                <input
                  type="url"
                  value={newTextSoundsliceUrl}
                  onChange={(e) => setNewTextSoundsliceUrl(e.target.value)}
                  placeholder="Soundslice URL (optional)"
                  className={`w-full px-4 py-3 border-[1.5px] rounded-xl focus:outline-none transition-colors ${isDarkMode
                    ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-400'
                    : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
                    }`}
                />
              </div>
              <div className="mb-4">
                <QuillEditor
                  value={newTextContent}
                  onChange={setNewTextContent}
                  placeholder="Paste your text here..."
                  isDarkMode={isDarkMode}
                />
              </div>
              <div className="mb-4">
                <Select.Root value={newTextFolderId} onValueChange={setNewTextFolderId} size="3">
                  <Select.Trigger style={{ width: '100%' }} />
                  <Select.Content>
                    <Select.Item value="default">Uncategorized</Select.Item>
                    {folders.filter(f => f.id !== 'default').map((folder) => (
                      <Select.Item key={folder.id} value={folder.id}>
                        {folder.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowNewTextModal(false);
                    setNewItemName('');
                    setNewTextArtist('');
                    setNewTextYoutubeUrl('');
                    setNewTextUltimateGuitarUrl('');
                    setNewTextSoundsliceUrl('');
                    setNewTextContent('');
                  }}
                  className={`px-5 py-2.5 rounded-xl border-[1.5px] text-sm font-bold uppercase tracking-wider transition-colors ${isDarkMode
                    ? 'border-gray-600 text-gray-200 hover:border-gray-500 hover:bg-gray-700'
                    : 'border-gray-300 text-black hover:border-black hover:bg-gray-50'
                    }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateText}
                  disabled={!newItemName.trim() || !newTextContent.trim()}
                  className={`px-5 py-2.5 rounded-xl border-[1.5px] text-sm font-bold uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isDarkMode
                    ? 'bg-white text-black border-white hover:bg-gray-100 disabled:hover:bg-white'
                    : 'bg-black text-white border-black hover:bg-gray-800 disabled:hover:bg-black'
                    }`}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Edit Modal */}
      {
        showEditModal && editingItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className={`rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto border-[1.5px] transition-colors ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'
              }`}>
              <h3 className={`text-xl font-semibold mb-5 transition-colors ${isDarkMode ? 'text-white' : 'text-black'
                }`}>
                Edit Text
              </h3>
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Title"
                className={`w-full px-4 py-3 border-[1.5px] rounded-xl focus:outline-none mb-3 transition-colors ${isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-400'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
                  }`}
                autoFocus
              />
              <input
                type="text"
                value={newTextArtist}
                onChange={(e) => setNewTextArtist(e.target.value)}
                placeholder="Artist (optional)"
                className={`w-full px-4 py-3 border-[1.5px] rounded-xl focus:outline-none mb-3 transition-colors ${isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-400'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
                  }`}
              />
              <input
                type="url"
                value={newTextYoutubeUrl}
                onChange={(e) => setNewTextYoutubeUrl(e.target.value)}
                placeholder="YouTube URL (optional)"
                className={`w-full px-4 py-3 border-[1.5px] rounded-xl focus:outline-none mb-3 transition-colors ${isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-400'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
                  }`}
              />
              <div className="grid grid-cols-2 gap-4 mb-3">
                <input
                  type="url"
                  value={newTextUltimateGuitarUrl}
                  onChange={(e) => setNewTextUltimateGuitarUrl(e.target.value)}
                  placeholder="Ultimate Guitar URL (optional)"
                  className={`w-full px-4 py-3 border-[1.5px] rounded-xl focus:outline-none transition-colors ${isDarkMode
                    ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-400'
                    : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
                    }`}
                />
                <input
                  type="url"
                  value={newTextSoundsliceUrl}
                  onChange={(e) => setNewTextSoundsliceUrl(e.target.value)}
                  placeholder="Soundslice URL (optional)"
                  className={`w-full px-4 py-3 border-[1.5px] rounded-xl focus:outline-none transition-colors ${isDarkMode
                    ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-400'
                    : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
                    }`}
                />
              </div>
              <div className="mb-5">
                <QuillEditor
                  value={newTextContent}
                  onChange={setNewTextContent}
                  placeholder="Text content"
                  isDarkMode={isDarkMode}
                />
              </div>
              <div className="mb-5">
                <Select.Root value={editingTextFolderId} onValueChange={setEditingTextFolderId} size="3">
                  <Select.Trigger style={{ width: '100%' }} />
                  <Select.Content>
                    <Select.Item value="default">Uncategorized</Select.Item>
                    {folders.filter(f => f.id !== 'default').map((folder) => (
                      <Select.Item key={folder.id} value={folder.id}>
                        {folder.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingItem(null);
                    setNewItemName('');
                    setNewTextArtist('');
                    setNewTextYoutubeUrl('');
                    setNewTextUltimateGuitarUrl('');
                    setNewTextSoundsliceUrl('');
                    setNewTextContent('');
                  }}
                  className={`px-5 py-2.5 border-[1.5px] rounded-xl text-sm font-bold uppercase tracking-wider transition-colors ${isDarkMode
                    ? 'border-gray-600 text-gray-200 hover:border-gray-500 hover:bg-gray-700'
                    : 'border-gray-300 text-black hover:border-black hover:bg-gray-50'
                    }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!newItemName.trim() || !newTextContent.trim()}
                  className={`px-5 py-2.5 text-sm font-bold uppercase tracking-wider transition-colors rounded-xl border-[1.5px] disabled:opacity-50 disabled:cursor-not-allowed ${isDarkMode
                    ? 'bg-white text-black border-white hover:bg-gray-100 disabled:hover:bg-white'
                    : 'bg-black text-white border-black hover:bg-gray-800 disabled:hover:bg-black'
                    }`}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}
