import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import AudioPlayer from 'osmd-audio-player';
import { Flex, Button, IconButton, Slider as RadixSlider, Separator, Text, Tooltip } from '@radix-ui/themes';
import { isMissingColumn, updateText } from '../utils/storage';
import StemPlayerWrapper from './StemPlayerWrapper';
import SongPlayer from './SongPlayer';
import { loadBookmarks, saveBookmarks, sortBookmarks } from '../utils/bookmarks';
import { boolOr, loadSettings, numberOr, saveSettings } from '../utils/practiceSettings';
import { hasTiming, positionAt, timeAt, toAnchors, withAnchors } from '../utils/scrollTiming';

export default function TextMemorisationApp({ initialText = '', textData, onExit, onTextDataUpdate, isDarkMode, onToggleDarkMode }) {
  // How this song was left last time it was practised
  const songId = textData?.id;
  const stored = useMemo(() => loadSettings(songId), [songId]);
  // A size chosen by hand on a laptop means nothing on a phone, so sizes only
  // come back on the kind of screen they were set on
  const screenKind = window.innerWidth < 768 ? 'phone' : 'desktop';
  const saved = stored.screenKind && stored.screenKind !== screenKind
    ? { ...stored, fontSize: undefined, columnWidth: undefined, autoFit: undefined }
    : stored;

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
  const [isControlsExpanded, setIsControlsExpanded] = useState(false);
  const [isYouTubeVisible, setIsYouTubeVisible] = useState(false);
  const [visibility, setVisibility] = useState(() => numberOr(saved.visibility, 100, { min: 0, max: 100 }));
  const [isEditing, setIsEditing] = useState(!initialText);
  const [fontSize, setFontSize] = useState(() => numberOr(saved.fontSize, window.innerWidth < 768 ? 10 : 12, { min: 8, max: 40 }));
  // Words kept visible at the start of every line
  const [anchorWords, setAnchorWords] = useState(() => numberOr(saved.anchorWords, 2, { min: 0, max: 5 }));
  const [engine, setEngine] = useState(null); // the audio engine, owned by the transport bar
  const [bookmarks, setBookmarks] = useState(() => loadBookmarks(textData));
  const [isMarkMode, setIsMarkMode] = useState(false);
  const [isFollowing, setIsFollowing] = useState(() => boolOr(saved.isFollowing, true));
  const [activeLine, setActiveLine] = useState(null);
  const [jumpToken, setJumpToken] = useState(0); // bumped when a bookmark asks for a jump
  // The transport bar owns playback; the mixer needs the same engine
  const handleEngineReady = useCallback((instance) => setEngine(instance), []);
  // null means "not decided for this song", which reads as on once a track is
  // loaded: with a recording there is a right answer, so it need not be asked for
  const [autoScrollChoice, setAutoScrollChoice] = useState(
    () => (typeof saved.autoScroll === 'boolean' ? saved.autoScroll : null)
  );
  // Bookmarks say exactly where a line falls, so where they exist they steer.
  // Failing that, a loaded track can still pace the scroll by its own length.
  const isBookmarkDriven = isFollowing && bookmarks.length > 0;
  const isTrackTimed = !!engine?.duration && !isBookmarkDriven;
  const isAutoAdvancing = autoScrollChoice === null ? !!engine?.duration : autoScrollChoice;
  // A song that already fits the window has nothing to scroll, and saying so
  // is better than a button that looks broken
  const [hasOverflow, setHasOverflow] = useState(false);
  // The scroll as taught: where the page should be at particular moments
  // The song's own timing where the database can hold it, and this browser's
  // copy where it cannot: the column is a migration away and a phone is a poor
  // place to run one.
  const [scrollMap, setScrollMap] = useState(() => (
    (textData?.scrollMap?.length ? textData.scrollMap : stored.scrollMap) || []
  ));
  const [timingIsLocal, setTimingIsLocal] = useState(false);
  const [isTeaching, setIsTeaching] = useState(false);
  // A map taught before anchors existed is a list of holds, and turning those
  // into anchors needs to know how long the song is
  const anchors = useMemo(() => toAnchors(scrollMap, engine?.duration || 0), [scrollMap, engine?.duration]);

  const teachRef = useRef(null); // the finger's hold on the page, while teaching
  const dragRef = useRef(null); // a hand dragging the words along the track
  const swallowClickRef = useRef(false); // a drag is not a tap on a line
  const lastSeekRef = useRef(0);
  const [columnWidth, setColumnWidth] = useState(() => numberOr(saved.columnWidth, window.innerWidth < 768 ? 100 : 160, { min: 60, max: 2000 }));
  // Size the text to fill the window. A song sized by hand keeps that size.
  const [autoFit, setAutoFit] = useState(() => boolOr(saved.autoFit, true));
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(() => numberOr(saved.autoScrollSpeed, 5, { min: 1, max: 10 })); // Speed from 1-10
  const [countdownProgress, setCountdownProgress] = useState(100);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [isMetronomeActive, setIsMetronomeActive] = useState(false);
  const [metronomeBPM, setMetronomeBPM] = useState(() => numberOr(saved.metronomeBPM, 120, { min: 30, max: 300 }));
  const [metronomeMeter, setMetronomeMeter] = useState(() => numberOr(saved.metronomeMeter, 4, { min: 1, max: 12 }));
  const [currentTab, setCurrentTab] = useState('text'); // 'text' or 'music'
  const [musicXMLFile, setMusicXMLFile] = useState(textData?.musicXML || '');
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const scrollContainerRef = useRef(null);
  const lastJumpRef = useRef(0);
  const headerRef = useRef(null);
  const measureRef = useRef(null);
  const columnHostRef = useRef(null);
  const textHostRef = useRef(null);
  const fitDataRef = useRef({ lineTexts: [], groupSizes: [] });
  const osmdContainerRef = useRef(null);
  const osmdInstanceRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const timeoutRef = useRef(null);
  const countdownRef = useRef(null);
  const audioContextRef = useRef(null);

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

  // Per-line tracker: reports whether a character belongs to the first `wordCount`
  // words of that line. Those words stay visible at every reveal level so each
  // line keeps a starting cue.
  const createAnchorTracker = (wordCount) => {
    let wordsSeen = 0;
    let inWord = false;
    return (char) => {
      if (/\s/.test(char)) {
        inWord = false;
        return wordsSeen < wordCount;
      }
      if (!inWord) {
        inWord = true;
        wordsSeen += 1;
      }
      return wordsSeen <= wordCount;
    };
  };

  /**
   * A chord chart aligns chords by column: the chord sits at the same character
   * position as the syllable it belongs to. That only survives while the line
   * fits on one row. On a phone the words wrap and the chords, being a line of
   * their own, wrap somewhere else entirely.
   *
   * So the pair is rebuilt as a row of units, one per word, each carrying the
   * chords that were written above that word. A unit never breaks, so a line
   * only ever wraps between words, and every chord travels with its own word
   * however narrow the column gets.
   */
  const chordWordUnits = (chordText, lyricText) => {
    const chords = [];
    let cursor = 0;
    while (cursor < chordText.length) {
      if (/\s/.test(chordText[cursor])) { cursor += 1; continue; }
      const from = cursor;
      while (cursor < chordText.length && !/\s/.test(chordText[cursor])) cursor += 1;
      chords.push({ column: from, chord: chordText.slice(from, cursor) });
    }
    if (!chords.length) return null;

    // Each word, with the spaces that follow it, is one unbreakable unit
    const words = [];
    let at = 0;
    while (at < lyricText.length) {
      const from = at;
      while (at < lyricText.length && !/\s/.test(lyricText[at])) at += 1;
      const wordEnd = at;
      while (at < lyricText.length && /\s/.test(lyricText[at])) at += 1;
      words.push({ from, wordEnd, to: at, chords: [] });
    }
    if (!words.length) words.push({ from: 0, wordEnd: 0, to: 0, chords: [] });

    // A chord in the gap between two words belongs to the word it points at
    const trailing = [];
    chords.forEach(({ column, chord }) => {
      const inside = words.find(word => column >= word.from && column < word.wordEnd);
      if (inside) {
        inside.chords.push({ offset: column - inside.from, chord });
        return;
      }
      const next = words.find(word => word.from > column);
      if (next) next.chords.push({ offset: 0, chord });
      else trailing.push(chord);
    });

    const units = words.map(word => {
      const text = lyricText.slice(word.from, word.to);
      if (!word.chords.length) return [{ chord: '', words: text }];

      const cells = word.chords[0].offset > 0 ? [{ chord: '', words: text.slice(0, word.chords[0].offset) }] : [];
      word.chords.forEach((held, index) => {
        const next = word.chords[index + 1];
        cells.push({ chord: held.chord, words: text.slice(held.offset, next ? next.offset : undefined) });
      });
      return cells;
    });

    // Chords written past the end of the words still have to be seen
    if (trailing.length) units.push(trailing.map(chord => ({ chord, words: '' })));
    return units;
  };

  // Spread the visible characters evenly across all hideable ones
  const buildVisibleSet = (total, percentage) => {
    const visible = new Set();
    const count = Math.ceil(total * (percentage / 100));
    if (total <= 0 || count <= 0) return visible;
    const step = total / count;
    for (let i = 0; i < count; i++) {
      visible.add(Math.floor(i * step));
    }
    return visible;
  };

  const processedText = useMemo(() => {
    if (!text) return [];

    // Check if text is HTML (starts with < and contains tags)
    const isHtml = /^\s*<[^>]+>/.test(text) || text.includes('</p>') || text.includes('</div>');

    if (isHtml) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');

        // Only leaf blocks are lines. Quill wraps a pasted chord chart in a
        // code-block container, and counting that wrapper as a line makes the
        // whole song look like one enormous line to the fitter.
        const blockSelector = 'p, div, li, h1, h2, h3, h4, h5, h6';
        const blocks = Array.from(doc.body.querySelectorAll(blockSelector))
          .filter(block => !block.querySelector(blockSelector));
        const lineTexts = [];
        blocks.forEach((block, index) => {
          const textContent = block.textContent.trim();
          block.setAttribute('data-line-index', String(index));
          lineTexts[index] = textContent;
          if (!textContent) return;
          if (isChordLine(textContent)) {
            block.setAttribute('data-chord-line', 'true');
            block.style.color = '#3b82f6';
            block.style.fontWeight = '400';
          } else if (isSectionMarker(textContent)) {
            block.setAttribute('data-always-visible', 'true');
          }
        });

        // Text nodes inside chord lines and section markers are never hidden
        const makeWalker = () => document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
          acceptNode: (node) => {
            const parent = node.parentElement;
            if (parent && parent.closest('[data-chord-line="true"], [data-always-visible="true"]')) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }, false);

        // A "line" is the nearest block element, so the anchor words reset per line
        const lineOf = (node) => node.parentElement?.closest('p, div, li, h1, h2, h3, h4, h5, h6') || doc.body;

        // 1. Count the characters eligible to be hidden (excludes whitespace and anchor words)
        let hideableCount = 0;
        let currentLine = null;
        let isAnchor = createAnchorTracker(anchorWords);
        const countWalker = makeWalker();
        while (countWalker.nextNode()) {
          const node = countWalker.currentNode;
          const line = lineOf(node);
          if (line !== currentLine) {
            currentLine = line;
            isAnchor = createAnchorTracker(anchorWords);
          }
          const content = node.textContent;
          for (let i = 0; i < content.length; i++) {
            const char = content[i];
            const anchored = isAnchor(char);
            if (!/\s/.test(char) && !anchored) hideableCount++;
          }
        }

        // 2. Pick which of them stay visible
        const visiblePositions = buildVisibleSet(hideableCount, visibility);

        // 3. Apply hiding logic
        let hideableIndex = 0;
        currentLine = null;
        isAnchor = createAnchorTracker(anchorWords);
        const processWalker = makeWalker();
        while (processWalker.nextNode()) {
          const node = processWalker.currentNode;
          const line = lineOf(node);
          if (line !== currentLine) {
            currentLine = line;
            isAnchor = createAnchorTracker(anchorWords);
          }
          const content = node.textContent;
          let newContent = '';

          for (let i = 0; i < content.length; i++) {
            const char = content[i];
            const anchored = isAnchor(char);
            if (/\s/.test(char) || anchored) {
              newContent += char;
            } else {
              newContent += visiblePositions.has(hideableIndex) ? char : '·';
              hideableIndex++;
            }
          }

          node.textContent = newContent;
        }

        const isChordBlock = (block) => block?.getAttribute('data-chord-line') === 'true';
        const isSectionBlock = (block) => block?.hasAttribute('data-always-visible');

        // Fold each chord line into the words underneath it, so the two travel
        // together through a wrap instead of drifting apart
        const children = [];
        for (let at = 0; at < blocks.length; at += 1) {
          const block = blocks[at];
          const words = blocks[at + 1];
          const units = isChordBlock(block) && words && !isChordBlock(words) && !isSectionBlock(words)
            ? chordWordUnits(block.textContent, words.textContent)
            : null;

          if (!units) {
            children.push(block);
            continue;
          }

          const line = doc.createElement('div');
          line.setAttribute('data-line-index', words.getAttribute('data-line-index'));
          line.setAttribute('data-chord-index', block.getAttribute('data-line-index'));
          line.setAttribute('data-chord-row', '');
          units.forEach(cells => {
            // One word, and whatever chords were written above it. Nothing
            // inside a unit can break, so words stay whole.
            const unit = doc.createElement('span');
            unit.className = 'chord-word';
            cells.forEach(({ chord: name, words: text }) => {
              const cell = doc.createElement('span');
              cell.className = 'chord-cell';
              const chord = doc.createElement('span');
              chord.className = 'chord-cell-chord';
              chord.textContent = name || '\u00a0';
              const lyric = doc.createElement('span');
              lyric.className = 'chord-cell-words';
              lyric.textContent = text;
              cell.append(chord, lyric);
              unit.appendChild(cell);
            });
            line.appendChild(unit);
          });
          children.push(line);
          at += 1; // the words have been taken along with the chords
        }

        // A chord line and the words under it are one unit: wrap them so a
        // column break can never land between them. A section heading takes
        // the line that follows it along too, so it is never left dangling.
        // Grouping the leaves also flattens away any wrapper they sat in.

        const groupSizes = [];
        const wrapped = [];
        let index = 0;
        while (index < children.length) {
          const block = children[index];
          let size = 1;
          if (isSectionBlock(block) && children[index + 1]) {
            size = 2;
          } else if (isChordBlock(block) && children[index + 1]) {
            // A chord line with no words under it still leads the next line
            size = 2;
          }

          const group = doc.createElement('div');
          group.setAttribute('data-lyric-group', '');
          group.style.breakInside = 'avoid';
          group.style.pageBreakInside = 'avoid';
          for (let taken = 0; taken < size && index < children.length; taken++) {
            group.appendChild(children[index]);
            index += 1;
          }
          wrapped.push(group);
          groupSizes.push(size);
        }
        doc.body.replaceChildren(...wrapped);

        return { isHtml: true, content: doc.body.innerHTML, lineTexts, groupSizes };
      } catch (e) {
        console.error('Error parsing HTML:', e);
        // Fallback to plain text processing if parsing fails
      }
    }

    // Legacy Plain Text Processing
    // Split text into lines
    const lines = text.split('\n');

    // Classify every character: chord lines, section markers, whitespace and the
    // first `anchorWords` words of each lyric line are always visible
    const lineMeta = lines.map(line => {
      if (isChordLine(line)) return { type: 'chord' };
      if (isSectionMarker(line)) return { type: 'section' };

      const isAnchor = createAnchorTracker(anchorWords);
      const hideable = [];
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const anchored = isAnchor(char);
        hideable.push(char !== ' ' && char !== '\t' && !anchored);
      }
      return { type: 'lyric', hideable };
    });

    const hideableCount = lineMeta.reduce(
      (sum, meta) => meta.type === 'lyric' ? sum + meta.hideable.filter(Boolean).length : sum,
      0
    );

    const lineTexts = lines.map(line => line.trim());

    // Distribute visible characters uniformly across the hideable ones
    const visiblePositions = buildVisibleSet(hideableCount, visibility);

    // Build the output as React elements
    const result = [];
    let hideableIndex = 0;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const meta = lineMeta[lineIdx];
      let lineContent = '';

      if (meta.type === 'chord') {
        // Keep chord lines fully visible with special styling
        result.push(
          <div key={lineIdx} data-line-index={lineIdx} style={{ color: '#3b82f6', fontWeight: '400', lineHeight: '1.1', marginBottom: 0, paddingBottom: 0 }}>
            {line || ' '}
          </div>
        );
      } else if (meta.type === 'section') {
        // Style section markers
        result.push(
          <div key={lineIdx} data-line-index={lineIdx} style={{ fontWeight: '500', marginTop: '1em', marginBottom: '0.5em' }}>
            {line}
          </div>
        );
      } else {
        // Process lyric lines with hiding
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (!meta.hideable[i]) {
            lineContent += char;
          } else {
            lineContent += visiblePositions.has(hideableIndex) ? char : '·';
            hideableIndex++;
          }
        }
        result.push(<div key={lineIdx} data-line-index={lineIdx}>{lineContent || ' '}</div>);
      }
    }

    // Group the rendered lines the same way, so nothing splits mid-pair
    const groupSizes = [];
    const grouped = [];
    let cursor = 0;
    while (cursor < result.length) {
      const type = lineMeta[cursor]?.type;
      let size = 1;
      if (type === 'section') {
        if (lineMeta[cursor + 1]?.type === 'chord') size = 3;
        else if (result[cursor + 1]) size = 2;
      } else if (type === 'chord' && result[cursor + 1]) {
        size = 2;
      }
      grouped.push(
        <div key={`group-${cursor}`} data-lyric-group="" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          {result.slice(cursor, cursor + size)}
        </div>
      );
      groupSizes.push(size);
      cursor += size;
    }

    return { isHtml: false, content: grouped, lineTexts, groupSizes };
  }, [text, visibility, anchorWords]);

  // ---- Bookmarks: a moment in the audio tied to a line of the lyrics ------

  const persistBookmarks = (next) => {
    const sorted = sortBookmarks(next);
    setBookmarks(sorted);
    if (textData?.id) saveBookmarks(textData.id, sorted);
  };

  const labelForLine = (lineIndex) => {
    const source = processedText.lineTexts?.[lineIndex] || '';
    return source.split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
  };

  const markLine = (lineIndex) => {
    const time = engine?.currentTime;
    if (typeof time !== 'number') return;
    // One mark per line: marking again re-times the line
    const others = bookmarks.filter(bookmark => bookmark.line !== lineIndex);
    persistBookmarks([...others, {
      id: `bm-${Date.now()}-${lineIndex}`,
      time,
      line: lineIndex,
      label: labelForLine(lineIndex)
    }]);
  };

  const addBookmarkAt = (time) => {
    // If the text is following along, name the mark after the line that is playing
    const label = activeLine !== null ? labelForLine(activeLine) : '';
    persistBookmarks([...bookmarks, {
      id: `bm-${Date.now()}`,
      time,
      line: null,
      label
    }]);
  };

  const deleteBookmark = (id) => {
    persistBookmarks(bookmarks.filter(bookmark => bookmark.id !== id));
  };

  const clearBookmarks = () => persistBookmarks([]);

  /** Bring a line into view without waiting for the follow highlight */
  const jumpToLine = (lineIndex) => {
    setActiveLine(lineIndex);
    setJumpToken(token => token + 1);
  };

  // Clicking a line either stamps it (while marking) or jumps the audio to it
  const handleLyricClick = (event) => {
    if (isTeaching) return; // a hold is not a tap on a line
    if (swallowClickRef.current) { swallowClickRef.current = false; return; }
    const lineElement = event.target.closest?.('[data-line-index]');
    if (!lineElement) return;
    const lineIndex = Number(lineElement.dataset.lineIndex);
    if (Number.isNaN(lineIndex)) return;

    if (isMarkMode) {
      markLine(lineIndex);
      return;
    }

    const mark = bookmarks.find(bookmark => bookmark.line === lineIndex);
    if (mark && engine) engine.seek(mark.time);
  };

  // Highlight the line that is playing and keep it on screen
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.querySelectorAll('.lyric-line-active').forEach(element => {
      element.classList.remove('lyric-line-active');
    });

    // A jump comes from moving to a bookmark and always brings the line into
    // view; otherwise the line only leads the scroll while Follow is on
    const isJump = jumpToken !== lastJumpRef.current;
    lastJumpRef.current = jumpToken;
    if (activeLine === null || (!isFollowing && !isJump)) return;

    // A bookmark set on a chord line still finds its row, now that the chords
    // live inside the line they belong to
    const element = container.querySelector(`[data-line-index="${activeLine}"]`)
      || container.querySelector(`[data-chord-index="${activeLine}"]`);
    if (!element) return;
    element.classList.add('lyric-line-active');

    // The lyrics run in columns, so following the song scrolls sideways, and
    // only when the line is not already on screen
    const containerBox = container.getBoundingClientRect();
    const lineBox = element.getBoundingClientRect();
    const margin = 48;
    const isOffScreen = lineBox.left < containerBox.left + margin || lineBox.right > containerBox.right - margin;
    if (isOffScreen) {
      // An absolute target, because a long smooth scroll gets cut short by the
      // redraws happening while the song plays
      const target = container.scrollLeft + (lineBox.left - containerBox.left) - margin;
      container.scrollTo({ left: Math.max(0, target), behavior: isJump ? 'auto' : 'smooth' });
    }
  }, [activeLine, isFollowing, jumpToken, processedText]);

  // ---- Fitting the song to the window ------------------------------------
  //
  // Columns are only useful if a line never wraps and a chord never parts from
  // its words, so the column has to be at least as wide as the longest line.
  // Given that, the largest font that still fits every column on screen is
  // found by measuring rather than guessing.

  // Measured from the words themselves, never the hidden version, so moving
  // the reveal slider cannot change the layout
  useEffect(() => {
    fitDataRef.current = {
      lineTexts: processedText.lineTexts || [],
      groupSizes: processedText.groupSizes || []
    };
  }, [processedText]);

  const longestLineWidth = useCallback((size) => {
    const canvas = measureRef.current || (measureRef.current = document.createElement('canvas'));
    const context = canvas.getContext('2d');
    context.font = `600 ${size}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif`;
    let widest = 0;
    for (const line of fitDataRef.current.lineTexts) {
      const width = context.measureText(line || '').width;
      if (width > widest) widest = width;
    }
    return widest;
  }, []);

  /**
   * Try a size against the real layout rather than a model of it: set the font
   * and column width, read back whether the columns still overflow, and binary
   * search for the largest size that does not.
   */
  const fitToWindow = useCallback(() => {
    const container = scrollContainerRef.current;
    const columnHost = columnHostRef.current;
    const textHost = textHostRef.current;
    if (!container || !columnHost || !textHost || !fitDataRef.current.lineTexts.length) return;

    // A phone cannot hold a whole song at a readable size, and shrinking the
    // words until it does makes them unreadable. So a narrow screen gets one
    // column the width of the screen at a comfortable size, and the song runs
    // off to the right for the track to scroll through. Chords now wrap with
    // their own words, so a line that will not fit costs nothing.
    const available = container.clientWidth - 64;
    if (window.innerWidth < 768) {
      // Measured on a phone rather than reasoned about: nine point text in
      // columns about a quarter of the screen wide puts two verses in front of
      // you with the next one starting at the edge, which is what a hand held
      // at reading distance wants.
      setFontSize(9);
      setColumnWidth(Math.max(90, Math.round(container.clientWidth * 0.272)));
      return;
    }

    const previousFont = textHost.style.fontSize;
    const previousWidth = columnHost.style.columnWidth;
    const previousMax = columnHost.style.getPropertyValue('--column-max');

    // The column has to hold the longest line, or lines wrap and the chords
    // stop lining up with the words. The wrap limit has to move with the trial
    // width, or every size is measured against the width of the last one.
    const tryTheSize = (size) => {
      const width = Math.ceil(longestLineWidth(size)) + 4;
      textHost.style.fontSize = `${size}px`;
      columnHost.style.columnWidth = `${width}px`;
      columnHost.style.setProperty('--column-max', `${width}px`);
      const overflow = container.scrollWidth - container.clientWidth; // forces layout
      return { fits: overflow <= 1, width };
    };

    let best = null;
    let low = 8;
    let high = 40;
    while (low <= high) {
      const size = Math.floor((low + high) / 2);
      const attempt = tryTheSize(size);
      if (attempt.fits) {
        best = { size, width: attempt.width };
        low = size + 1;
      } else {
        high = size - 1;
      }
    }

    textHost.style.fontSize = previousFont;
    columnHost.style.columnWidth = previousWidth;
    columnHost.style.setProperty('--column-max', previousMax);

    // Songs too long for the window keep the smallest readable size and
    // scroll, but never wider than the window itself
    const chosen = best || {
      size: 8,
      width: Math.min(Math.ceil(longestLineWidth(8)) + 4, Math.max(120, available))
    };
    setFontSize(chosen.size);
    setColumnWidth(chosen.width);
  }, [longestLineWidth]);

  useEffect(() => {
    // Keyed on the song, not on how much of it is hidden
    if (!autoFit || isEditing || currentTab !== 'text' || !text) return undefined;

    let frame = requestAnimationFrame(fitToWindow);
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitToWindow);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, [autoFit, isEditing, currentTab, text, fitToWindow]);

  // Keep the way this song is set up for next time. The sizes only matter when
  // the fitter is off, but they cost nothing to carry.
  useEffect(() => {
    saveSettings(songId, {
      visibility,
      anchorWords,
      isFollowing,
      autoScroll: autoScrollChoice,
      screenKind,
      autoFit,
      fontSize,
      columnWidth,
      autoScrollSpeed,
      metronomeBPM,
      metronomeMeter
    });
  }, [songId, visibility, anchorWords, isFollowing, autoScrollChoice, screenKind, autoFit,
      fontSize, columnWidth, autoScrollSpeed, metronomeBPM, metronomeMeter]);

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
      setAutoScrollChoice(false);
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

    if (!isAutoAdvancing || isBookmarkDriven || isTrackTimed) {
      setCountdownProgress(100);
      return;
    }

    // Start countdown and scrolling
    // Speed 1 = 36s (slowest), Speed 10 = 4s (fastest)
    // Formula: delayMs = 39556 - (speed * 3556)
    const delayMs = 39556 - (autoScrollSpeed * 3556);
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
          container.scrollTo({ left: currentScroll + columnWithGap, behavior: 'smooth' });
        } else {
          container.scrollTo({ left: 0, behavior: 'smooth' });
        }

        // Trigger re-run of this effect
        setScrollPosition(prev => prev + 1);
      }
    }, delayMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (countdownRef.current) cancelAnimationFrame(countdownRef.current);
    };
  }, [isAutoAdvancing, autoScrollSpeed, columnWidth, scrollPosition, isBookmarkDriven, isTrackTimed]);

  // Auto-scroll paced by the track itself: the first word sits at the start of
  // the recording and the last at the end, so the words arrive as they are
  // sung without anyone having to pick a speed. Bookmarks are more exact where
  // they exist, so they still win.
  useEffect(() => {
    if (!isAutoAdvancing || !isTrackTimed) return undefined;

    let frame;
    const follow = () => {
      // One bad frame must not end the loop. A thrown error here would stop
      // the words for the rest of the session with no way back but a reload.
      try {
        moveWithTheTrack();
      } catch (error) {
        console.warn('[TextMemorisationApp] Skipped a scroll frame:', error?.message || error);
      }
      frame = requestAnimationFrame(follow);
    };

    const moveWithTheTrack = () => {
      // A drag that has gone quiet is over, whatever the browser did or did not
      // tell us. Without this the words could wait forever for a finger that
      // has already been lifted.
      // A teaching hand that has gone quiet is a hand still holding: it is the
      // waiting that is being taught, so that one is left alone.
      if (dragRef.current && performance.now() - dragRef.current.lastMove > 1500) {
        const stranded = dragRef.current;
        dragRef.current = null;
        // Keep where the hand left the page rather than snapping back to the song
        if (stranded.moved && scrollContainerRef.current) {
          lastSeekRef.current = 0;
          seekToScroll(scrollContainerRef.current.scrollLeft);
        }
      }
      const container = scrollContainerRef.current;
      const duration = engine?.duration || 0;
      if (container && duration > 0) {
        const now = engine.smoothTime;
        const furthest = container.scrollWidth - container.clientWidth;
        setHasOverflow(furthest > 4);

        // A hold in progress counts as an open pause, so the page stops under
        // the finger exactly as it will when this is played back
        // Fractions matter: rounding to whole pixels is itself a stutter when
        // a song crawls along at a fifth of a pixel a frame
        const target = positionAt(anchors, now, duration, furthest);
        // A scroll offset lands on whole pixels, and at a fifth of a pixel a
        // frame that means moving once every few frames: the stutter you see.
        // So the whole pixels are scrolled and the fraction is carried by a
        // transform, which is free and has no such limit.
        // While a finger is teaching or dragging, the page belongs to it
        if (!dragRef.current?.moved && !teachRef.current) {
          const whole = Math.floor(target);
          if (Math.abs(container.scrollLeft - whole) > 0.5) container.scrollLeft = whole;
          const host = columnHostRef.current;
          if (host) host.style.transform = `translateX(${-(target - whole).toFixed(3)}px)`;
        }
        // Whole percents only: this runs every frame, and a state change every
        // frame re-renders the whole practice view sixty times a second
        const percent = Math.min(100, Math.round((now / duration) * 100));
        setCountdownProgress(current => (current === percent ? current : percent));
      }
    };

    const host = columnHostRef.current;
    frame = requestAnimationFrame(follow);
    return () => {
      cancelAnimationFrame(frame);
      // Hand the sub-pixel offset back when the words stop being paced
      if (host) host.style.transform = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoAdvancing, isTrackTimed, engine, anchors]);

  // Dragging the words is the same act as dragging the playhead, read the
  // other way round: the page and the track are two views of one position.
  // Not while teaching: there a hold means "wait here", not "move the song"
  const canScrub = isTrackTimed && isAutoAdvancing && !isTeaching;

  const seekToScroll = (position, { throttle = false } = {}) => {
    const container = scrollContainerRef.current;
    if (!container || !engine?.duration) return;
    const furthest = container.scrollWidth - container.clientWidth;
    if (furthest <= 0) return;
    // Rebuilding the playback buffers on every frame of a drag is more work
    // than a hand can see; twenty times a second already feels continuous
    const now = performance.now();
    if (throttle && now - lastSeekRef.current < 50) return;
    lastSeekRef.current = now;
    engine.seek(timeAt(anchors, position, engine.duration, furthest));
  };

  const startDrag = (event) => {
    const container = scrollContainerRef.current;
    if (!canScrub || !container) return;
    dragRef.current = {
      pointerId: event.pointerId,
      fromX: event.clientX,
      fromScroll: container.scrollLeft,
      moved: false,
      lastMove: performance.now()
    };
    try {
      container.setPointerCapture?.(event.pointerId);
    } catch {
      // The gesture is still followed through the window listeners below
    }
  };

  const continueDrag = (event) => {
    const drag = dragRef.current;
    const container = scrollContainerRef.current;
    if (!drag || !container || event.pointerId !== drag.pointerId) return;

    drag.lastMove = performance.now();
    const travelled = event.clientX - drag.fromX;
    // A finger that has barely moved is still a tap on a line
    if (!drag.moved && Math.abs(travelled) < 4) return;
    drag.moved = true;

    const furthest = container.scrollWidth - container.clientWidth;
    const next = Math.min(furthest, Math.max(0, drag.fromScroll - travelled));
    container.scrollLeft = next;
    seekToScroll(next, { throttle: true });
  };

  const endDrag = (event) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    try {
      scrollContainerRef.current?.releasePointerCapture?.(drag.pointerId ?? event?.pointerId);
    } catch {
      // Already released, or never captured
    }
    if (!drag.moved) return;
    swallowClickRef.current = true;
    // Land on exactly where the hand left the page, throttle or no throttle
    lastSeekRef.current = 0;
    if (scrollContainerRef.current) seekToScroll(scrollContainerRef.current.scrollLeft);
  };

  // A trackpad has no pointer to follow, so the wheel is read directly rather
  // than left to scroll the page and be pulled back by the next frame. It has
  // to be a listener of our own: React's wheel handler cannot cancel the
  // browser's own scrolling.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !canScrub) return undefined;

    const onWheel = (event) => {
      const travel = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!travel) return;
      event.preventDefault();
      const furthest = container.scrollWidth - container.clientWidth;
      if (furthest <= 0) return;
      const next = Math.min(furthest, Math.max(0, container.scrollLeft + travel));
      container.scrollLeft = next;
      seekToScroll(next, { throttle: true });
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canScrub, engine, anchors]);

  // A finger lifted outside the words, or a gesture the browser takes over,
  // has to end the drag too. Without this the page waits for a pointer that is
  // never coming back and the words sit still while the song plays on.
  useEffect(() => {
    const finish = () => {
      if (teachRef.current) endTeaching();
      if (!dragRef.current) return;
      if (dragRef.current.moved) swallowClickRef.current = true;
      dragRef.current = null;
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeaching, engine, scrollMap]);

  // Timing kept here while the column was missing moves up to the song as soon
  // as the database can hold it, without anyone having to teach it again
  useEffect(() => {
    const local = loadSettings(songId).scrollMap;
    if (!songId || !local?.length || textData?.scrollMap?.length) return;
    updateText(songId, { scrollMap: local })
      .then(() => {
        setTimingIsLocal(false);
        if (onTextDataUpdate) onTextDataUpdate();
      })
      .catch(() => setTimingIsLocal(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  /**
   * While teaching, a finger on the words takes the page over. Held still, the
   * page waits where the song waits. Pushed along, it catches up with music
   * that has run ahead of it. Either way, letting go leaves an anchor: this is
   * where the page should be at this moment.
   */
  const startTeaching = (event) => {
    const container = scrollContainerRef.current;
    if (!isTeaching || !container || !engine?.duration || !engine.isPlaying) return;
    event.preventDefault();
    const furthest = container.scrollWidth - container.clientWidth;
    teachRef.current = {
      pointerId: event.pointerId,
      fromTime: engine.smoothTime,
      fromAt: furthest > 0 ? container.scrollLeft / furthest : 0,
      fromX: event.clientX,
      fromScroll: container.scrollLeft,
      moved: false,
      lastMove: performance.now()
    };
    try {
      container.setPointerCapture?.(event.pointerId);
    } catch {
      // The window listeners below still see the end of the gesture
    }
  };

  const moveTeaching = (event) => {
    const teaching = teachRef.current;
    const container = scrollContainerRef.current;
    if (!teaching || !container || event.pointerId !== teaching.pointerId) return;

    teaching.lastMove = performance.now();
    const travelled = event.clientX - teaching.fromX;
    if (!teaching.moved && Math.abs(travelled) < 4) return;
    teaching.moved = true;

    // The music carries on: this is the page catching up with it, not a seek
    const furthest = container.scrollWidth - container.clientWidth;
    container.scrollLeft = Math.min(furthest, Math.max(0, teaching.fromScroll - travelled));
  };

  const endTeaching = () => {
    const teaching = teachRef.current;
    const container = scrollContainerRef.current;
    teachRef.current = null;
    if (!teaching || !container || !engine) return;
    try {
      container.releasePointerCapture?.(teaching.pointerId);
    } catch {
      // Already gone
    }
    if (teaching.moved) swallowClickRef.current = true;

    const furthest = container.scrollWidth - container.clientWidth;
    const at = furthest > 0 ? container.scrollLeft / furthest : 0;
    const now = engine.smoothTime;
    // A tap that neither waited nor moved has taught nothing
    if (!teaching.moved && now <= teaching.fromTime + 0.05) return;

    setScrollMap(current => withAnchors(toAnchors(current, engine.duration), [
      { time: teaching.fromTime, at: teaching.fromAt },
      { time: now, at }
    ]));
  };

  /** Stop teaching and keep what was taught with the song */
  const finishTeaching = async () => {
    endTeaching();
    setIsTeaching(false);
    const taught = toAnchors(scrollMap, engine?.duration || 0);
    if (!songId) return;
    try {
      await updateText(songId, { scrollMap: taught });
      setTimingIsLocal(false);
      if (onTextDataUpdate) await onTextDataUpdate();
    } catch (error) {
      if (isMissingColumn(error)) {
        // Kept here instead, and it will move to the song once the column exists
        saveSettings(songId, { scrollMap: taught });
        setTimingIsLocal(true);
        return;
      }
      console.error('[TextMemorisationApp] Could not save the taught scroll:', error);
      alert('The timing works for now but could not be saved.');
    }
  };

  const forgetTeaching = async () => {
    teachRef.current = null;
    setScrollMap([]);
    setIsTeaching(false);
    if (!songId) return;
    saveSettings(songId, { scrollMap: [] });
    try {
      await updateText(songId, { scrollMap: [] });
      if (onTextDataUpdate) await onTextDataUpdate();
    } catch (error) {
      if (!isMissingColumn(error)) console.error('[TextMemorisationApp] Could not clear the taught scroll:', error);
    }
  };


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
            {/* Unified Control Bar — visible on all screen sizes */}
            <div className={`practice-header border-b flex-shrink-0 transition-colors ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
              <style>{`
                .practice-header .header-short { display: none; }
                /* On a phone the header is overhead: the words matter more, so
                   the labels go, the controls shrink and it stays on one row. */
                @media (max-width: 640px) {
                  .practice-header .header-row { gap: 8px !important; padding: 4px 8px !important; }
                  .practice-header .header-label { display: none !important; }
                  .practice-header button { min-height: 30px !important; height: 30px !important; }
                  .practice-header .header-slider { width: 76px !important; }
                  .practice-header button { font-size: 11px !important; padding: 0 8px !important; }
                  .practice-header .header-tabs-optional { display: none !important; }
                  .practice-header .header-words { width: 22px !important; }
                  .practice-header .header-short { display: inline !important; }
                }
              `}</style>
              {/* Row 1: Navigation + Core Controls */}
              <Flex className="header-row" align="center" gap="3" wrap="wrap" px="3" py="2">
                {/* Back button */}
                <Tooltip content="Back to list">
                  <IconButton variant="ghost" size="3" onClick={handleReset} style={{ flexShrink: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                  </IconButton>
                </Tooltip>

                {/* Tab switcher. On a phone it only earns its width once the
                    song actually has sheet music to switch to. */}
                <Flex gap="1" shrink="0" className={musicXMLFile ? undefined : 'header-tabs-optional'}>
                  <Button
                    variant={currentTab === 'text' ? 'solid' : 'soft'}
                    color="gray"
                    size="2"
                    onClick={() => setCurrentTab('text')}
                    style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '12px' }}
                  >
                    Text
                  </Button>
                  <Button
                    variant={currentTab === 'music' ? 'solid' : 'soft'}
                    color="gray"
                    size="2"
                    onClick={() => setCurrentTab('music')}
                    style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '12px' }}
                  >
                    Music
                  </Button>
                </Flex>

                <Separator orientation="vertical" size="1" />

                {/* Reveal slider — text tab only */}
                {currentTab === 'text' && (
                  <>
                    <Separator orientation="vertical" size="1" />
                    <Flex align="center" gap="2" shrink="0">
                      <Text className="header-label" size="1" weight="medium" color="gray" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hide Text</Text>
                      <div className="header-slider" style={{ width: 80 }}>
                        <RadixSlider
                          value={[visibility]}
                          onValueChange={(val) => setVisibility(val[0])}
                          min={0}
                          max={100}
                          step={5}
                          size="2"
                        />
                      </div>
                      <Text className="header-label" size="2" style={{ width: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{visibility}%</Text>
                    </Flex>

                    {/* How many words survive the hiding, so it sits with the slider */}
                    <Flex align="center" gap="2" shrink="0">
                      <Tooltip content="Words kept visible at the start of every line, however far the slider goes">
                        <Text className="header-label" size="1" weight="medium" color="gray" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Keep</Text>
                      </Tooltip>
                      <IconButton variant="outline" size="2" onClick={() => setAnchorWords(Math.max(0, anchorWords - 1))}>
                        <span style={{ fontSize: 15, fontWeight: 'bold', lineHeight: 1 }}>−</span>
                      </IconButton>
                      <Text className="header-words" size="2" style={{ width: 52, textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span className="header-label">{anchorWords === 0 ? 'none' : `${anchorWords} word${anchorWords > 1 ? 's' : ''}`}</span>
                        <span className="header-short">{anchorWords === 0 ? '0' : anchorWords}</span>
                      </Text>
                      <IconButton variant="outline" size="2" onClick={() => setAnchorWords(Math.min(5, anchorWords + 1))}>
                        <span style={{ fontSize: 15, fontWeight: 'bold', lineHeight: 1 }}>+</span>
                      </IconButton>
                    </Flex>
                  </>
                )}

                <div style={{ flex: 1 }} />

                {/* Settings toggle + Dark mode — full row height with gap */}
                {currentTab === 'text' && (
                  <button
                    onClick={() => setIsControlsExpanded(!isControlsExpanded)}
                    className={`md:!hidden flex items-center justify-center px-2 -my-2 transition-colors ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
                    title="Settings"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isControlsExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                )}

                <Tooltip content={isDarkMode ? 'Light mode' : 'Dark mode'}>
                  <button
                    onClick={onToggleDarkMode}
                    className={`flex items-center justify-center px-2 -my-2 transition-colors ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
                  >
                    {isDarkMode ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="5" />
                        <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                        <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                      </svg>
                    )}
                  </button>
                </Tooltip>
              </Flex>

              {/* Row 2: Text-specific controls — Font, Width, Auto-scroll, Metronome */}
              {/* Collapsible on mobile (via chevron toggle), always visible on md+ */}
              {currentTab === 'text' && (
                <Flex align="center" gap="3" wrap="wrap" px="3" py="2" className={`${isControlsExpanded ? '' : 'hidden'} md:!flex`} style={{ borderTop: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb' }}>
                  {/* Fit the song to the window */}
                  <Tooltip content="Size the text so the whole song fits the window without wrapping">
                    <Button
                      variant={autoFit ? 'solid' : 'outline'}
                      color={autoFit ? 'blue' : 'gray'}
                      size="2"
                      onClick={() => { setAutoFit(true); fitToWindow(); }}
                    >
                      Fit
                    </Button>
                  </Tooltip>

                  <Separator orientation="vertical" size="1" />

                  {/* Font Size */}
                  <Flex align="center" gap="2" shrink="0">
                    <Text size="1" weight="medium" color="gray" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Font</Text>
                    <IconButton variant="outline" size="3" onClick={() => { setAutoFit(false); setFontSize(Math.max(8, fontSize - 2)); }}>
                      <span style={{ fontSize: 16, fontWeight: 'bold', lineHeight: 1 }}>−</span>
                    </IconButton>
                    <Text size="2" style={{ width: 24, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{fontSize}</Text>
                    <IconButton variant="outline" size="3" onClick={() => { setAutoFit(false); setFontSize(Math.min(40, fontSize + 2)); }}>
                      <span style={{ fontSize: 16, fontWeight: 'bold', lineHeight: 1 }}>+</span>
                    </IconButton>
                  </Flex>

                  <Separator orientation="vertical" size="1" />

                  {/* Column Width */}
                  <Flex align="center" gap="2" shrink="0">
                    <Text size="1" weight="medium" color="gray" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Width</Text>
                    <IconButton variant="outline" size="3" onClick={() => { setAutoFit(false); setColumnWidth(Math.max(80, columnWidth - 20)); }}>
                      <span style={{ fontSize: 16, fontWeight: 'bold', lineHeight: 1 }}>−</span>
                    </IconButton>
                    <Text size="2" style={{ width: 32, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{columnWidth}</Text>
                    <IconButton variant="outline" size="3" onClick={() => { setAutoFit(false); setColumnWidth(Math.min(900, columnWidth + 20)); }}>
                      <span style={{ fontSize: 16, fontWeight: 'bold', lineHeight: 1 }}>+</span>
                    </IconButton>
                  </Flex>

                  <Separator orientation="vertical" size="1" />

                  {/* Column Navigation */}
                  <Flex align="center" gap="1" shrink="0">
                    <IconButton variant="ghost" size="3" onClick={() => {
                      if (!scrollContainerRef.current) return;
                      const container = scrollContainerRef.current;
                      const columnWithGap = columnWidth + 48;
                      container.scrollLeft = Math.max(0, container.scrollLeft - columnWithGap);
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </IconButton>
                    <Text size="1" color="gray">Col</Text>
                    <IconButton variant="ghost" size="3" onClick={() => {
                      if (!scrollContainerRef.current) return;
                      const container = scrollContainerRef.current;
                      const columnWithGap = columnWidth + 48;
                      const maxScroll = container.scrollWidth - container.clientWidth;
                      container.scrollLeft = Math.min(maxScroll, container.scrollLeft + columnWithGap);
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </IconButton>
                  </Flex>

                  <Separator orientation="vertical" size="1" />

                  {/* Auto-Advance */}
                  <Flex align="center" gap="2" shrink="0">
                    <Button
                      variant={isAutoAdvancing ? 'solid' : 'outline'}
                      color={isAutoAdvancing ? 'blue' : 'gray'}
                      size="2"
                      onClick={() => setAutoScrollChoice(!isAutoAdvancing)}
                    >
                      {isAutoAdvancing ? 'Stop' : 'Auto'}
                    </Button>
                    {isAutoAdvancing && isTrackTimed && (
                      <Text size="1" color="gray">
                        {!hasOverflow
                          ? 'The whole song already fits'
                          : hasTiming(anchors) ? 'Paced by your timing' : 'Paced by the track'}
                      </Text>
                    )}
                    {isAutoAdvancing && isBookmarkDriven && (
                      <Text size="1" color="gray">Following the bookmarks</Text>
                    )}
                    {isAutoAdvancing && !isTrackTimed && !isBookmarkDriven && (
                      <>
                        <Text size="1" weight="medium" color="gray" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Speed</Text>
                        <div style={{ width: 80 }}>
                          <RadixSlider
                            value={[autoScrollSpeed]}
                            onValueChange={(val) => setAutoScrollSpeed(val[0])}
                            min={1}
                            max={10}
                            step={1}
                            size="2"
                          />
                        </div>
                        <Text size="2" style={{ fontVariantNumeric: 'tabular-nums' }}>{autoScrollSpeed}</Text>
                      </>
                    )}
                  </Flex>

                  {/* Teaching the scroll its timing */}
                  {isTrackTimed && (
                    <>
                      <Separator orientation="vertical" size="1" />
                      <Flex align="center" gap="2" shrink="0">
                        <Button
                          variant={isTeaching ? 'solid' : 'outline'}
                          color={isTeaching ? 'red' : 'gray'}
                          size="2"
                          onClick={() => (isTeaching ? finishTeaching() : setIsTeaching(true))}
                        >
                          {isTeaching ? 'Save timing' : 'Teach'}
                        </Button>
                        {isTeaching ? (
                          <Text size="1" color="gray">Play, then hold the words to wait or push them on to catch up</Text>
                        ) : hasTiming(anchors) && (
                          <>
                            {timingIsLocal && (
                              <Text size="1" color="gray">Saved on this device</Text>
                            )}
                            <Button size="1" variant="ghost" color="gray" onClick={forgetTeaching}>
                              Forget timing
                            </Button>
                          </>
                        )}
                      </Flex>
                    </>
                  )}

                  <Separator orientation="vertical" size="1" />

                  {/* Metronome */}
                  <Flex align="center" gap="2" shrink="0">
                    <Button
                      variant={isMetronomeActive ? 'solid' : 'outline'}
                      color={isMetronomeActive ? 'green' : 'gray'}
                      size="2"
                      onClick={() => setIsMetronomeActive(prev => !prev)}
                    >
                      {isMetronomeActive ? 'Metro On' : 'Metro Off'}
                    </Button>
                    {isMetronomeActive && (
                      <>
                        <input
                          type="number"
                          value={metronomeBPM}
                          onChange={(e) => setMetronomeBPM(Math.max(20, Math.min(250, parseInt(e.target.value) || 120)))}
                          className={`w-16 px-2 py-1 text-sm text-center rounded-md border focus:outline-none transition-colors ${isDarkMode
                            ? 'border-gray-600 bg-gray-700 text-white focus:border-gray-500'
                            : 'border-gray-300 bg-white text-black focus:border-black'
                            }`}
                          min="20"
                          max="250"
                          title="BPM"
                        />
                        <Text size="1" color="gray">bpm</Text>
                        <input
                          type="number"
                          value={metronomeMeter}
                          onChange={(e) => setMetronomeMeter(Math.max(1, Math.min(12, parseInt(e.target.value) || 4)))}
                          className={`w-12 px-2 py-1 text-sm text-center rounded-md border focus:outline-none transition-colors ${isDarkMode
                            ? 'border-gray-600 bg-gray-700 text-white focus:border-gray-500'
                            : 'border-gray-300 bg-white text-black focus:border-black'
                            }`}
                          min="1"
                          max="12"
                          title="Time signature (beats per measure)"
                        />
                        <Text size="1" color="gray">/4</Text>
                      </>
                    )}
                  </Flex>
                </Flex>
              )}
            </div>

            {/* Countdown visualizer */}
            {isAutoAdvancing && (
              <div className={`h-2 transition-colors ${isDarkMode ? 'bg-gray-700' : 'bg-gray-300'}`}>
                <div
                  className={`h-full transition-colors ${isDarkMode ? 'bg-blue-400' : 'bg-black'}`}
                  style={{
                    width: `${countdownProgress}%`
                  }}
                />
              </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Text Display */}
                <div className={`flex-1 overflow-hidden relative transition-colors ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
                  }`}>
                  {/* YouTube toggle button - moved to bottom bar */}

                  {/* Text Tab Content */}
                  {currentTab === 'text' && (
                    <>
                    <style>{`
                      /* One chord over the words it belongs to, wrapping as a unit */
                      .chord-word { display: inline-block; vertical-align: bottom; white-space: pre; }
                      .chord-cell { display: inline-block; vertical-align: bottom; white-space: pre; }
                      .chord-cell-chord { display: block; color: #3b82f6; font-weight: 400; line-height: 1.2; }
                      .chord-cell-words { display: block; line-height: 1.35; }
                      /* A chord past the end of the words still needs a line to sit on */
                      .chord-cell-words:empty::after { content: "\\00a0"; }
                      [data-chord-row] { margin-bottom: 0.15em; }
                      /* Lines wrap inside their column rather than running off
                         the edge of it, which is what a narrow screen needs */
                      [data-lyric-group] { max-width: var(--column-max, none); }
                    `}</style>
                    <div
                      ref={scrollContainerRef}
                      onClick={handleLyricClick}
                      onPointerDown={(event) => { startTeaching(event); startDrag(event); }}
                      onPointerMove={(event) => { moveTeaching(event); continueDrag(event); }}
                      onPointerUp={(event) => { endTeaching(); endDrag(event); }}
                      onPointerCancel={(event) => { endTeaching(); endDrag(event); }}
                      onPointerLeave={(event) => { endTeaching(); endDrag(event); }}
                      className={`h-full overflow-x-auto overflow-y-hidden ${isDarkMode ? 'dark-scrollbar' : ''}`}
                      style={{
                        WebkitOverflowScrolling: 'touch',
                        backgroundColor: isDarkMode ? '#111827' : '#ffffff',
                        padding: '2rem',
                        paddingBottom: '2rem',
                        userSelect: isTeaching || canScrub ? 'none' : undefined,
                        touchAction: isTeaching || canScrub ? 'none' : undefined,
                        cursor: isTeaching ? 'grab' : (isMarkMode ? 'crosshair' : (canScrub ? 'ew-resize' : 'default'))
                      }}>
                      <div
                        ref={columnHostRef}
                        className={`transition-colors ${isDarkMode ? 'text-white' : 'text-black'}`}
                        style={{
                          '--column-max': `${columnWidth}px`,
                          columnWidth: `${columnWidth}px`,
                          columnGap: '3rem',
                          columnRule: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                          columnFill: 'auto',
                          width: 'max-content',
                          minWidth: '100%',
                          height: 'calc(100% - 20px)',
                          paddingBottom: '20px'
                        }}>
                        {/* Song info header */}
                        {textData && (textData.title || textData.artist) && (
                          <div ref={headerRef} style={{
                            maxWidth: 'var(--column-max, none)',
                            marginBottom: '2rem',
                            paddingBottom: '1rem',
                            borderBottom: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                            breakInside: 'avoid'
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
                            {/* External Links */}
                            <div className="flex gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
                              {/* Ultimate Guitar Button */}
                              <a
                                href={textData.ultimateGuitarUrl || '#'}
                                target={textData.ultimateGuitarUrl ? '_blank' : '_self'}
                                rel="noopener noreferrer"
                                className={`no-underline px-2 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg border-[1.5px] transition-all shadow-sm whitespace-nowrap ${textData.ultimateGuitarUrl
                                  ? (isDarkMode ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-500 hover:shadow-md' : 'bg-black text-white border-black hover:bg-gray-800 hover:shadow-md')
                                  : (isDarkMode ? 'bg-gray-800 border-gray-600 text-gray-500 cursor-not-allowed' : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed')
                                  }`}
                                style={{ textDecoration: 'none' }}
                                onClick={(e) => !textData.ultimateGuitarUrl && e.preventDefault()}
                              >
                                <span className="hidden sm:inline">Ultimate Guitar</span>
                                <span className="sm:hidden">UG</span>
                              </a>
                              {/* Soundslice Button */}
                              <a
                                href={textData.soundsliceUrl || '#'}
                                target={textData.soundsliceUrl ? '_blank' : '_self'}
                                rel="noopener noreferrer"
                                className={`no-underline px-2 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg border-[1.5px] transition-all shadow-sm whitespace-nowrap ${textData.soundsliceUrl
                                  ? (isDarkMode ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-500 hover:shadow-md' : 'bg-black text-white border-black hover:bg-gray-800 hover:shadow-md')
                                  : (isDarkMode ? 'bg-gray-800 border-gray-600 text-gray-500 cursor-not-allowed' : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed')
                                  }`}
                                style={{ textDecoration: 'none' }}
                                onClick={(e) => !textData.soundsliceUrl && e.preventDefault()}
                              >
                                <span className="hidden sm:inline">Soundslice</span>
                                <span className="sm:hidden">SS</span>
                              </a>
                            </div>
                          </div>
                        )}
                        <div ref={textHostRef} style={{
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif',
                          fontSize: `${fontSize}px`,
                          lineHeight: '1.3',
                          margin: 0,
                          fontWeight: '600',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {processedText.isHtml ? (
                            <div dangerouslySetInnerHTML={{ __html: processedText.content }} />
                          ) : (
                            processedText.content
                          )}
                        </div>

                      </div>
                    </div>
                    </>
                  )}

                  {/* Music Tab Content */}
                  {currentTab === 'music' && (
                    <div className="flex-1 overflow-y-auto" style={{
                      backgroundColor: isDarkMode ? '#111827' : '#ffffff',
                      paddingBottom: 0
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

                {/* Stems: mounted at all times so audio survives, shown on demand */}
                <StemPlayerWrapper
                  stems={stems}
                  setStems={setStems}
                  textId={textData?.id}
                  youtubeUrl={textData?.youtubeUrl || ''}
                  isDarkMode={isDarkMode}
                  isVisible={isStemPlayerVisible}
                  onStemsUpdate={onTextDataUpdate}
                  engine={engine}
                />

                {/* Backing track transport: waveform, A-B loop and lyric bookmarks */}
                <SongPlayer
                  songId={textData?.id}
                  stems={stems}
                  bookmarks={bookmarks}
                  isDarkMode={isDarkMode}
                  isMarkMode={isMarkMode}
                  onToggleMarkMode={() => setIsMarkMode(!isMarkMode)}
                  isFollowing={isFollowing}
                  onToggleFollowing={() => setIsFollowing(!isFollowing)}
                  onActiveLineChange={setActiveLine}
                  onDeleteBookmark={deleteBookmark}
                  onClearBookmarks={clearBookmarks}
                  onAddBookmark={addBookmarkAt}
                  onJumpToLine={jumpToLine}
                  isStemsPanelOpen={isStemPlayerVisible}
                  onToggleStemsPanel={() => setIsStemPlayerVisible(!isStemPlayerVisible)}
                  onEngineReady={handleEngineReady}
                />

                {/* YouTube Video Container - Bottom of screen */}
                {textData?.youtubeUrl && (
                  <div className={`transition-all duration-300 border-t flex-shrink-0 ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
                    } ${isYouTubeVisible ? 'h-[50vh] md:h-[12.5vh]' : 'h-12'}`}
                  >
                    {!isYouTubeVisible ? (
                      <div className="h-full flex items-center justify-center">
                        <button
                          onClick={() => setIsYouTubeVisible(true)}
                          className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${isDarkMode
                            ? 'bg-gray-700 text-white hover:bg-gray-600'
                            : 'bg-gray-100 text-black hover:bg-gray-200'
                            }`}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                          <span className="text-sm font-medium">Load YouTube Video</span>
                        </button>
                      </div>
                    ) : (
                      <div className="p-4 h-full flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                          <span className={`text-xs uppercase tracking-wider font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'
                            }`}>Video</span>
                          <button
                            onClick={() => setIsYouTubeVisible(false)}
                            className={`transition-colors ${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'
                              }`}
                            title="Hide video"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex-1 flex items-center justify-center" style={{ overflow: 'hidden' }}>
                          <div style={{
                            width: '100%',
                            height: '100%',
                            maxWidth: '1200px',
                            position: 'relative'
                          }}>
                            <iframe
                              src={`${textData.youtubeUrl.replace('watch?v=', 'embed/')}?loop=1&playlist=${textData.youtubeUrl.split('v=')[1]?.split('&')[0]}`}
                              style={{
                                width: '100%',
                                height: '100%',
                                borderRadius: '8px'
                              }}
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              title="YouTube video"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
