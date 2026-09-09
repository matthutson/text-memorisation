import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPeaks } from '../utils/peaks';
import { bookmarkAt, nextBookmark, previousBookmark } from '../utils/bookmarks';
import { applyLoopRegion, applyPlaybackRate, clearLoopRegion, seekTo } from '../utils/playerControl';

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
  onLoopBookmark
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

    const total = duration || 1;
    const xOf = (seconds) => (seconds / total) * width;
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
      for (let x = 0; x < width; x += step) {
        const index = Math.floor((x / width) * peaks.length);
        const peak = peaks[Math.min(index, peaks.length - 1)] || 0;
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
  }, [colors, duration, loopA, loopB, peaks]);

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
    return Math.min(Math.max(0, ratio), 1) * duration;
  }, [duration]);

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
  const positionPercent = (seconds) => duration ? `${Math.min(100, Math.max(0, (seconds / duration) * 100))}%` : '0%';

  if (!stems.length) return null;

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
        {[['A', loopA], ['B', loopB]].map(([name, point]) => point === null ? null : (
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
        {duration > 0 && bookmarks.map(bookmark => (
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

        {/* Play and jumps */}
        <div style={group}>
          <button style={buttonStyle()} onClick={goToPrevious} title="Previous bookmark">⏮</button>
          <button style={buttonStyle()} onClick={() => seek(timeRef.current - 5)} title="Back 5 seconds">−5s</button>
          <button
            style={buttonStyle(isPlaying, { width: 54, fontSize: 14 })}
            onClick={togglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
          >{isPlaying ? '❚❚' : '▶'}</button>
          <button style={buttonStyle()} onClick={() => seek(timeRef.current + 5)} title="Forward 5 seconds">+5s</button>
          <button style={buttonStyle()} onClick={goToNext} title="Next bookmark">⏭</button>
        </div>

        {/* Loop */}
        <div style={group}>
          <button style={buttonStyle(loopA !== null)} onClick={setA} title="Set loop start at the playhead">A</button>
          <button style={buttonStyle(loopB !== null)} onClick={setB} title="Set loop end at the playhead">B</button>
          <button
            style={buttonStyle(isLoopOn)}
            onClick={() => setIsLoopOn(!isLoopOn)}
            disabled={loopA === null || loopB === null}
            title="Loop between A and B"
          >Loop</button>
          <button style={buttonStyle()} onClick={clearLoop} title="Clear loop points">✕</button>
        </div>

        {/* Fine tuning: secondary on a phone, where space is tight */}
        <div style={group} className="song-player-advanced">
          <button style={buttonStyle()} onClick={() => nudge(-0.5)} title="Nudge loop earlier">←</button>
          <button style={buttonStyle()} onClick={() => nudge(0.5)} title="Nudge loop later">→</button>
          <button style={buttonStyle()} onClick={() => scaleLoop(0.5)} title="Halve the loop">½</button>
          <button style={buttonStyle()} onClick={() => scaleLoop(2)} title="Double the loop">×2</button>
        </div>

        {/* Speed */}
        <div style={group}>
          <button style={buttonStyle()} onClick={() => setSpeed(Math.max(0.25, Math.round((speed - 0.05) * 100) / 100))} title="Slower">−</button>
          <button
            style={{ ...buttonStyle(speed !== 1), minWidth: 62, fontVariantNumeric: 'tabular-nums' }}
            onClick={() => setSpeed(1)}
            title="Back to normal speed"
          >{speed.toFixed(2)}x</button>
          <button style={buttonStyle()} onClick={() => setSpeed(Math.min(2, Math.round((speed + 0.05) * 100) / 100))} title="Faster">+</button>
        </div>

        {/* Lyrics */}
        <div style={group}>
          <button
            style={buttonStyle(isMarkMode)}
            onClick={onToggleMarkMode}
            title="Tap a lyric line while the track plays to bookmark it"
          >{isMarkMode ? 'Marking…' : 'Mark lyrics'}</button>
          <button
            style={buttonStyle(isFollowing)}
            onClick={onToggleFollowing}
            disabled={bookmarks.length === 0}
            title="Highlight and scroll to the line that is playing"
          >Follow</button>
          <button
            style={buttonStyle()}
            onClick={loopCurrentSection}
            disabled={!activeBookmark}
            title="Loop from the current bookmark to the next one"
          >Loop section</button>
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
