import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPeaks } from '../utils/peaks';
import { bookmarkAt, nextBookmark, previousBookmark } from '../utils/bookmarks';
import { applyLoopRegion, applyPlaybackRate, clearLoopRegion, seekTo } from '../utils/playerControl';
import { releasePitchShifted, renderPitchShifted } from '../utils/pitchShift';

const waveformHeight = () => (window.innerWidth < 768 ? 56 : 84);

const formatTime = (seconds, { signed = false } = {}) => {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '--:--.-';
  const sign = signed ? '-' : '';
  const total = Math.max(0, seconds);
  const mins = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  const tenths = Math.floor((total * 10) % 10);
  return `${sign}${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
};

/**
 * Transport bar for the backing track: waveform, A-B loop, speed and the
 * bookmarks that tie moments in the audio to lines of the lyrics.
 */
export default function SongPlayer({
  player,
  stems = [],
  bookmarks = [],
  isDarkMode,
  isMarkMode,
  onToggleMarkMode,
  isFollowing,
  onToggleFollowing,
  onActiveLineChange,
  onDeleteBookmark,
  onAddBookmark,
  onLoopBookmark,
  isStemsPanelOpen,
  onToggleStemsPanel,
  onPitchSources
}) {
  const [displayTime, setDisplayTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveform, setWaveform] = useState(null); // { src, peaks, duration }
  const [failedSrc, setFailedSrc] = useState(null);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [loopA, setLoopA] = useState(null);
  const [loopB, setLoopB] = useState(null);
  const [isLoopOn, setIsLoopOn] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(0); // semitones, independent of speed
  const [pitchProgress, setPitchProgress] = useState(null); // null unless re-rendering
  const [zoom, setZoom] = useState(1); // 1 = the whole track
  const [dragging, setDragging] = useState(null); // 'A' | 'B' | 'playhead'
  const [height] = useState(waveformHeight);

  const canvasRef = useRef(null);
  const trackRef = useRef(null);
  const timeRef = useRef(0);
  const drawRef = useRef(() => {});
  const loopAppliedRef = useRef(false);
  const activeLineRef = useRef(undefined);

  const colors = useMemo(() => (isDarkMode
    ? { wave: '#4b5563', played: '#60a5fa', playhead: '#ef4444', loop: 'rgba(96,165,250,0.16)', pin: '#f59e0b', text: '#e5e7eb', dim: '#9ca3af', panel: '#1f2937', border: '#374151', control: '#374151' }
    : { wave: '#cbd5e1', played: '#2563eb', playhead: '#ef4444', loop: 'rgba(37,99,235,0.12)', pin: '#d97706', text: '#111827', dim: '#6b7280', panel: '#ffffff', border: '#e5e7eb', control: '#f3f4f6' }
  ), [isDarkMode]);

  const audioSrc = stems[0]?.src || null;

  // ---- Waveform data -----------------------------------------------------
  useEffect(() => {
    if (!audioSrc) return undefined;
    let cancelled = false;
    getPeaks(audioSrc)
      .then(result => {
        if (!cancelled) setWaveform({ src: audioSrc, ...result });
      })
      .catch(error => {
        console.warn('[SongPlayer] Could not build waveform:', error?.message || error);
        if (!cancelled) setFailedSrc(audioSrc);
      });
    return () => { cancelled = true; };
  }, [audioSrc]);

  // Peaks belong to the track they were decoded from, so a stem swap clears them
  const peaks = waveform?.src === audioSrc ? waveform.peaks : null;
  const duration = (waveform?.src === audioSrc ? waveform.duration : 0) || playerDuration;
  const peaksState = !audioSrc
    ? 'idle'
    : peaks ? 'ready' : (failedSrc === audioSrc ? 'error' : 'loading');

  // ---- Player events -----------------------------------------------------
  useEffect(() => {
    if (!player) return;

    const onStart = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnd = () => setIsPlaying(false);
    const onTimeUpdate = (event) => {
      const t = event.detail?.t;
      if (typeof t === 'number') {
        timeRef.current = t;
        setDisplayTime(t);
      }
      const playerTotal = player.state?.duration;
      if (playerTotal && !waveform) setPlayerDuration(playerTotal);
    };

    player.addEventListener('start', onStart);
    player.addEventListener('pause', onPause);
    player.addEventListener('end', onEnd);
    player.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      player.removeEventListener('start', onStart);
      player.removeEventListener('pause', onPause);
      player.removeEventListener('end', onEnd);
      player.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [player, waveform]);

  // Smooth playhead: the player's timeupdate only fires a few times a second
  useEffect(() => {
    if (!player || !isPlaying) return;
    let frame;
    let lastShown = -1;
    const tick = () => {
      const t = player.state?.currentTime;
      if (typeof t === 'number') {
        timeRef.current = t;
        // The readout only needs tenths; the canvas gets every frame
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
  }, [player, isPlaying]);

  // ---- A-B loop ----------------------------------------------------------
  // Set the playback region and let the audio loop natively, which keeps the
  // loop gapless (see GaplessController).
  useEffect(() => {
    if (!player) return;
    const hasLoop = isLoopOn && loopA !== null && loopB !== null && loopB > loopA;

    if (hasLoop) {
      applyLoopRegion(player, loopA, loopB);
      loopAppliedRef.current = true;
    } else if (loopAppliedRef.current) {
      clearLoopRegion(player);
      loopAppliedRef.current = false;
    }
  }, [player, isLoopOn, loopA, loopB]);

  // ---- Speed -------------------------------------------------------------
  useEffect(() => {
    if (!player) return;
    const apply = () => applyPlaybackRate(player, speed);
    apply();
    // Newly added stems upgrade asynchronously
    const timer = setTimeout(apply, 150);
    return () => clearTimeout(timer);
  }, [player, speed, stems]);

  // ---- Which lyric line is playing --------------------------------------
  useEffect(() => {
    if (!onActiveLineChange) return;
    const active = bookmarkAt(bookmarks, displayTime);
    const line = active && typeof active.line === 'number' ? active.line : null;
    if (line !== activeLineRef.current) {
      activeLineRef.current = line;
      onActiveLineChange(line);
    }
  }, [bookmarks, displayTime, onActiveLineChange]);

  // ---- Canvas ------------------------------------------------------------
  // The waveform shows a window of the track, centred on the playhead when zoomed
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
    const height = canvas.clientHeight;
    if (!width || !height) return;

    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const view = windowFor(timeRef.current);
    const xOf = (seconds) => ((seconds - view.start) / view.span) * width;
    const middle = height / 2;

    // A-B region
    if (loopA !== null && loopB !== null && loopB > loopA) {
      ctx.fillStyle = colors.loop;
      ctx.fillRect(xOf(loopA), 0, xOf(loopB) - xOf(loopA), height);
    }

    // Waveform
    if (peaks && peaks.length) {
      const playedX = xOf(timeRef.current);
      const barWidth = 2;
      const gap = 1;
      const step = barWidth + gap;
      const total = duration || 1;
      for (let x = 0; x < width; x += step) {
        const seconds = view.start + (x / width) * view.span;
        const index = Math.floor((seconds / total) * peaks.length);
        const peak = peaks[Math.min(Math.max(0, index), peaks.length - 1)] || 0;
        const barHeight = Math.max(1.5, peak * (height - 8));
        ctx.fillStyle = x <= playedX ? colors.played : colors.wave;
        ctx.fillRect(x, middle - barHeight / 2, barWidth, barHeight);
      }
    }

    // Loop edges
    ctx.lineWidth = 2;
    [[loopA, 'A'], [loopB, 'B']].forEach(([point]) => {
      if (point === null) return;
      ctx.strokeStyle = colors.played;
      ctx.beginPath();
      ctx.moveTo(xOf(point), 0);
      ctx.lineTo(xOf(point), height);
      ctx.stroke();
    });

    // Playhead
    const headX = xOf(timeRef.current);
    ctx.strokeStyle = colors.playhead;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(headX, 0);
    ctx.lineTo(headX, height);
    ctx.stroke();
  }, [colors, duration, loopA, loopB, peaks, windowFor]);

  // The animation loop draws through a ref so it never restarts mid-playback
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
    if (!player || !duration) return;
    const clamped = seekTo(player, seconds, duration);
    timeRef.current = clamped;
    setDisplayTime(clamped);
    drawRef.current();
  }, [player, duration]);

  const timeFromEvent = useCallback((event) => {
    const track = trackRef.current;
    if (!track || !duration) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const view = windowFor(timeRef.current);
    return Math.min(Math.max(0, view.start + ratio * view.span), duration);
  }, [duration, windowFor]);

  const handleTrackPointerDown = (event) => {
    if (!duration) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const t = timeFromEvent(event);
    if (dragging === null) seek(t);
    setDragging('playhead');
  };

  const handleTrackPointerMove = (event) => {
    if (!dragging) return;
    const t = timeFromEvent(event);
    if (dragging === 'playhead') seek(t);
    if (dragging === 'A') setLoopA(Math.min(t, (loopB ?? duration) - 0.1));
    if (dragging === 'B') setLoopB(Math.max(t, (loopA ?? 0) + 0.1));
  };

  const endDrag = () => setDragging(null);

  const togglePlay = () => {
    if (!player) return;
    if (isPlaying) player.pause();
    else player.play();
  };

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
    const width = (loopB - loopA) * factor;
    setLoopB(Math.min(duration, loopA + Math.max(0.2, width)));
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

  const goToPrevious = () => {
    const target = previousBookmark(bookmarks, timeRef.current);
    seek(target ? target.time : 0);
  };

  const goToNext = () => {
    const target = nextBookmark(bookmarks, timeRef.current);
    if (target) seek(target.time);
  };

  const activeBookmark = bookmarkAt(bookmarks, displayTime);

  // Transposing re-renders the audio, so playback stops and resumes in place
  const changePitch = async (semitones) => {
    if (pitchProgress !== null) return;
    const target = Math.max(-6, Math.min(6, semitones));
    const resumeAt = timeRef.current;
    if (player && isPlaying) player.pause();

    setPitchProgress(0);
    try {
      let keep = [];
      if (target === 0) {
        onPitchSources?.(null);
      } else {
        const sources = {};
        for (const stem of stems) {
          sources[stem.src] = await renderPitchShifted(stem.src, target, setPitchProgress);
        }
        onPitchSources?.(sources);
        keep = Object.values(sources);
      }
      setPitch(target);

      // Let the player load the new files, then restore speed and position and
      // free the copies nothing points at any more
      setTimeout(() => {
        applyPlaybackRate(player, speed);
        seek(resumeAt);
        releasePitchShifted(keep);
      }, 900);
    } catch (error) {
      console.warn('[SongPlayer] Could not change pitch:', error?.message || error);
    } finally {
      setPitchProgress(null);
    }
  };

  const addBookmarkHere = () => {
    if (onAddBookmark) onAddBookmark(timeRef.current);
  };

  const loopCurrentSection = () => {
    if (!activeBookmark) return;
    const following = nextBookmark(bookmarks, activeBookmark.time);
    setLoopA(activeBookmark.time);
    setLoopB(following ? following.time : duration);
    setIsLoopOn(true);
    seek(activeBookmark.time);
    if (onLoopBookmark) onLoopBookmark(activeBookmark);
  };

  // ---- Rendering ---------------------------------------------------------
  const group = { display: 'flex', alignItems: 'center', gap: 6 };

  const groupLabel = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: colors.dim
  };

  const buttonStyle = (active = false, extra = {}) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 34,
    padding: '0 10px',
    borderRadius: 8,
    border: `1px solid ${active ? colors.played : colors.border}`,
    background: active ? colors.played : colors.control,
    color: active ? '#fff' : colors.text,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.03em',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    ...extra
  });

  const remaining = duration ? duration - displayTime : 0;
  const view = windowFor(displayTime);
  const positionPercent = (seconds) => `${((seconds - view.start) / view.span) * 100}%`;
  const isInView = (seconds) => seconds >= view.start && seconds <= view.start + view.span;

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
        padding: '8px 12px'
      }}>
        <button
          style={buttonStyle(isStemsPanelOpen)}
          onClick={onToggleStemsPanel}
          title="Add or split a backing track"
        >Tracks</button>
        <span style={{ fontSize: 12, color: colors.dim }}>
          No backing track yet. Add one to get the waveform, looping and bookmarks.
        </span>
      </div>
    );
  }

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
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          position: 'relative',
          height,
          cursor: 'pointer',
          background: isDarkMode ? '#111827' : '#f8fafc',
          touchAction: 'none'
        }}
      >
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

        {peaksState === 'loading' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: colors.dim }}>
            Building waveform…
          </div>
        )}
        {peaksState === 'error' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: colors.dim }}>
            Waveform unavailable — transport still works
          </div>
        )}

        {/* Loop handles */}
        {[['A', loopA], ['B', loopB]].map(([name, point]) => (point === null || !isInView(point)) ? null : (
          <div
            key={name}
            onPointerDown={(event) => { event.stopPropagation(); setDragging(name); trackRef.current?.setPointerCapture?.(event.pointerId); }}
            style={{
              position: 'absolute',
              top: 0,
              left: positionPercent(point),
              transform: 'translateX(-50%)',
              height: '100%',
              width: 18,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              cursor: 'ew-resize',
              touchAction: 'none'
            }}
          >
            <span style={{
              background: colors.played,
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              lineHeight: '14px',
              padding: '0 5px',
              borderRadius: 3
            }}>{name}</span>
          </div>
        ))}

        {/* Bookmark pins */}
        {duration > 0 && bookmarks.filter(bookmark => isInView(bookmark.time)).map(bookmark => (
          <div
            key={bookmark.id}
            title={bookmark.label || formatTime(bookmark.time)}
            onPointerDown={(event) => { event.stopPropagation(); seek(bookmark.time); }}
            style={{
              position: 'absolute',
              bottom: 0,
              left: positionPercent(bookmark.time),
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'pointer',
              maxWidth: 120
            }}
          >
            {isMarkMode && (
              <button
                onPointerDown={(event) => { event.stopPropagation(); onDeleteBookmark?.(bookmark.id); }}
                style={{
                  border: 'none',
                  borderRadius: '50%',
                  width: 16,
                  height: 16,
                  lineHeight: '14px',
                  fontSize: 11,
                  cursor: 'pointer',
                  background: '#ef4444',
                  color: '#fff',
                  marginBottom: 2
                }}
                aria-label="Delete bookmark"
              >×</button>
            )}
            {activeBookmark?.id === bookmark.id && (
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: colors.pin,
                background: isDarkMode ? 'rgba(17,24,39,0.9)' : 'rgba(255,255,255,0.9)',
                padding: '0 3px',
                borderRadius: 2,
                maxWidth: 110,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>{bookmark.label || formatTime(bookmark.time)}</span>
            )}
            <span style={{
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderBottom: `7px solid ${activeBookmark?.id === bookmark.id ? colors.pin : colors.dim}`
            }} />
          </div>
        ))}
      </div>

      {/* Transport */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        padding: '8px 12px'
      }}>
        <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: colors.dim, minWidth: 52 }}>
          {formatTime(displayTime)}
        </span>

        {/* Playback */}
        <div style={group}>
          <button style={buttonStyle()} onClick={goToPrevious} title="Jump to the previous bookmark">Prev mark</button>
          <button style={buttonStyle()} onClick={() => seek(timeRef.current - 5)} title="Back five seconds">Back 5s</button>
          <button
            style={buttonStyle(isPlaying, { minWidth: 64 })}
            onClick={togglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
          >{isPlaying ? 'Pause' : 'Play'}</button>
          <button style={buttonStyle()} onClick={() => seek(timeRef.current + 5)} title="Forward five seconds">Fwd 5s</button>
          <button style={buttonStyle()} onClick={goToNext} title="Jump to the next bookmark">Next mark</button>
        </div>

        {/* Loop */}
        <div style={group}>
          <span style={groupLabel}>Loop</span>
          <button style={buttonStyle(loopA !== null)} onClick={setA} title="Start the loop at the playhead">Set A</button>
          <button style={buttonStyle(loopB !== null)} onClick={setB} title="End the loop at the playhead">Set B</button>
          <button
            style={buttonStyle(isLoopOn)}
            onClick={() => setIsLoopOn(!isLoopOn)}
            disabled={loopA === null || loopB === null}
            title="Play the A to B section over and over"
          >{isLoopOn ? 'Looping' : 'Loop off'}</button>
          <button style={buttonStyle()} onClick={clearLoop} title="Forget the loop points">Clear</button>
        </div>

        {/* Loop fine tuning, hidden on a phone where space is tight */}
        <div style={group} className="song-player-advanced">
          <button style={buttonStyle()} onClick={() => nudge(-0.5)} title="Move the loop half a second earlier">Nudge −</button>
          <button style={buttonStyle()} onClick={() => nudge(0.5)} title="Move the loop half a second later">Nudge +</button>
          <button style={buttonStyle()} onClick={() => scaleLoop(0.5)} title="Halve the length of the loop">Halve</button>
          <button style={buttonStyle()} onClick={() => scaleLoop(2)} title="Double the length of the loop">Double</button>
        </div>

        {/* Speed */}
        <div style={group}>
          <span style={groupLabel}>Speed</span>
          <button style={buttonStyle()} onClick={() => setSpeed(Math.max(0.25, Math.round((speed - 0.05) * 100) / 100))} title="Slow the track down">Slower</button>
          <button
            style={{ ...buttonStyle(speed !== 1), minWidth: 62, fontVariantNumeric: 'tabular-nums' }}
            onClick={() => setSpeed(1)}
            title="Back to normal speed"
          >{speed.toFixed(2)}x</button>
          <button style={buttonStyle()} onClick={() => setSpeed(Math.min(2, Math.round((speed + 0.05) * 100) / 100))} title="Speed the track up">Faster</button>
        </div>

        {/* Pitch */}
        <div style={group}>
          <span style={groupLabel}>Pitch</span>
          <button
            style={buttonStyle()}
            onClick={() => changePitch(pitch - 1)}
            disabled={pitchProgress !== null || !stems.length}
            title="Down a semitone, without changing the speed"
          >Down</button>
          <button
            style={{ ...buttonStyle(pitch !== 0), minWidth: 74, fontVariantNumeric: 'tabular-nums' }}
            onClick={() => changePitch(0)}
            disabled={pitchProgress !== null}
            title="Back to the original key"
          >
            {pitchProgress !== null
              ? `${pitchProgress}%`
              : `${pitch > 0 ? '+' : ''}${pitch} semi`}
          </button>
          <button
            style={buttonStyle()}
            onClick={() => changePitch(pitch + 1)}
            disabled={pitchProgress !== null || !stems.length}
            title="Up a semitone, without changing the speed"
          >Up</button>
        </div>

        {/* Waveform zoom */}
        <div style={group}>
          <span style={groupLabel}>Zoom</span>
          <button
            style={buttonStyle()}
            onClick={() => setZoom(current => Math.max(1, current / 2))}
            disabled={zoom <= 1}
            title="Show more of the track"
          >Out</button>
          <button style={{ ...buttonStyle(zoom > 1), minWidth: 46 }} onClick={() => setZoom(1)} title="Show the whole track">
            {zoom}x
          </button>
          <button
            style={buttonStyle()}
            onClick={() => setZoom(current => Math.min(32, current * 2))}
            disabled={zoom >= 32}
            title="Zoom into the playhead"
          >In</button>
        </div>

        {/* Lyrics and bookmarks */}
        <div style={group}>
          <span style={groupLabel}>Marks</span>
          <button style={buttonStyle()} onClick={addBookmarkHere} title="Drop a bookmark at the playhead">Add mark</button>
          <button
            style={buttonStyle(isMarkMode)}
            onClick={onToggleMarkMode}
            title="Tap a lyric line while the track plays to pin it to that moment"
          >{isMarkMode ? 'Tap a line…' : 'Mark lines'}</button>
          <button
            style={buttonStyle(isFollowing)}
            onClick={onToggleFollowing}
            disabled={bookmarks.length === 0}
            title="Highlight and scroll to the line that is playing"
          >Follow text</button>
          <button
            style={buttonStyle()}
            onClick={loopCurrentSection}
            disabled={!activeBookmark}
            title="Loop from the bookmark that is playing to the next one"
          >Loop verse</button>
        </div>

        <div style={group}>
          <button
            style={buttonStyle(isStemsPanelOpen)}
            onClick={onToggleStemsPanel}
            title="Add, split and mix the backing tracks"
          >Tracks</button>
        </div>

        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: colors.dim }}>
          {formatTime(remaining, { signed: true })}
        </span>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .song-player-advanced { display: none !important; }
        }
      `}</style>
    </div>
  );
}
