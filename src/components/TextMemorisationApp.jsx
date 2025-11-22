import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Dropzone } from 'dropzone';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import AudioPlayer from 'osmd-audio-player';
import { updateText } from '../utils/storage';
import StemPlayerWrapper from './StemPlayerWrapper';

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

export default function TextMemorisationApp({ initialText = '', textData, onExit, onTextDataUpdate, isDarkMode, onToggleDarkMode }) {
  const [text, setText] = useState(initialText);
  const [stems, setStems] = useState(textData?.stems || []);

  // Sync stems from textData when it changes (e.g., after database update)
  useEffect(() => {
    console.log('[TextMemorisationApp] textData changed:', textData);
    console.log('[TextMemorisationApp] textData.stems:', textData?.stems);
    if (textData?.stems && textData.stems.length > 0) {
      console.log('[TextMemorisationApp] Loading stems from textData:', textData.stems);
      setStems(textData.stems);
    } else {
      console.log('[TextMemorisationApp] No stems found in textData');
    }
  }, [textData?.id, textData?.stems]); // Re-run when textData or stems change
  const [isStemPlayerVisible, setIsStemPlayerVisible] = useState(false);
  const [visibility, setVisibility] = useState(100);
  const [isEditing, setIsEditing] = useState(!initialText);
  const [fontSize, setFontSize] = useState(16);
  const [columnWidth, setColumnWidth] = useState(240);
  const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(5); // Speed from 1-10
  const [countdownProgress, setCountdownProgress] = useState(100);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [isMetronomeActive, setIsMetronomeActive] = useState(false);
  const [metronomeBPM, setMetronomeBPM] = useState(120);
  const [metronomeMeter, setMetronomeMeter] = useState(4);
  const [currentTab, setCurrentTab] = useState('text'); // 'text' or 'music'
  const [musicXMLFile, setMusicXMLFile] = useState(textData?.musicXML || '');
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const [uploadedImages, setUploadedImages] = useState(() => {
    if (!textData?.imageData) return [];
    try {
      const parsed = JSON.parse(textData.imageData);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Old format - single base64 string
      return textData.imageData ? [textData.imageData] : [];
    }
  });
  const scrollContainerRef = useRef(null);
  const osmdContainerRef = useRef(null);
  const osmdInstanceRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const timeoutRef = useRef(null);
  const countdownRef = useRef(null);
  const audioContextRef = useRef(null);
  const dropzoneRef = useRef(null);
  const dropzoneInstanceRef = useRef(null);

  // Metronome refs
  const metronomeWorkerRef = useRef(null);
  const currentTwelveletNoteRef = useRef(0);
  const nextNoteTimeRef = useRef(0.0);
  const notesInQueueRef = useRef([]);

  // Helper function to detect if a line is a chord line
  const isChordLine = (line) => {
    // Empty lines are not chord lines
    if (!line.trim()) return false;

    // Common chord patterns
    const chordPattern = /^[A-G](#|b)?(m|maj|min|dim|aug|sus|add)?\d*(\/[A-G](#|b)?)?$/;

    // Split by whitespace and check if most tokens are chords
    const tokens = line.trim().split(/\s+/);
    if (tokens.length === 0) return false;

    // Count how many tokens look like chords
    let chordCount = 0;
    for (const token of tokens) {
      if (chordPattern.test(token)) {
        chordCount++;
      }
    }

    // If more than 60% of tokens are chords, treat it as a chord line
    return chordCount / tokens.length > 0.6;
  };

  // Helper function to detect section markers like [Chorus], [Verse], etc.
  const isSectionMarker = (line) => {
    return /^\[.*\]$/.test(line.trim());
  };

  const processedText = useMemo(() => {
    if (!text) return [];

    // Split text into lines
    const lines = text.split('\n');

    // Identify which lines are chord lines or section markers
    const lineIsChord = lines.map(line => isChordLine(line));
    const lineIsSection = lines.map(line => isSectionMarker(line));

    // Build character position map (excluding chord lines and sections)
    const charPositions = [];
    let currentPos = 0;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];

      if (lineIsChord[lineIdx] || lineIsSection[lineIdx]) {
        // Skip chord lines and section markers when building character positions
        currentPos += line.length + 1; // +1 for newline
      } else {
        // Add non-whitespace character positions from lyric lines
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char !== ' ' && char !== '\t') {
            charPositions.push(currentPos + i);
          }
        }
        currentPos += line.length + 1; // +1 for newline
      }
    }

    // Calculate visible characters
    const charsToShow = Math.ceil(charPositions.length * (visibility / 100));

    // Distribute visible characters uniformly
    const visiblePositions = new Set();
    if (charsToShow > 0 && charPositions.length > 0) {
      const step = charPositions.length / charsToShow;
      for (let i = 0; i < charsToShow; i++) {
        const index = Math.floor(i * step);
        visiblePositions.add(charPositions[index]);
      }
    }

    // Build the output as React elements
    const result = [];
    currentPos = 0;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      let lineContent = '';

      if (lineIsChord[lineIdx]) {
        // Keep chord lines fully visible with special styling
        result.push(
          <div key={lineIdx} style={{ color: '#3b82f6', fontWeight: '400' }}>
            {line || ' '}
          </div>
        );
      } else if (lineIsSection[lineIdx]) {
        // Style section markers
        result.push(
          <div key={lineIdx} style={{ fontWeight: '500', marginTop: '1em', marginBottom: '0.5em' }}>
            {line}
          </div>
        );
      } else {
        // Process lyric lines with hiding
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === ' ' || char === '\t') {
            lineContent += char;
          } else if (visiblePositions.has(currentPos + i)) {
            lineContent += char;
          } else {
            lineContent += '·';
          }
        }
        result.push(<div key={lineIdx}>{lineContent || ' '}</div>);
      }

      currentPos += line.length + 1;
    }

    return result;
  }, [text, visibility]);

  const handleStartPractising = () => {
    if (text.trim()) {
      setIsEditing(false);
    }
  };

  const handleReset = () => {
    // Stop metronome when exiting
    if (isMetronomeActive) {
      setIsMetronomeActive(false);
    }
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

  // Metronome functionality - sophisticated version with Web Worker
  const maxBeats = () => metronomeMeter * 12;

  const nextTwelvelet = () => {
    const secondsPerBeat = 60.0 / metronomeBPM;
    nextNoteTimeRef.current += 0.08333 * secondsPerBeat;
    currentTwelveletNoteRef.current++;

    if (currentTwelveletNoteRef.current === maxBeats()) {
      currentTwelveletNoteRef.current = 0;
    }
  };

  const scheduleNote = (beatNumber, time) => {
    if (!audioContextRef.current) return;

    notesInQueueRef.current.push({ note: beatNumber, time: time });

    const osc = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);

    const masterVolume = 0.5;
    const noteLength = 0.02;

    if (beatNumber % maxBeats() === 0) {
      // Accent (first beat of measure) - higher pitch click
      osc.frequency.value = 2000;
      osc.type = 'square';
      gainNode.gain.setValueAtTime(0.7 * masterVolume, time);
      gainNode.gain.exponentialRampToValueAtTime(0.01, time + noteLength);
    } else if (beatNumber % 12 === 0) {
      // Quarter notes - regular click
      osc.frequency.value = 1500;
      osc.type = 'square';
      gainNode.gain.setValueAtTime(0.5 * masterVolume, time);
      gainNode.gain.exponentialRampToValueAtTime(0.01, time + noteLength);
    } else {
      gainNode.gain.value = 0; // Silence other subdivisions
    }

    osc.start(time);
    osc.stop(time + noteLength);
  };

  const metronomeScheduler = () => {
    if (!audioContextRef.current) return;

    const scheduleAheadTime = 0.1;
    while (nextNoteTimeRef.current < audioContextRef.current.currentTime + scheduleAheadTime) {
      scheduleNote(currentTwelveletNoteRef.current, nextNoteTimeRef.current);
      nextTwelvelet();
    }
  };

  // Initialize Dropzone
  useEffect(() => {
    if (!dropzoneRef.current || dropzoneInstanceRef.current) return;

    Dropzone.autoDiscover = false;

    const dropzone = new Dropzone(dropzoneRef.current, {
      url: '#', // We're not uploading to a server
      autoProcessQueue: false,
      acceptedFiles: 'image/*',
      maxFiles: null, // Allow unlimited files
      addRemoveLinks: true,
      dictDefaultMessage: 'Drop images here or click to upload',
      init: function () {
        this.on('addedfile', function (file) {
          // Convert to base64
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64data = reader.result;
            const newImages = [...uploadedImages, base64data];
            setUploadedImages(newImages);
            // Save to Supabase if we have textData
            if (textData?.id) {
              await updateText(textData.id, { imageData: JSON.stringify(newImages) });
            }
          };
          reader.readAsDataURL(file);
        });

        this.on('removedfile', async function (file) {
          // Find and remove the corresponding image
          const fileIndex = this.files.indexOf(file);
          const newImages = uploadedImages.filter((_, index) => index !== fileIndex);
          setUploadedImages(newImages);
          if (textData?.id) {
            await updateText(textData.id, { imageData: JSON.stringify(newImages) });
          }
        });
      }
    });

    dropzoneInstanceRef.current = dropzone;

    return () => {
      if (dropzoneInstanceRef.current) {
        dropzoneInstanceRef.current.destroy();
        dropzoneInstanceRef.current = null;
      }
    };
  }, [textData?.id]);

  // Initialize OpenSheetMusicDisplay when music XML is loaded
  useEffect(() => {
    if (currentTab !== 'music' || !musicXMLFile || !osmdContainerRef.current) {
      return;
    }

    // Clear previous instances
    if (osmdContainerRef.current) {
      osmdContainerRef.current.innerHTML = '';
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.stop();
      audioPlayerRef.current = null;
    }

    const osmd = new OpenSheetMusicDisplay(osmdContainerRef.current, {
      autoResize: true,
      backend: 'svg',
      drawTitle: false,
      drawComposer: false,
      drawCredits: false,
      drawingParameters: 'compacttight',
      followCursor: true,
      drawPartNames: false,
      drawPartAbbreviations: false,
      drawMeasureNumbers: true,
      drawTimeSignatures: true,
    });
    osmdInstanceRef.current = osmd;

    const loadScore = async () => {
      let objectUrl = null;
      try {
        // Fix for "toLowerCase" error:
        // Create a Blob from the string and load it as a URL.
        // This forces OSMD to treat it as a file download, which is its most robust path.
        const blob = new Blob([musicXMLFile], { type: 'application/xml' });
        objectUrl = URL.createObjectURL(blob);

        await osmd.load(objectUrl);
        await osmd.render();

        // Create and configure audio player
        const audioPlayer = new AudioPlayer();
        await audioPlayer.loadScore(osmd);

        // Set up event handler for playback end
        audioPlayer.on('playbackEnded', () => {
          setIsPlayingMusic(false);
        });

        // Store the audio player reference
        audioPlayerRef.current = audioPlayer;

      } catch (error) {
        console.error('Error loading music notation:', error);
        if (osmdContainerRef.current) {
          osmdContainerRef.current.innerHTML = `<div style="padding: 2rem; text-align: center; color: #ef4444;">Error loading music notation: ${error.message}</div>`;
        }
      } finally {
        // Clean up the object URL
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      }
    };

    loadScore();

    return () => {
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.stop();
        } catch (e) {
          console.warn('Error stopping audio player:', e);
        }
        audioPlayerRef.current = null;
      }
      osmdInstanceRef.current = null;
    };
  }, [currentTab, musicXMLFile]);

  // Handle MusicXML file upload
  const handleMusicXMLUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const xmlContent = e.target.result;
        setMusicXMLFile(xmlContent);
        if (textData?.id) {
          await updateText(textData.id, { musicXML: xmlContent });
        }
      };
      reader.readAsText(file);
    }
    // Reset the input so the same file can be selected again
    event.target.value = '';
  };

  // Handle removing MusicXML file
  const handleRemoveMusicXML = async () => {
    if (confirm('Remove the music notation file?')) {
      setMusicXMLFile('');
      if (textData?.id) {
        await updateText(textData.id, { musicXML: '' });
      }
      // Stop playback if active
      if (audioPlayerRef.current) {
        audioPlayerRef.current.stop();
        setIsPlayingMusic(false);
      }
    }
  };

  // Handle music playback
  const handlePlayPause = async () => {
    if (!audioPlayerRef.current) return;

    const player = audioPlayerRef.current;
    if (isPlayingMusic) {
      player.pause();
      setIsPlayingMusic(false);
    } else {
      try {
        await player.play();
        setIsPlayingMusic(true);
      } catch (error) {
        console.error('Error playing music:', error);
      }
    }
  };

  const handleStop = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.stop();
      setIsPlayingMusic(false);
    }
  };

  // Initialize metronome worker
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (!metronomeWorkerRef.current) {
      metronomeWorkerRef.current = new Worker('/metronome-worker.js');

      metronomeWorkerRef.current.onmessage = (e) => {
        if (e.data === "tick") {
          metronomeScheduler();
        }
      };

      metronomeWorkerRef.current.postMessage({ interval: 25.0 });
    }

    return () => {
      if (metronomeWorkerRef.current) {
        metronomeWorkerRef.current.postMessage("stop");
        metronomeWorkerRef.current.terminate();
        metronomeWorkerRef.current = null;
      }
    };
  }, []);

  // Control metronome playback
  useEffect(() => {
    if (!metronomeWorkerRef.current || !audioContextRef.current) return;

    if (isMetronomeActive) {
      currentTwelveletNoteRef.current = 0;
      nextNoteTimeRef.current = audioContextRef.current.currentTime;
      metronomeWorkerRef.current.postMessage("start");
    } else {
      metronomeWorkerRef.current.postMessage("stop");
    }
  }, [isMetronomeActive]);

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
    <div className={`fixed inset-0 transition-colors ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif',
        paddingTop: 'env(safe-area-inset-top, 0px)'
      }}>
      <div className="flex flex-col h-full">
        {isEditing ? (
          <div className="flex items-center justify-center h-full p-4 md:p-8">
            <div className="max-w-2xl w-full">
              <h1 className={`text-3xl font-light mb-2 tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-black'
                }`}>
                Text Memorisation
              </h1>
              <p className={`text-sm mb-8 font-light transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                A minimalist tool for learning text through progressive revelation
              </p>
              <div className="space-y-6">
                <div>
                  <label className={`block text-xs uppercase tracking-wider mb-3 font-medium transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-700'
                    }`}>
                    Your Text
                  </label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste your text here..."
                    className={`w-full h-64 p-4 border-[1.5px] focus:outline-none resize-none transition-colors ${isDarkMode
                      ? 'border-gray-700 bg-gray-800 text-white placeholder-gray-500 focus:border-gray-600'
                      : 'border-gray-300 bg-white text-black placeholder-gray-400 focus:border-black'
                      }`}
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>
                <button
                  onClick={handleStartPractising}
                  disabled={!text.trim()}
                  className={`w-full py-3 font-light tracking-wide disabled:cursor-not-allowed transition-colors uppercase text-sm ${isDarkMode
                    ? 'bg-gray-700 text-white hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50'
                    : 'bg-black text-white hover:bg-gray-900 disabled:bg-gray-300'
                    }`}
                >
                  Begin Practice
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Minimalist Control Bar */}
            <div className={`border-b px-2 md:px-4 py-2 flex items-center gap-2 md:gap-6 flex-shrink-0 flex-wrap transition-colors ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
              }`}>
              <button
                onClick={handleReset}
                className={`transition-colors ${isDarkMode ? 'text-white hover:text-gray-400' : 'text-black hover:text-gray-600'
                  }`}
                title="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Tab switcher */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentTab('text')}
                  className={`px-3 py-1 text-xs uppercase tracking-wider font-medium transition-colors ${currentTab === 'text'
                    ? (isDarkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-black')
                    : (isDarkMode
                      ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                      : 'text-gray-600 hover:text-black hover:bg-gray-100')
                    }`}
                >
                  Text
                </button>
                <button
                  onClick={() => setCurrentTab('music')}
                  className={`px-3 py-1 text-xs uppercase tracking-wider font-medium transition-colors ${currentTab === 'music'
                    ? (isDarkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-black')
                    : (isDarkMode
                      ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                      : 'text-gray-600 hover:text-black hover:bg-gray-100')
                    }`}
                >
                  Music
                </button>
              </div>

              <div className={`h-4 w-px hidden md:block transition-colors ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                }`} />

              {/* Dark mode toggle */}
              <button
                onClick={onToggleDarkMode}
                className={`transition-colors ${isDarkMode ? 'text-white hover:text-gray-400' : 'text-black hover:text-gray-600'
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

              {/* Stem Player Toggle */}
              <button
                onClick={() => setIsStemPlayerVisible(!isStemPlayerVisible)}
                className={`px-3 py-1 text-xs uppercase tracking-wider font-medium transition-colors ${isStemPlayerVisible
                  ? (isDarkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-black')
                  : (isDarkMode
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                    : 'text-gray-600 hover:text-black hover:bg-gray-100')
                  }`}
                title={isStemPlayerVisible ? 'Hide Backing Tracks' : 'Show Backing Tracks'}
              >
                {isStemPlayerVisible ? 'Hide' : 'Show'} Backing Tracks
              </button>

              {currentTab === 'text' && (
                <>
                  <div className={`h-4 w-px hidden md:block transition-colors ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                    }`} />

                  {/* Visibility */}
                  <div className="flex items-center gap-2 md:gap-3">
                    <span className={`text-xs uppercase tracking-wider font-medium transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>Reveal</span>
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
                    <span className={`text-sm font-light w-10 text-right transition-colors ${isDarkMode ? 'text-white' : 'text-black'
                      }`}>{visibility}%</span>
                  </div>
                </>
              )}

              {currentTab === 'text' && (
                <>
                  <div className={`h-4 w-px hidden md:block transition-colors ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                    }`} />

                  {/* Text Size */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setFontSize(Math.max(12, fontSize - 2))}
                      className={`w-6 h-6 border-[1.5px] transition-colors flex items-center justify-center ${isDarkMode
                        ? 'border-gray-600 hover:border-gray-500 hover:bg-gray-700'
                        : 'border-gray-300 hover:border-black hover:bg-gray-50'
                        }`}
                    >
                      <span className="text-xs">−</span>
                    </button>
                    <span className={`text-xs uppercase tracking-wider font-medium px-1 transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>Font Size</span>
                    <button
                      onClick={() => setFontSize(Math.min(24, fontSize + 2))}
                      className={`w-6 h-6 border-[1.5px] transition-colors flex items-center justify-center ${isDarkMode
                        ? 'border-gray-600 hover:border-gray-500 hover:bg-gray-700'
                        : 'border-gray-300 hover:border-black hover:bg-gray-50'
                        }`}
                    >
                      <span className="text-xs">+</span>
                    </button>
                  </div>

                  <div className={`h-4 w-px hidden md:block transition-colors ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                    }`} />

                  {/* Columns */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setColumnWidth(Math.min(320, columnWidth + 20))}
                      className={`w-6 h-6 border-[1.5px] transition-colors flex items-center justify-center ${isDarkMode
                        ? 'border-gray-600 hover:border-gray-500 hover:bg-gray-700'
                        : 'border-gray-300 hover:border-black hover:bg-gray-50'
                        }`}
                    >
                      <span className="text-xs">−</span>
                    </button>
                    <span className={`text-xs uppercase tracking-wider font-medium px-1 transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>Column Width</span>
                    <button
                      onClick={() => setColumnWidth(Math.max(200, columnWidth - 20))}
                      className={`w-6 h-6 border-[1.5px] transition-colors flex items-center justify-center ${isDarkMode
                        ? 'border-gray-600 hover:border-gray-500 hover:bg-gray-700'
                        : 'border-gray-300 hover:border-black hover:bg-gray-50'
                        }`}
                    >
                      <span className="text-xs">+</span>
                    </button>
                  </div>

                  <div className="flex-grow" />

                  {/* Column Navigation */}
                  <div className="flex items-center gap-2 md:gap-3">
                    <button
                      onClick={() => {
                        if (!scrollContainerRef.current) return;
                        const container = scrollContainerRef.current;
                        const columnWithGap = columnWidth + 48;
                        const newScroll = Math.max(0, container.scrollLeft - columnWithGap);
                        container.scrollLeft = newScroll;
                      }}
                      className={`transition-colors ${isDarkMode ? 'text-white hover:text-gray-400' : 'text-black hover:text-gray-600'
                        }`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                    <span className={`text-sm font-light hidden sm:inline transition-colors ${isDarkMode ? 'text-white' : 'text-black'
                      }`}>
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
                      className={`transition-colors ${isDarkMode ? 'text-white hover:text-gray-400' : 'text-black hover:text-gray-600'
                        }`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                  </div>

                  <div className={`h-4 w-px hidden md:block transition-colors ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                    }`} />

                  {/* Auto-Advance */}
                  <div className="flex items-center gap-2 md:gap-3">
                    <button
                      onClick={() => setIsAutoAdvancing(!isAutoAdvancing)}
                      className={`px-3 py-1 text-xs uppercase tracking-wider font-medium transition-colors ${isAutoAdvancing
                        ? (isDarkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-black text-white hover:bg-gray-800')
                        : (isDarkMode
                          ? 'border border-gray-600 text-gray-200 hover:border-gray-500 hover:bg-gray-700'
                          : 'border border-gray-300 text-black hover:border-black hover:bg-gray-50')
                        }`}
                    >
                      {isAutoAdvancing ? 'Stop' : 'Auto'}
                    </button>
                    <span className={`text-xs uppercase tracking-wider font-medium hidden sm:inline transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>Speed</span>
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
                    <span className={`text-sm font-light w-4 text-right tabular-nums transition-colors ${isDarkMode ? 'text-white' : 'text-black'
                      }`}>{autoScrollSpeed}</span>
                    <span className={`text-xs hidden sm:inline transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-500'
                      }`}>({Math.round((13000 - (autoScrollSpeed * 900)) / 1000)}s)</span>
                  </div>

                  <div className={`h-4 w-px hidden md:block transition-colors ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                    }`} />
                </>
              )}

              {/* Metronome */}
              <div className="flex items-center gap-2 md:gap-3">
                <button
                  onClick={() => setIsMetronomeActive(prev => !prev)}
                  className={`px-3 py-1 text-xs uppercase tracking-wider font-medium min-w-[48px] rounded-xl transition-colors ${isMetronomeActive
                    ? (isDarkMode ? 'bg-green-700 text-white hover:bg-green-600' : 'bg-green-800 text-white hover:bg-green-900')
                    : (isDarkMode
                      ? 'border border-gray-600 text-gray-200 hover:border-gray-500 hover:bg-gray-700'
                      : 'border border-gray-300 text-black hover:border-black hover:bg-gray-50')
                    }`}
                  title={isMetronomeActive ? 'Stop metronome' : 'Start metronome'}
                >
                  {isMetronomeActive ? 'ON' : 'OFF'}
                </button>
                <input
                  type="number"
                  value={metronomeBPM}
                  onChange={(e) => setMetronomeBPM(Math.max(20, Math.min(250, parseInt(e.target.value) || 120)))}
                  className={`w-16 px-2 py-1 text-sm text-center border-[1.5px] focus:outline-none transition-colors ${isDarkMode
                    ? 'border-gray-600 bg-gray-700 text-white focus:border-gray-500'
                    : 'border-gray-300 bg-white text-black focus:border-black'
                    }`}
                  min="20"
                  max="250"
                  title="BPM"
                />
                <span className={`text-xs hidden sm:inline transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-500'
                  }`}>bpm</span>
                <input
                  type="number"
                  value={metronomeMeter}
                  onChange={(e) => setMetronomeMeter(Math.max(1, Math.min(12, parseInt(e.target.value) || 4)))}
                  className={`w-12 px-2 py-1 text-sm text-center border-[1.5px] focus:outline-none transition-colors ${isDarkMode
                    ? 'border-gray-600 bg-gray-700 text-white focus:border-gray-500'
                    : 'border-gray-300 bg-white text-black focus:border-black'
                    }`}
                  min="1"
                  max="12"
                  title="Time signature (beats per measure)"
                />
                <span className={`text-xs hidden sm:inline transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-500'
                  }`}>/4</span>
              </div>
            </div>

            {/* Countdown visualizer */}
            {isAutoAdvancing && (
              <div className={`h-2 transition-colors ${isDarkMode ? 'bg-gray-700' : 'bg-gray-300'}`}>
                <div
                  className={`h-full transition-colors ${isDarkMode ? 'bg-gray-500' : 'bg-black'}`}
                  style={{
                    width: `${countdownProgress}%`
                  }}
                />
              </div>
            )}

            {/* Main Content Area with Stem Player Sidebar */}
            <div className="flex-1 flex overflow-hidden">
              {/* Stem Player Sidebar - always mounted but conditionally visible */}
              <StemPlayerWrapper
                stems={stems}
                setStems={setStems}
                textId={textData?.id}
                isDarkMode={isDarkMode}
                isVisible={isStemPlayerVisible}
                onStemsUpdate={onTextDataUpdate}
              />

              {/* Main Content */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Text Display */}
                <div className={`flex-grow overflow-hidden relative transition-colors ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
                  }`}>
                  {/* YouTube embed in top-left corner */}
                  {textData?.youtubeUrl && (
                    <div style={{
                      position: 'absolute',
                      top: '20px',
                      left: '20px',
                      width: '300px',
                      zIndex: 10,
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        position: 'relative',
                        paddingBottom: '56.25%',
                        height: 0
                      }}>
                        <iframe
                          src={`${textData.youtubeUrl.replace('watch?v=', 'embed/')}?loop=1&playlist=${textData.youtubeUrl.split('v=')[1]?.split('&')[0]}`}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%'
                          }}
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          title="YouTube video"
                        />
                      </div>
                    </div>
                  )}

                  {/* Text Tab Content */}
                  {currentTab === 'text' && (
                    <div
                      ref={scrollContainerRef}
                      className="h-full overflow-x-auto overflow-y-hidden p-8"
                      style={{
                        scrollBehavior: 'smooth',
                        WebkitOverflowScrolling: 'touch',
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                        backgroundColor: isDarkMode ? '#111827' : '#ffffff'
                      }}>
                      <div
                        className={`transition-colors ${isDarkMode ? 'text-white' : 'text-black'}`}
                        style={{
                          columnWidth: `${columnWidth}px`,
                          columnGap: '3rem',
                          columnRule: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                          columnFill: 'auto',
                          width: 'max-content',
                          minWidth: '100%',
                          height: 'calc(100% - 20px)',
                          paddingBottom: '20px',
                          paddingLeft: `${columnWidth * 2}px` // Add 2 columns of padding at start
                        }}>
                        {/* Song info header */}
                        {textData && (textData.title || textData.artist) && (
                          <div style={{
                            marginBottom: '2rem',
                            paddingBottom: '1rem',
                            borderBottom: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb'
                          }}>
                            {textData.title && (
                              <div style={{ fontSize: '1.5em', fontWeight: '500', marginBottom: '0.25rem' }}>
                                {textData.title}
                              </div>
                            )}
                            {textData.artist && (
                              <div style={{
                                fontSize: '1.1em',
                                fontWeight: '300',
                                color: isDarkMode ? '#9ca3af' : '#6b7280',
                                marginBottom: '0.5rem'
                              }}>
                                {textData.artist}
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif',
                          fontSize: `${fontSize}px`,
                          lineHeight: '1.5',
                          margin: 0,
                          fontWeight: '300',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {processedText}
                        </div>

                        {/* Reference Material Section */}
                        <div style={{
                          marginTop: '3rem',
                          breakBefore: 'column',
                          pageBreakBefore: 'always',
                          width: `${columnWidth * 8}px`
                        }}>
                          {/* Container for images and dropzone side-by-side */}
                          <div style={{
                            display: 'flex',
                            flexDirection: 'row',
                            gap: '2rem',
                            alignItems: 'flex-start',
                            width: '100%'
                          }}>
                            {/* Display uploaded images */}
                            {uploadedImages.length > 0 && (
                              <div style={{
                                display: 'flex',
                                flexDirection: 'row',
                                gap: '2rem',
                                flex: '1',
                                alignItems: 'flex-start'
                              }}>
                                {uploadedImages.map((image, index) => (
                                  <div key={index} style={{
                                    flex: '1',
                                    minWidth: `${columnWidth * 3}px`
                                  }}>
                                    {index === 0 && (
                                      <div style={{
                                        fontSize: '1em',
                                        fontWeight: '500',
                                        marginBottom: '1rem',
                                        opacity: 0.7
                                      }}>
                                        Reference Images
                                      </div>
                                    )}
                                    <img
                                      src={image}
                                      alt={`Reference material ${index + 1}`}
                                      style={{
                                        width: '100%',
                                        height: 'calc(100vh - 180px)',
                                        objectFit: 'contain',
                                        border: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                                        borderRadius: '12px'
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Dropzone uploader - positioned to the right of images */}
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              width: uploadedImages.length > 0 ? `${columnWidth * 2}px` : '100%',
                              maxWidth: uploadedImages.length > 0 ? `${columnWidth * 2}px` : '600px',
                              margin: uploadedImages.length === 0 ? '0 auto' : '0'
                            }}>
                              <div style={{
                                fontSize: '1em',
                                fontWeight: '500',
                                marginBottom: '1rem',
                                opacity: 0.7,
                                textAlign: uploadedImages.length > 0 ? 'left' : 'center'
                              }}>
                                Upload Images
                              </div>
                              <form
                                ref={dropzoneRef}
                                className="dropzone"
                                style={{
                                  border: isDarkMode ? '2px dashed #4b5563' : '2px dashed #d1d5db',
                                  borderRadius: '12px',
                                  padding: '2rem',
                                  textAlign: 'center',
                                  cursor: 'pointer',
                                  backgroundColor: isDarkMode ? '#1f2937' : '#f9fafb',
                                  height: '240px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.875rem',
                                  color: isDarkMode ? '#d1d5db' : '#4b5563'
                                }}
                              >
                              </form>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Music Tab Content */}
                  {currentTab === 'music' && (
                    <div className="h-full overflow-y-auto" style={{
                      backgroundColor: isDarkMode ? '#111827' : '#ffffff'
                    }}>
                      <div className={`max-w-7xl mx-auto transition-colors ${isDarkMode ? 'text-white' : 'text-black'}`}>
                        {/* Simple Playback Controls - at the top below nav */}
                        {musicXMLFile && (
                          <div className={`border-b px-4 py-3 flex items-center gap-3 transition-colors ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
                            }`}>
                            <button
                              onClick={handlePlayPause}
                              className={`px-4 py-2 text-sm font-bold uppercase tracking-wider transition-colors ${isPlayingMusic
                                ? (isDarkMode ? 'bg-green-700 text-white hover:bg-green-600' : 'bg-green-800 text-white hover:bg-green-900')
                                : (isDarkMode
                                  ? 'bg-gray-700 text-white hover:bg-gray-600'
                                  : 'bg-black text-white hover:bg-gray-900')
                                }`}
                            >
                              {isPlayingMusic ? 'Pause' : 'Play'}
                            </button>
                            <button
                              onClick={handleStop}
                              className={`px-4 py-2 text-sm font-bold uppercase tracking-wider transition-colors ${isDarkMode
                                ? 'bg-gray-700 text-white hover:bg-gray-600'
                                : 'bg-black text-white hover:bg-gray-900'
                                }`}
                            >
                              Stop
                            </button>
                            <div className="ml-auto flex items-center gap-2">
                              <label className={`px-3 py-1 text-xs uppercase tracking-wider font-medium border cursor-pointer transition-colors ${isDarkMode
                                ? 'border-gray-600 text-gray-200 hover:border-gray-500 hover:bg-gray-700'
                                : 'border-gray-300 text-black hover:border-black hover:bg-gray-50'
                                }`}>
                                <input
                                  type="file"
                                  accept=".xml,.musicxml"
                                  onChange={handleMusicXMLUpload}
                                  className="hidden"
                                />
                                Replace File
                              </label>
                              <button
                                onClick={handleRemoveMusicXML}
                                className={`px-3 py-1 text-xs uppercase tracking-wider font-medium border-[1.5px] transition-colors ${isDarkMode
                                  ? 'border-red-600 text-red-400 hover:bg-red-900 hover:border-red-500'
                                  : 'border-red-300 text-red-600 hover:bg-red-50 hover:border-red-600'
                                  }`}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Content Area */}
                        <div className="p-8">
                          {/* Song info header */}
                          {textData && (textData.title || textData.artist) && (
                            <div style={{
                              marginBottom: '2rem',
                              paddingBottom: '1rem',
                              borderBottom: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb'
                            }}>
                              {textData.title && (
                                <div style={{ fontSize: '1.5em', fontWeight: '500', marginBottom: '0.25rem' }}>
                                  {textData.title}
                                </div>
                              )}
                              {textData.artist && (
                                <div style={{
                                  fontSize: '1.1em',
                                  fontWeight: '300',
                                  color: isDarkMode ? '#9ca3af' : '#6b7280',
                                  marginBottom: '0.5rem'
                                }}>
                                  {textData.artist}
                                </div>
                              )}
                            </div>
                          )}

                          {/* XML Upload Section */}
                          {!musicXMLFile && (
                            <div className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${isDarkMode ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-gray-50'
                              }`}>
                              <div className="mb-4">
                                <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                </svg>
                              </div>
                              <h3 className={`text-lg font-medium mb-2 transition-colors ${isDarkMode ? 'text-white' : 'text-black'
                                }`}>Upload MusicXML File</h3>
                              <p className={`text-sm mb-4 transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                }`}>
                                Upload a MusicXML (.xml or .musicxml) file to display sheet music notation
                              </p>
                              <label className={`inline-block px-4 py-2 border cursor-pointer transition-colors ${isDarkMode
                                ? 'border-gray-600 text-gray-200 hover:border-gray-500 hover:bg-gray-700'
                                : 'border-gray-300 text-black hover:border-black hover:bg-gray-50'
                                }`}>
                                <input
                                  type="file"
                                  accept=".xml,.musicxml"
                                  onChange={handleMusicXMLUpload}
                                  className="hidden"
                                />
                                Choose File
                              </label>
                            </div>
                          )}

                          {/* Sheet Music Display */}
                          {musicXMLFile && (
                            <div
                              ref={osmdContainerRef}
                              className={`border rounded-xl p-4 transition-colors ${isDarkMode ? 'border-gray-700 bg-white' : 'border-gray-300 bg-white'
                                }`}
                              style={{ minHeight: '400px' }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
