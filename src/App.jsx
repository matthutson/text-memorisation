import { useState, useEffect } from 'react';
import HomePage from './components/HomePage';
import TextMemorisationApp from './components/TextMemorisationApp';

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
    <>
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
    </>
  );
}

export default App;
