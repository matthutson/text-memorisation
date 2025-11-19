import React, { useState, useEffect } from 'react';
import HomePage from './components/HomePage';
import TextMemorisationApp from './components/TextMemorisationApp';

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
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

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

  return (
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
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
        />
      )}
    </ErrorBoundary>
  );
}

export default App;
