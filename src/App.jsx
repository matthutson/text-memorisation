import { useState } from 'react';
import HomePage from './components/HomePage';
import TextMemorisationApp from './components/TextMemorisationApp';

function App() {
  const [currentView, setCurrentView] = useState('home');
  const [currentText, setCurrentText] = useState(null);

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
        <HomePage onPracticeText={handlePracticeText} />
      ) : (
        <TextMemorisationApp
          initialText={currentText?.content || ''}
          onExit={handleExitPractice}
        />
      )}
    </>
  );
}

export default App;
