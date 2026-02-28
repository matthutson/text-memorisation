import React, { useState, useEffect } from 'react';
import { Theme } from '@radix-ui/themes';
import HomePage from './components/HomePage';
import TextMemorisationApp from './components/TextMemorisationApp';
import { getText } from './utils/storage';

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

function App() {
  const [currentView, setCurrentView] = useState('home');
  const [currentText, setCurrentText] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

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
    // Set loading to false after initial mount
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
    setCurrentView('practice');
  };

  const handleExitPractice = () => {
    setCurrentView('home');
    setCurrentText(null);
  };

  // Refresh current text data from database (useful after stems upload)
  const refreshCurrentText = async () => {
    if (currentText?.id) {
      console.log('[App] Refreshing text data from database for:', currentText.id);
      const updatedText = await getText(currentText.id);
      if (updatedText) {
        setCurrentText(updatedText);
      }
    }
  };

  if (isLoading) {
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

  return (
    <Theme appearance={isDarkMode ? 'dark' : 'light'} accentColor="gray" radius="medium" scaling="100%">
    <ErrorBoundary>
      {currentView === 'home' ? (
        <HomePage
          onPracticeText={handlePracticeText}
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
