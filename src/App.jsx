import React, { useState, useEffect } from 'react';
import { Theme } from '@radix-ui/themes';
import HomePage from './components/HomePage';
import TextMemorisationApp from './components/TextMemorisationApp';
import { getText, getCachedTags } from './utils/storage';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red' }}>
          <h1>Something went wrong.</h1>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

// URL structure:
//   /                -> home, all songs
//   /tag/<tagId>     -> home, filtered to one tag
//   /song/<songId>   -> practice view for that song
// /folder/<id> still resolves, so links made before tags keep working.
const parseRoute = (pathname) => {
  const song = pathname.match(/^\/song\/([^/]+)\/?$/);
  if (song) return { view: 'practice', songId: decodeURIComponent(song[1]) };

  const tag = pathname.match(/^\/(?:tag|folder)\/([^/]+)\/?$/);
  if (tag) return { view: 'home', tagId: decodeURIComponent(tag[1]) };

  return { view: 'home', tagId: 'all' };
};

function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  const [currentText, setCurrentText] = useState(null);
  const [notFoundSongId, setNotFoundSongId] = useState(null);
  const [isLoading, setIsLoading] = useState(() => {
    // Skip loading screen if we have cached data
    return !getCachedTags();
  });
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  const navigate = (path, { replace = false } = {}) => {
    if (replace) {
      window.history.replaceState({ appNav: true }, '', path);
    } else {
      window.history.pushState({ appNav: true }, '', path);
    }
    setRoute(parseRoute(path));
  };

  // Back/forward navigation
  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Resolve the song for /song/<id> routes (deep links, refresh, back/forward)
  useEffect(() => {
    if (route.view !== 'practice') return;
    if (currentText?.id === route.songId) return;

    let cancelled = false;
    (async () => {
      const text = await getText(route.songId);
      if (cancelled) return;
      if (text) {
        setCurrentText(text);
      } else {
        setNotFoundSongId(route.songId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [route, currentText]);

  // Keep the tab title in sync with the current view
  useEffect(() => {
    if (route.view === 'practice' && currentText?.id === route.songId && currentText.title) {
      document.title = `${currentText.title} — The Repetoire`;
    } else {
      document.title = 'The Repetoire';
    }
  }, [route, currentText]);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    // Add or remove 'dark' class from document.documentElement
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (!isLoading) return;
    // Brief loading screen only on first visit (no cached data)
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
  };

  const handlePracticeText = (text) => {
    setCurrentText(text);
    navigate(`/song/${encodeURIComponent(text.id)}`);
  };

  const handleSelectTag = (tagId) => {
    navigate(tagId === 'all' ? '/' : `/tag/${encodeURIComponent(tagId)}`);
  };

  const handleExitPractice = () => {
    // If we navigated here within the app, going back returns to the exact
    // home view the user came from; on a deep link, fall back to the song's
    // first tag
    if (window.history.state?.appNav) {
      window.history.back();
    } else {
      const tagId = currentText?.tagIds?.[0];
      navigate(tagId ? `/tag/${encodeURIComponent(tagId)}` : '/', { replace: true });
    }
    // currentText stays cached so revisiting the same song skips the refetch
  };

  // Refresh current text data from database (useful after stems upload)
  const refreshCurrentText = async () => {
    if (currentText?.id) {
      console.log('[App] Refreshing text data from database for:', currentText.id);
      // Skip the cache: the change came from the fetcher, not from this tab
      const updatedText = await getText(currentText.id, { refresh: true });
      if (updatedText) {
        setCurrentText(updatedText);
      }
    }
  };

  const isPractice = route.view === 'practice';
  const practiceReady = isPractice && currentText?.id === route.songId;
  const songNotFound = isPractice && notFoundSongId === route.songId;

  if (isLoading || (isPractice && !practiceReady && !songNotFound)) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <h1 className={`text-4xl font-bold mb-4 transition-colors ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
            THE REPETOIRE
          </h1>
          <p className={`text-lg transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  if (isPractice && songNotFound) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <h1 className={`text-2xl font-bold mb-4 transition-colors ${isDarkMode ? 'text-white' : 'text-black'}`}>
            Song not found
          </h1>
          <button
            onClick={() => navigate('/', { replace: true })}
            className={`px-4 py-2 rounded-lg transition-colors ${isDarkMode
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <Theme appearance={isDarkMode ? 'dark' : 'light'} accentColor="blue" radius="medium" scaling="100%">
    <ErrorBoundary>
      {!isPractice ? (
        <HomePage
          onPracticeText={handlePracticeText}
          selectedTagId={route.tagId}
          onSelectTag={handleSelectTag}
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
        />
      ) : (
        <TextMemorisationApp
          initialText={currentText?.content || ''}
          textData={currentText}
          onExit={handleExitPractice}
          onTextDataUpdate={refreshCurrentText}
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
        />
      )}
    </ErrorBoundary>
    </Theme>
  );
}

export default App;
