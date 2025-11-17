import React, { useState, useMemo, useEffect, useRef } from 'react';

// A simple, self-contained Slider component to replace the external dependency.
const Slider = ({ sliderProps }) => {
  return (
    <div className="relative flex items-center select-none touch-none w-full h-5">
      <input
        type="range"
        className="w-full h-1 bg-gray-200 rounded-full appearance-none cursor-pointer"
        {...sliderProps}
      />
      {/* Basic styling for the slider thumb to make it consistent across browsers */}
      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          background: black;
          border-radius: 50%;
          cursor: pointer;
          margin-top: -3.5px; /* Vertically center the thumb on the track */
        }
        input[type=range]::-moz-range-thumb {
          width: 12px;
          height: 12px;
          background: black;
          border-radius: 50%;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};

export default function TextMemorisationApp({ initialText = '', onExit }) {
  const [text, setText] = useState(initialText);
  const [visibility, setVisibility] = useState(100);
  const [isEditing, setIsEditing] = useState(!initialText);
  const [fontSize, setFontSize] = useState(16);
  const [columnWidth, setColumnWidth] = useState(240);
  const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(5); // Speed from 1-10
  const [countdownProgress, setCountdownProgress] = useState(100);
  const [scrollPosition, setScrollPosition] = useState(0);
  const scrollContainerRef = useRef(null);
  const timeoutRef = useRef(null);
  const countdownRef = useRef(null);

  const processedText = useMemo(() => {
    if (!text) return '';

    // Calculate how many characters to hide
    const totalChars = text.replace(/\s/g, '').length;
    const charsToShow = Math.ceil(totalChars * (visibility / 100));

    // Create an array of all non-whitespace character positions
    const charPositions = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== ' ' && text[i] !== '\n' && text[i] !== '\t') {
        charPositions.push(i);
      }
    }

    // Distribute visible characters uniformly
    const visiblePositions = new Set();
    if (charsToShow > 0 && charPositions.length > 0) {
      const step = charPositions.length / charsToShow;
      for (let i = 0; i < charsToShow; i++) {
        const index = Math.floor(i * step);
        visiblePositions.add(charPositions[index]);
      }
    }

    // Build the output text
    let result = '';
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ' ' || text[i] === '\n' || text[i] === '\t') {
        result += text[i];
      } else if (visiblePositions.has(i)) {
        result += text[i];
      } else {
        result += '·';
      }
    }

    return result;
  }, [text, visibility]);

  const handleStartPractising = () => {
    if (text.trim()) {
      setIsEditing(false);
    }
  };

  const handleReset = () => {
    if (onExit) {
      onExit();
    } else {
      setIsEditing(true);
      setVisibility(100);
      setIsAutoAdvancing(false);
      setCountdownProgress(100);
      setScrollPosition(0);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = 0;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (countdownRef.current) {
        cancelAnimationFrame(countdownRef.current);
      }
    }
  };

  // Auto-advance columns with countdown
  useEffect(() => {
    // Clear any existing timers
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (countdownRef.current) cancelAnimationFrame(countdownRef.current);

    if (!isAutoAdvancing) {
      setCountdownProgress(100);
      return;
    }

    // Start countdown and scrolling
    // Speed 1 = 24 seconds, Speed 10 = 8 seconds
    // Formula: delay = 25778 - (speed * 1778)
    const delayMs = 25778 - (autoScrollSpeed * 1778);
    const startTime = Date.now();

    // Animate the countdown bar
    const updateCountdown = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / delayMs) * 100);
      setCountdownProgress(remaining);

      if (remaining > 0) {
        countdownRef.current = requestAnimationFrame(updateCountdown);
      }
    };

    updateCountdown();

    // Scroll after delay
    timeoutRef.current = setTimeout(() => {
      if (scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const columnWithGap = columnWidth + 48;
        const currentScroll = container.scrollLeft;
        const maxScroll = container.scrollWidth - container.clientWidth;

        if (currentScroll + columnWithGap <= maxScroll) {
          container.scrollLeft = currentScroll + columnWithGap;
        } else {
          container.scrollLeft = 0; // Loop to start (padding will show)
        }

        // Trigger re-run of this effect
        setScrollPosition(prev => prev + 1);
      }
    }, delayMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (countdownRef.current) cancelAnimationFrame(countdownRef.current);
    };
  }, [isAutoAdvancing, autoScrollSpeed, columnWidth, scrollPosition]);

  return (
    <div className="fixed inset-0 bg-white"
         style={{
           fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif',
           paddingTop: 'env(safe-area-inset-top, 0px)'
         }}>
      <div className="flex flex-col h-full">
        {isEditing ? (
          <div className="flex items-center justify-center h-full p-8">
            <div className="max-w-2xl w-full">
              <h1 className="text-3xl font-light text-black mb-2 tracking-tight">
                Text Memorisation
              </h1>
              <p className="text-sm text-gray-600 mb-8 font-light">
                A minimalist tool for learning text through progressive revelation
              </p>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-700 mb-3 font-medium">
                    Your Text
                  </label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste your text here..."
                    className="w-full h-64 p-4 border border-gray-300 bg-white text-black placeholder-gray-400 focus:outline-none focus:border-black resize-none"
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>
                <button
                  onClick={handleStartPractising}
                  disabled={!text.trim()}
                  className="w-full py-3 bg-black text-white font-light tracking-wide hover:bg-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors uppercase text-sm"
                >
                  Begin Practice
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Minimalist Control Bar */}
            <div className="border-b border-gray-200 bg-white px-4 py-2 flex items-center gap-6 flex-shrink-0">
              <button
                onClick={handleReset}
                className="text-black hover:text-gray-600 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
              </button>

              {/* Visibility */}
              <div className="flex items-center gap-3">
                <span className="text-xs uppercase tracking-wider text-gray-600 font-medium">Reveal</span>
                <div className="w-20">
                  <Slider
                    sliderProps={{
                      value: visibility,
                      onChange: (e) => setVisibility(parseInt(e.target.value)),
                      min: 0,
                      max: 100,
                      step: 5
                    }}
                  />
                </div>
                <span className="text-sm font-light text-black w-10 text-right">{visibility}%</span>
              </div>

              <div className="h-4 w-px bg-gray-200"/>

              {/* Text Size */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFontSize(Math.max(12, fontSize - 2))}
                  className="w-6 h-6 border border-gray-300 hover:border-black hover:bg-gray-50 transition-colors flex items-center justify-center"
                >
                  <span className="text-xs">−</span>
                </button>
                <span className="text-xs uppercase tracking-wider text-gray-600 font-medium px-1">Size</span>
                <button
                  onClick={() => setFontSize(Math.min(24, fontSize + 2))}
                  className="w-6 h-6 border border-gray-300 hover:border-black hover:bg-gray-50 transition-colors flex items-center justify-center"
                >
                  <span className="text-xs">+</span>
                </button>
              </div>

              <div className="h-4 w-px bg-gray-200"/>

              {/* Columns */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setColumnWidth(Math.min(320, columnWidth + 20))}
                  className="w-6 h-6 border border-gray-300 hover:border-black hover:bg-gray-50 transition-colors flex items-center justify-center"
                >
                  <span className="text-xs">−</span>
                </button>
                <span className="text-xs uppercase tracking-wider text-gray-600 font-medium px-1">Cols</span>
                <button
                  onClick={() => setColumnWidth(Math.max(200, columnWidth - 20))}
                  className="w-6 h-6 border border-gray-300 hover:border-black hover:bg-gray-50 transition-colors flex items-center justify-center"
                >
                  <span className="text-xs">+</span>
                </button>
              </div>

              <div className="flex-grow"/>

              {/* Column Navigation */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (!scrollContainerRef.current) return;
                    const container = scrollContainerRef.current;
                    const columnWithGap = columnWidth + 48;
                    const newScroll = Math.max(0, container.scrollLeft - columnWithGap);
                    container.scrollLeft = newScroll;
                  }}
                  className="text-black hover:text-gray-600 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M15 18l-6-6 6-6"/>
                  </svg>
                </button>
                <span className="text-sm font-light text-black">
                  Column
                </span>
                <button
                  onClick={() => {
                    if (!scrollContainerRef.current) return;
                    const container = scrollContainerRef.current;
                    const columnWithGap = columnWidth + 48;
                    const maxScroll = container.scrollWidth - container.clientWidth;
                    const newScroll = Math.min(maxScroll, container.scrollLeft + columnWithGap);
                    container.scrollLeft = newScroll;
                  }}
                  className="text-black hover:text-gray-600 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
              </div>

              <div className="h-4 w-px bg-gray-200"/>

              {/* Auto-Advance */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsAutoAdvancing(!isAutoAdvancing)}
                  className={`px-3 py-1 text-xs uppercase tracking-wider font-medium transition-colors ${
                    isAutoAdvancing
                      ? 'bg-black text-white hover:bg-gray-800'
                      : 'border border-gray-300 text-black hover:border-black hover:bg-gray-50'
                  }`}
                >
                  {isAutoAdvancing ? 'Stop' : 'Auto'}
                </button>
                <span className="text-xs uppercase tracking-wider text-gray-600 font-medium">Speed</span>
                <div className="w-32">
                  <Slider
                    sliderProps={{
                      value: autoScrollSpeed,
                      onChange: (e) => setAutoScrollSpeed(parseInt(e.target.value)),
                      min: 1,
                      max: 10,
                      step: 1
                    }}
                  />
                </div>
                <span className="text-sm font-light text-black w-4 text-right tabular-nums">{autoScrollSpeed}</span>
                <span className="text-xs text-gray-500">({Math.round((13000 - (autoScrollSpeed * 900)) / 1000)}s)</span>
              </div>
            </div>

            {/* Countdown visualizer */}
            {isAutoAdvancing && (
              <div className="h-2 bg-gray-300">
                <div
                  className="h-full bg-black"
                  style={{
                    width: `${countdownProgress}%`
                  }}
                />
              </div>
            )}

            {/* Text Display */}
            <div className="flex-grow bg-gray-50 overflow-hidden relative">
              <div
                ref={scrollContainerRef}
                className="h-full overflow-x-auto overflow-y-hidden p-8"
                style={{
                  scrollBehavior: 'smooth',
                  WebkitOverflowScrolling: 'touch',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none'
                }}>
                <div
                  className="text-black"
                  style={{
                    columnWidth: `${columnWidth}px`,
                    columnGap: '3rem',
                    columnRule: '1px solid #e5e7eb',
                    columnFill: 'auto',
                    width: 'max-content',
                    minWidth: '100%',
                    height: 'calc(100% - 20px)',
                    paddingBottom: '20px',
                    paddingLeft: `${columnWidth * 2}px` // Add 2 columns of padding at start
                  }}>
                  <pre className="whitespace-pre-wrap"
                       style={{
                         fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif',
                         fontSize: `${fontSize}px`,
                         lineHeight: '1.5',
                         margin: 0,
                         fontWeight: '300'
                       }}>
                    {processedText}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
