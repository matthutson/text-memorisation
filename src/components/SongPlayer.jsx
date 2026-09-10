import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SongAudio from '../utils/songAudio';
import { peaksFromBuffer } from '../utils/peaks';
import { bookmarkAt, nextBookmark, previousBookmark } from '../utils/bookmarks';
import { boolOr, loadSettings, numberOr, saveSettings } from '../utils/practiceSettings';

const waveformHeight = () => (window.innerWidth < 768 ? 64 : 96);

const formatTime = (seconds, { signed = false } = {}) => {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '--:--.-';
  const total = Math.max(0, seconds);
  const mins = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  const tenths = Math.floor((total * 10) % 10);
  return `${signed ? '-' : ''}${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
};

// Icons are drawn on a 24 unit grid so they line up at any button size
const glyphs = {
  play: <path d="M7 4l13 8-13 8z" fill="currentColor" stroke="none" />,
  pause: <path d="M8 4h3v16H8zM13 4h3v16h-3z" fill="currentColor" stroke="none" />,
  prevMark: <><path d="M18 5v14l-10-7z" fill="currentColor" stroke="none" /><path d="M6 5v14" /></>,
  nextMark: <><path d="M6 5v14l10-7z" fill="currentColor" stroke="none" /><path d="M18 5v14" /></>,
  back5: <><path d="M11 8l-5 4 5 4z" fill="currentColor" stroke="none" /><path d="M18 8l-5 4 5 4z" fill="currentColor" stroke="none" /></>,
  fwd5: <><path d="M13 8l5 4-5 4z" fill="currentColor" stroke="none" /><path d="M6 8l5 4-5 4z" fill="currentColor" stroke="none" /></>,
  loop: <><path d="M4 9h13a3 3 0 0 1 0 6h-2" /><path d="M7 5L4 9l3 4" /><path d="M20 15H7a3 3 0 0 1 0-6h2" /><path d="M17 19l3-4-3-4" /></>,
  cross: <path d="M6 6l12 12M18 6L6 18" />,
  arrowLeft: <path d="M15 5l-7 7 7 7" />,
  arrowRight: <path d="M9 5l7 7-7 7" />,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  zoomIn: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4M11 8v6M8 11h6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4M8 11h6" /></>,
  addMark: <><path d="M6 3h9a2 2 0 0 1 2 2v16l-6.5-4.5L4 21V5a2 2 0 0 1 2-2z" /><path d="M19 3v6M22 6h-6" /></>,
  markLines: <><path d="M5 4h10a2 2 0 0 1 2 2v15l-7-4.5L5 21z" /><path d="M20 5h1M20 9h1M20 13h1" /></>,
  follow: <><circle cx="12" cy="12" r="3" /><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /></>,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  sliders: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  flat: <><path d="M9 3v14" /><path d="M9 10c3-2 5-1 5 1s-2 4-5 6" /></>,
  sharp: <><path d="M9 3v16M15 5v16M6 9l12-2M6 15l12-2" /></>
};

const Glyph = ({ name, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {glyphs[name]}
  </svg>
);

/**
 * The practice transport: waveform, A-B looping, speed and key, and the
 * bookmarks that tie moments in the song to lines of the lyrics.
 */
export default function SongPlayer({
  songId,
  stems = [],
  bookmarks = [],
  isDarkMode,
  isMarkMode,
  onToggleMarkMode,
  isFollowing,
  onToggleFollowing,
  onActiveLineChange,
  onJumpToLine,
  onDeleteBookmark,
  onClearBookmarks,
  onAddBookmark,
  isStemsPanelOpen,
  onToggleStemsPanel,
  onEngineReady
}) {
  // How this song was left last time: its speed, key, loop and zoom
  const saved = useMemo(() => loadSettings(songId), [songId]);

  const [engineState, setEngineState] = useState('idle'); // idle | loading | ready | error
  const [duration, setDuration] = useState(0);
  const [displayTime, setDisplayTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [peaks, setPeaks] = useState(null);
  const [loopA, setLoopA] = useState(() => numberOr(saved.loopA, null, { min: 0 }));
  const [loopB, setLoopB] = useState(() => numberOr(saved.loopB, null, { min: 0 }));
  const [isLoopOn, setIsLoopOn] = useState(() => boolOr(saved.isLoopOn, false));
  const [speed, setSpeed] = useState(() => numberOr(saved.speed, 1, { min: 0.25, max: 2 }));
  const [pitch, setPitch] = useState(() => numberOr(saved.pitch, 0, { min: -12, max: 12 }));
  const [zoom, setZoom] = useState(() => numberOr(saved.zoom, 1, { min: 1, max: 32 }));
  const [dragging, setDragging] = useState(null);
  const [height] = useState(waveformHeight);

  const engineRef = useRef(null);
  const canvasRef = useRef(null);
  const trackRef = useRef(null);
  const timeRef = useRef(0);
  const drawRef = useRef(() => {});
  const activeLineRef = useRef(undefined);

  const colors = useMemo(() => (isDarkMode
    ? { wave: '#4b5563', played: '#60a5fa', head: '#ef4444', loopFill: 'rgba(96,165,250,0.16)', pin: '#f59e0b', text: '#e5e7eb', dim: '#9ca3af', panel: '#1f2937', border: '#374151', control: '#374151', deck: '#111827' }
    : { wave: '#cbd5e1', played: '#2563eb', head: '#ef4444', loopFill: 'rgba(37,99,235,0.12)', pin: '#d97706', text: '#111827', dim: '#6b7280', panel: '#ffffff', border: '#e5e7eb', control: '#f3f4f6', deck: '#f8fafc' }
  ), [isDarkMode]);

  const sources = useMemo(() => stems.map(stem => stem.src).join('|'), [stems]);

  // ---- Engine ------------------------------------------------------------
  useEffect(() => {
    if (!stems.length) return undefined;

    const engine = new SongAudio();
    engineRef.current = engine;
    let cancelled = false;
    setEngineState('loading');

    engine.load(stems)
      .then(() => {
        if (cancelled) return;
        setDuration(engine.duration);
        const first = engine.tracks[0];
        if (first) setPeaks(peaksFromBuffer(first.src, first.buffer).peaks);
        setEngineState('ready');
        if (onEngineReady) onEngineReady(engine);
      })
      .catch(error => {
        console.warn('[SongPlayer] Could not load the tracks:', error?.message || error);
        if (!cancelled) setEngineState('error');
      });

    const offPlay = engine.on('play', () => setIsPlaying(true));
    const offPause = engine.on('pause', () => setIsPlaying(false));
    // A seek from elsewhere still moves the readout and the playhead
    const offSeek = engine.on('seek', (at) => {
      timeRef.current = at;
      setDisplayTime(at);
      drawRef.current();
    });

    return () => {
      cancelled = true;
      offPlay();
      offPause();
      offSeek();
      engine.destroy();
      engineRef.current = null;
      if (onEngineReady) onEngineReady(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);

  // Follow the playhead while it moves
  useEffect(() => {
    if (!isPlaying) return undefined;
    let frame;
    let lastShown = -1;
    const tick = () => {
      const engine = engineRef.current;
      if (engine) {
        const t = engine.currentTime;
        timeRef.current = t;
        if (Math.abs(t - lastShown) >= 0.08) {
          lastShown = t;
          setDisplayTime(t);
        }
      }
      drawRef.current();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  // ---- Settings that the engine owns -------------------------------------
  // engineState is a dependency so a remembered speed or key is applied again
  // once the tracks have finished loading, not just when the control is used.
  useEffect(() => { engineRef.current?.setTempo(speed); }, [speed, engineState]);
  useEffect(() => { engineRef.current?.setSemitones(pitch); }, [pitch, engineState]);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (isLoopOn && loopA !== null && loopB !== null && loopB > loopA) engine.setLoop(loopA, loopB);
    else engine.setLoop(null, null);
  }, [isLoopOn, loopA, loopB, engineState]);

  // Keep the song's settings for next time
  useEffect(() => {
    saveSettings(songId, { speed, pitch, zoom, loopA, loopB, isLoopOn });
  }, [songId, speed, pitch, zoom, loopA, loopB, isLoopOn]);

  // ---- Which lyric line is playing ---------------------------------------
  useEffect(() => {
    if (!onActiveLineChange) return;
    const active = bookmarkAt(bookmarks, displayTime);
    const line = active && typeof active.line === 'number' ? active.line : null;
    if (line !== activeLineRef.current) {
      activeLineRef.current = line;
      onActiveLineChange(line);
    }
  }, [bookmarks, displayTime, onActiveLineChange]);

  // ---- Waveform ----------------------------------------------------------
  const windowFor = useCallback((atTime) => {
    const total = duration || 1;
    const span = total / zoom;
    const start = Math.min(Math.max(0, atTime - span / 2), Math.max(0, total - span));
    return { start, span: Math.min(span, total) };
  }, [duration, zoom]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const boxHeight = canvas.clientHeight;
    if (!width || !boxHeight) return;

    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(boxHeight * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(boxHeight * ratio);
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, boxHeight);

    const view = windowFor(timeRef.current);
    const xOf = (seconds) => ((seconds - view.start) / view.span) * width;
    const middle = boxHeight / 2;

    if (loopA !== null && loopB !== null && loopB > loopA) {
      ctx.fillStyle = colors.loopFill;
      ctx.fillRect(xOf(loopA), 0, xOf(loopB) - xOf(loopA), boxHeight);
    }

    if (peaks && peaks.length) {
      const playedX = xOf(timeRef.current);
      const step = 3;
      const total = duration || 1;
      for (let x = 0; x < width; x += step) {
        const seconds = view.start + (x / width) * view.span;
        const index = Math.floor((seconds / total) * peaks.length);
        const peak = peaks[Math.min(Math.max(0, index), peaks.length - 1)] || 0;
        const barHeight = Math.max(1.5, peak * (boxHeight - 10));
        ctx.fillStyle = x <= playedX ? colors.played : colors.wave;
        ctx.fillRect(x, middle - barHeight / 2, 2, barHeight);
      }
    }

    ctx.lineWidth = 2;
    [loopA, loopB].forEach(point => {
      if (point === null) return;
      ctx.strokeStyle = colors.played;
      ctx.beginPath();
      ctx.moveTo(xOf(point), 0);
      ctx.lineTo(xOf(point), boxHeight);
      ctx.stroke();
    });

    const headX = xOf(timeRef.current);
    ctx.strokeStyle = colors.head;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(headX, 0);
    ctx.lineTo(headX, boxHeight);
    ctx.stroke();
  }, [colors, duration, loopA, loopB, peaks, windowFor]);

  useEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw, displayTime]);

  useEffect(() => {
    const onResize = () => drawRef.current();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ---- Transport ---------------------------------------------------------
  const seek = useCallback((seconds) => {
    const engine = engineRef.current;
    if (!engine || !duration) return;
    const at = engine.seek(seconds);
    timeRef.current = at;
    setDisplayTime(at);
    drawRef.current();
  }, [duration]);

  const timeFromEvent = useCallback((event) => {
    const track = trackRef.current;
    if (!track || !duration) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const view = windowFor(timeRef.current);
    return Math.min(Math.max(0, view.start + ratio * view.span), duration);
  }, [duration, windowFor]);

  const handlePointerDown = (event) => {
    if (!duration) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    seek(timeFromEvent(event));
    setDragging('playhead');
  };

  const handlePointerMove = (event) => {
    if (!dragging) return;
    const t = timeFromEvent(event);
    if (dragging === 'playhead') seek(t);
    if (dragging === 'A') setLoopA(Math.min(t, (loopB ?? duration) - 0.1));
    if (dragging === 'B') setLoopB(Math.max(t, (loopA ?? 0) + 0.1));
  };

  const togglePlay = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (isPlaying) engine.pause();
    else engine.play();
  };

  /** Move to a bookmark and take the lyrics with us */
  const goToBookmark = (bookmark) => {
    if (!bookmark) return;
    seek(bookmark.time);
    if (typeof bookmark.line === 'number' && onJumpToLine) onJumpToLine(bookmark.line);
  };

  const activeBookmark = bookmarkAt(bookmarks, displayTime);

  const nudge = (delta) => {
    if (loopA === null || loopB === null) {
      seek(timeRef.current + delta);
      return;
    }
    const width = loopB - loopA;
    const start = Math.min(Math.max(0, loopA + delta), Math.max(0, duration - width));
    setLoopA(start);
    setLoopB(start + width);
  };

  const scaleLoop = (factor) => {
    if (loopA === null || loopB === null) return;
    setLoopB(Math.min(duration, loopA + Math.max(0.2, (loopB - loopA) * factor)));
  };

  const setA = () => {
    const t = timeRef.current;
    setLoopA(t);
    if (loopB !== null && loopB <= t) setLoopB(null);
  };

  const setB = () => {
    const t = timeRef.current;
    if (loopA === null || t <= loopA) return;
    setLoopB(t);
    setIsLoopOn(true);
  };

  const clearLoop = () => {
    setLoopA(null);
    setLoopB(null);
    setIsLoopOn(false);
  };

  const loopCurrentSection = () => {
    if (!activeBookmark) return;
    const following = nextBookmark(bookmarks, activeBookmark.time);
    setLoopA(activeBookmark.time);
    setLoopB(following ? following.time : duration);
    setIsLoopOn(true);
    goToBookmark(activeBookmark);
  };

  // ---- Rendering ---------------------------------------------------------
  const button = (active = false, extra = {}) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 32,
    minWidth: 34,
    padding: '0 8px',
    borderRadius: 7,
    border: `1px solid ${active ? colors.played : colors.border}`,
    background: active ? colors.played : colors.control,
    color: active ? '#fff' : colors.text,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    ...extra
  });

  const groupStyle = { display: 'flex', alignItems: 'center', gap: 4 };
  const captionStyle = {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: colors.dim,
    marginBottom: 3
  };

  const Section = ({ caption, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={captionStyle}>{caption}</span>
      <div style={groupStyle}>{children}</div>
    </div>
  );

  const readout = (text, active, onClick, title) => (
    <button
      style={{ ...button(active), minWidth: 58, fontVariantNumeric: 'tabular-nums' }}
      onClick={onClick}
      title={title}
    >{text}</button>
  );

  if (!stems.length) {
    return (
      <div style={{
        borderTop: `1px solid ${colors.border}`,
        background: colors.panel,
        color: colors.text,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px'
      }}>
        <button style={button(isStemsPanelOpen)} onClick={onToggleStemsPanel} title="Add or split a backing track">
          <Glyph name="sliders" /> Tracks
        </button>
        <span style={{ fontSize: 12, color: colors.dim }}>
          No backing track yet. Add one for the waveform, looping and bookmarks.
        </span>
      </div>
    );
  }

  const view = windowFor(displayTime);
  const positionPercent = (seconds) => `${((seconds - view.start) / view.span) * 100}%`;
  const isInView = (seconds) => seconds >= view.start && seconds <= view.start + view.span;

  return (
    <div style={{
      borderTop: `1px solid ${colors.border}`,
      background: colors.panel,
      color: colors.text,
      flexShrink: 0,
      userSelect: 'none'
    }}>
      {/* Waveform */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
        style={{ position: 'relative', height, cursor: 'pointer', background: colors.deck, touchAction: 'none' }}
      >
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

        {engineState !== 'ready' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: colors.dim }}>
            {engineState === 'error' ? 'Could not load the backing track' : 'Loading the track…'}
          </div>
        )}

        {[['A', loopA], ['B', loopB]].map(([name, point]) => (point === null || !isInView(point)) ? null : (
          <div
            key={name}
            onPointerDown={(event) => { event.stopPropagation(); setDragging(name); trackRef.current?.setPointerCapture?.(event.pointerId); }}
            style={{
              position: 'absolute', top: 0, left: positionPercent(point), transform: 'translateX(-50%)',
              height: '100%', width: 18, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
              cursor: 'ew-resize', touchAction: 'none'
            }}
          >
            <span style={{ background: colors.played, color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: '14px', padding: '0 5px', borderRadius: 3 }}>
              {name}
            </span>
          </div>
        ))}

        {duration > 0 && bookmarks.filter(bookmark => isInView(bookmark.time)).map(bookmark => (
          <div
            key={bookmark.id}
            title={bookmark.label || formatTime(bookmark.time)}
            onPointerDown={(event) => { event.stopPropagation(); goToBookmark(bookmark); }}
            style={{
              position: 'absolute', bottom: 0, left: positionPercent(bookmark.time), transform: 'translateX(-50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', maxWidth: 120
            }}
          >
            {isMarkMode && (
              <button
                onPointerDown={(event) => { event.stopPropagation(); onDeleteBookmark?.(bookmark.id); }}
                style={{ border: 'none', borderRadius: '50%', width: 16, height: 16, lineHeight: '14px', fontSize: 11, cursor: 'pointer', background: '#ef4444', color: '#fff', marginBottom: 2 }}
                aria-label="Delete bookmark"
              >×</button>
            )}
            {activeBookmark?.id === bookmark.id && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: colors.pin,
                background: isDarkMode ? 'rgba(17,24,39,0.9)' : 'rgba(255,255,255,0.9)',
                padding: '0 3px', borderRadius: 2, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>{bookmark.label || formatTime(bookmark.time)}</span>
            )}
            <span style={{
              width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
              borderBottom: `7px solid ${activeBookmark?.id === bookmark.id ? colors.pin : colors.dim}`
            }} />
          </div>
        ))}
      </div>

      {/* Transport, with the play control given the most weight */}
      <div className="player-transport" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px 4px' }}>
        <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: colors.dim, minWidth: 56 }}>
          {formatTime(displayTime)}
        </span>
        <div style={{ ...groupStyle, gap: 6, margin: '0 auto' }}>
          <button style={button(false, { height: 38 })} onClick={() => goToBookmark(previousBookmark(bookmarks, timeRef.current) || bookmarks[0])} title="Previous bookmark">
            <Glyph name="prevMark" size={18} />
          </button>
          <button style={button(false, { height: 38 })} onClick={() => seek(timeRef.current - 5)} title="Back five seconds">
            <Glyph name="back5" size={18} />
          </button>
          <button
            data-play
            style={button(true, { height: 44, minWidth: 76, borderRadius: 22 })}
            onClick={togglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            <Glyph name={isPlaying ? 'pause' : 'play'} size={20} />
          </button>
          <button style={button(false, { height: 38 })} onClick={() => seek(timeRef.current + 5)} title="Forward five seconds">
            <Glyph name="fwd5" size={18} />
          </button>
          <button style={button(false, { height: 38 })} onClick={() => goToBookmark(nextBookmark(bookmarks, timeRef.current))} title="Next bookmark">
            <Glyph name="nextMark" size={18} />
          </button>
        </div>
        <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: colors.dim, minWidth: 56, textAlign: 'right' }}>
          {formatTime(duration ? duration - displayTime : 0, { signed: true })}
        </span>
      </div>

      {/* Sections */}
      <div className="player-sections" style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', padding: '4px 12px 10px' }}>
        <Section caption="Loop">
          <button style={button(loopA !== null)} onClick={setA} title="Set the loop start at the playhead">A</button>
          <button style={button(loopB !== null)} onClick={setB} title="Set the loop end at the playhead">B</button>
          <button
            style={button(isLoopOn)}
            onClick={() => setIsLoopOn(!isLoopOn)}
            disabled={loopA === null || loopB === null}
            title="Repeat the A to B section"
          ><Glyph name="loop" /></button>
          <button style={button()} onClick={clearLoop} title="Clear the loop points"><Glyph name="cross" /></button>
          <span className="player-advanced" style={groupStyle}>
            <button style={button()} onClick={() => nudge(-0.5)} title="Nudge the loop half a second earlier"><Glyph name="arrowLeft" /></button>
            <button style={button()} onClick={() => nudge(0.5)} title="Nudge the loop half a second later"><Glyph name="arrowRight" /></button>
            <button style={button()} onClick={() => scaleLoop(0.5)} title="Halve the loop">½</button>
            <button style={button()} onClick={() => scaleLoop(2)} title="Double the loop">×2</button>
          </span>
        </Section>

        <Section caption="Speed">
          <button style={button()} onClick={() => setSpeed(Math.max(0.25, Math.round((speed - 0.05) * 100) / 100))} title="Slower, same key">
            <Glyph name="minus" />
          </button>
          {readout(`${speed.toFixed(2)}x`, speed !== 1, () => setSpeed(1), 'Back to normal speed')}
          <button style={button()} onClick={() => setSpeed(Math.min(2, Math.round((speed + 0.05) * 100) / 100))} title="Faster, same key">
            <Glyph name="plus" />
          </button>
        </Section>

        <Section caption="Pitch">
          <button style={button()} onClick={() => setPitch(Math.max(-12, pitch - 1))} title="Down a semitone, same speed">
            <Glyph name="flat" />
          </button>
          {readout(`${pitch > 0 ? '+' : ''}${pitch}`, pitch !== 0, () => setPitch(0), 'Back to the original key')}
          <button style={button()} onClick={() => setPitch(Math.min(12, pitch + 1))} title="Up a semitone, same speed">
            <Glyph name="sharp" />
          </button>
        </Section>

        <Section caption="Zoom">
          <button style={button()} onClick={() => setZoom(current => Math.max(1, current / 2))} disabled={zoom <= 1} title="Show more of the track">
            <Glyph name="zoomOut" />
          </button>
          {readout(`${zoom}x`, zoom > 1, () => setZoom(1), 'Show the whole track')}
          <button style={button()} onClick={() => setZoom(current => Math.min(32, current * 2))} disabled={zoom >= 32} title="Zoom into the playhead">
            <Glyph name="zoomIn" />
          </button>
        </Section>

        <Section caption="Marks">
          <button style={button()} onClick={() => onAddBookmark?.(timeRef.current)} title="Drop a bookmark at the playhead">
            <Glyph name="addMark" />
          </button>
          <button style={button(isMarkMode)} onClick={onToggleMarkMode} title="Tap a lyric line to pin it to this moment">
            <Glyph name="markLines" />
          </button>
          <button style={button(isFollowing)} onClick={onToggleFollowing} disabled={bookmarks.length === 0} title="Keep the playing line on screen">
            <Glyph name="follow" />
          </button>
          <button style={button()} onClick={loopCurrentSection} disabled={!activeBookmark} title="Loop from this bookmark to the next">
            <Glyph name="loop" /> Verse
          </button>
          <button
            style={button()}
            onClick={() => {
              if (bookmarks.length && confirm(`Delete all ${bookmarks.length} bookmarks for this song?`)) onClearBookmarks?.();
            }}
            disabled={bookmarks.length === 0}
            title="Delete every bookmark on this song"
          ><Glyph name="trash" /></button>
        </Section>

        <Section caption="Tracks">
          <button style={button(isStemsPanelOpen)} onClick={onToggleStemsPanel} title="Add, split and mix the backing tracks">
            <Glyph name="sliders" />
          </button>
        </Section>
      </div>

      <style>{`
        @media (max-width: 640px) {
          /* A phone screen is mostly for the words, so the transport gives
             back every row it can: the loop nudges go, the padding shrinks,
             and the buttons come in to where a thumb still reaches. */
          .player-advanced { display: none !important; }
          .player-transport { gap: 6px !important; padding: 5px 8px 2px !important; }
          .player-sections { gap: 9px !important; padding: 2px 8px 6px !important; }
          .player-sections button { height: 28px !important; min-width: 30px !important; padding: 0 6px !important; }
          .player-transport button { height: 32px !important; }
          .player-transport button[data-play] { height: 38px !important; min-width: 62px !important; }
        }
      `}</style>
    </div>
  );
}
