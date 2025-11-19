import React, { useState, useEffect } from 'react';
import {
  getTexts,
  createText,
  updateText,
  deleteText
} from '../utils/storage';

export default function HomePage({ onPracticeText, isDarkMode, onToggleDarkMode }) {
  const [texts, setTexts] = useState([]);
  const [showNewTextModal, setShowNewTextModal] = useState(false);
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
    const textsData = await getTexts();
    // Sort by most recently created (descending)
    const sortedTexts = textsData.sort((a, b) => b.createdAt - a.createdAt);
    setTexts(sortedTexts);
  };

  const handleCreateText = async () => {
    if (newItemName.trim() && newTextContent.trim()) {
      await createText(newItemName.trim(), newTextContent.trim(), 'default', newTextArtist.trim(), newTextYoutubeUrl.trim(), '', '');
      setNewItemName('');
      setNewTextArtist('');
      setNewTextYoutubeUrl('');
      setNewTextContent('');
      setShowNewTextModal(false);
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

  const handleSaveEdit = async () => {
    if (editingItem && newItemName.trim()) {
      await updateText(editingItem.id, {
        title: newItemName,
        artist: newTextArtist,
        youtubeUrl: newTextYoutubeUrl,
        content: newTextContent
      });
      setEditingItem(null);
      setNewItemName('');
      setNewTextArtist('');
      setNewTextYoutubeUrl('');
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
    <div className={`min-h-screen transition-colors ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}
         style={{
           fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif'
         }}>
      {/* Header */}
      <div className={`border-b-[1.5px] px-6 py-5 flex items-center justify-between transition-colors ${
        isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-white'
      }`}>
        <div>
          <h1 className={`text-2xl font-light tracking-tight transition-colors ${
            isDarkMode ? 'text-white' : 'text-black'
          }`}>
            Text Memorisation
          </h1>
          <p className={`text-xs mt-1 transition-colors ${
            isDarkMode ? 'text-gray-400' : 'text-gray-500'
          }`}>Practice and learn</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleDarkMode}
            className={`p-2.5 rounded-xl border-[1.5px] transition-colors ${
              isDarkMode
                ? 'border-gray-600 hover:bg-gray-700 text-gray-300'
                : 'border-gray-300 hover:bg-gray-100 text-gray-600'
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
          <button
            onClick={() => setShowNewTextModal(true)}
            className={`px-5 py-2.5 text-sm font-bold tracking-wide transition-colors uppercase rounded-xl border-[1.5px] ${
              isDarkMode
                ? 'bg-white text-black border-white hover:bg-gray-100'
                : 'bg-black text-white border-black hover:bg-gray-800'
            }`}
          >
            New Text
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {texts.length === 0 ? (
          <div className="text-center py-24">
            <svg className={`mx-auto h-16 w-16 mb-6 transition-colors ${
              isDarkMode ? 'text-gray-600' : 'text-gray-400'
            }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <p className={`text-lg font-light transition-colors ${
              isDarkMode ? 'text-gray-400' : 'text-gray-500'
            }`}>No texts yet</p>
            <p className={`text-sm mt-2 transition-colors ${
              isDarkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>Click "New Text" to get started</p>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {texts.map(text => (
                <div
                  key={text.id}
                  className={`border-[1.5px] rounded-xl p-5 transition-all group hover:shadow-lg ${
                    isDarkMode
                      ? 'bg-gray-800 border-gray-700 hover:border-gray-500'
                      : 'bg-white border-gray-300 hover:border-black'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold text-base truncate transition-colors ${
                        isDarkMode ? 'text-white' : 'text-black'
                      }`}>
                        {text.title}
                      </h3>
                      {text.artist && (
                        <p className={`text-sm font-light truncate mt-1 transition-colors ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          {text.artist}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                      <button
                        onClick={() => handleEditText(text)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                        }`}
                        title="Edit"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteText(text.id)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                        }`}
                        title="Delete"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <p className={`text-sm font-light mb-4 line-clamp-3 transition-colors ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {text.content.substring(0, 120)}...
                  </p>
                  <button
                    onClick={() => onPracticeText(text)}
                    className={`w-full px-4 py-2.5 text-sm font-bold uppercase tracking-wider transition-colors rounded-xl border-[1.5px] ${
                      isDarkMode
                        ? 'bg-white text-black border-white hover:bg-gray-100'
                        : 'bg-black text-white border-black hover:bg-gray-800'
                    }`}
                  >
                    Practice
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* New Text Modal */}
      {showNewTextModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className={`rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto border-[1.5px] transition-colors ${
            isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'
          }`}>
            <h3 className={`text-xl font-semibold mb-5 transition-colors ${
              isDarkMode ? 'text-white' : 'text-black'
            }`}>New Text</h3>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Title"
              className={`w-full px-4 py-3 border-[1.5px] rounded-xl focus:outline-none mb-3 transition-colors ${
                isDarkMode
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
              className={`w-full px-4 py-3 border-[1.5px] rounded-xl focus:outline-none mb-3 transition-colors ${
                isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-400'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
              }`}
            />
            <input
              type="url"
              value={newTextYoutubeUrl}
              onChange={(e) => setNewTextYoutubeUrl(e.target.value)}
              placeholder="YouTube URL (optional)"
              className={`w-full px-4 py-3 border-[1.5px] rounded-xl focus:outline-none mb-3 transition-colors ${
                isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-400'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
              }`}
            />
            <textarea
              value={newTextContent}
              onChange={(e) => setNewTextContent(e.target.value)}
              placeholder="Paste your text here..."
              className={`w-full h-64 px-4 py-3 border-[1.5px] rounded-xl focus:outline-none resize-none mb-5 transition-colors ${
                isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-400'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
              }`}
              style={{ fontFamily: 'monospace' }}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowNewTextModal(false);
                  setNewItemName('');
                  setNewTextArtist('');
                  setNewTextYoutubeUrl('');
                  setNewTextContent('');
                }}
                className={`px-5 py-2.5 border-[1.5px] rounded-xl text-sm font-bold uppercase tracking-wider transition-colors ${
                  isDarkMode
                    ? 'border-gray-600 text-gray-200 hover:border-gray-500 hover:bg-gray-700'
                    : 'border-gray-300 text-black hover:border-black hover:bg-gray-50'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateText}
                disabled={!newItemName.trim() || !newTextContent.trim()}
                className={`px-5 py-2.5 text-sm font-bold uppercase tracking-wider transition-colors rounded-xl border-[1.5px] disabled:opacity-50 disabled:cursor-not-allowed ${
                  isDarkMode
                    ? 'bg-white text-black border-white hover:bg-gray-100 disabled:hover:bg-white'
                    : 'bg-black text-white border-black hover:bg-gray-800 disabled:hover:bg-black'
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
          <div className={`rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto border-[1.5px] transition-colors ${
            isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'
          }`}>
            <h3 className={`text-xl font-semibold mb-5 transition-colors ${
              isDarkMode ? 'text-white' : 'text-black'
            }`}>
              Edit Text
            </h3>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Title"
              className={`w-full px-4 py-3 border-[1.5px] rounded-xl focus:outline-none mb-3 transition-colors ${
                isDarkMode
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
              className={`w-full px-4 py-3 border-[1.5px] rounded-xl focus:outline-none mb-3 transition-colors ${
                isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-400'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
              }`}
            />
            <input
              type="url"
              value={newTextYoutubeUrl}
              onChange={(e) => setNewTextYoutubeUrl(e.target.value)}
              placeholder="YouTube URL (optional)"
              className={`w-full px-4 py-3 border-[1.5px] rounded-xl focus:outline-none mb-3 transition-colors ${
                isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-400'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
              }`}
            />
            <textarea
              value={newTextContent}
              onChange={(e) => setNewTextContent(e.target.value)}
              placeholder="Text content"
              className={`w-full h-64 px-4 py-3 border-[1.5px] rounded-xl focus:outline-none resize-none mb-5 transition-colors ${
                isDarkMode
                  ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:border-gray-400'
                  : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
              }`}
              style={{ fontFamily: 'monospace' }}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingItem(null);
                  setNewItemName('');
                  setNewTextArtist('');
                  setNewTextYoutubeUrl('');
                  setNewTextContent('');
                }}
                className={`px-5 py-2.5 border-[1.5px] rounded-xl text-sm font-bold uppercase tracking-wider transition-colors ${
                  isDarkMode
                    ? 'border-gray-600 text-gray-200 hover:border-gray-500 hover:bg-gray-700'
                    : 'border-gray-300 text-black hover:border-black hover:bg-gray-50'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!newItemName.trim() || !newTextContent.trim()}
                className={`px-5 py-2.5 text-sm font-bold uppercase tracking-wider transition-colors rounded-xl border-[1.5px] disabled:opacity-50 disabled:cursor-not-allowed ${
                  isDarkMode
                    ? 'bg-white text-black border-white hover:bg-gray-100 disabled:hover:bg-white'
                    : 'bg-black text-white border-black hover:bg-gray-800 disabled:hover:bg-black'
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
