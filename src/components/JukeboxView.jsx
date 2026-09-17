import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Box, Button, Flex, IconButton, Text, Tooltip } from '@radix-ui/themes';
import SongPlayer from './SongPlayer';
import StemPlayerWrapper from './StemPlayerWrapper';
import { track } from '../utils/usage';

//
// The player-first view: one song at a time, the whole transport and the mixer,
// and no words. It is for the times when practice is playing along rather than
// reading — put a folder on, skip through it, shuffle it.
//
// The songs it plays are the ones that have something to play. A song with no
// backing track cannot be skipped to, so it is counted at the foot of the queue
// rather than sitting in it as a dead end.
//

const shuffled = (list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** The order songs are played in: as listed, or shuffled with one held at the front */
const buildOrder = (ids, { shuffle, first }) => {
  if (!shuffle) return ids;
  const rest = shuffled(ids.filter(id => id !== first));
  return first && ids.includes(first) ? [first, ...rest] : rest;
};

const glyphs = {
  prev: <><path d="M18 5v14l-10-7z" fill="currentColor" stroke="none" /><path d="M6 5v14" /></>,
  next: <><path d="M6 5v14l10-7z" fill="currentColor" stroke="none" /><path d="M18 5v14" /></>,
  shuffle: (
    <>
      <path d="M16 3h5v5" /><path d="M4 20L21 3" />
      <path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" />
    </>
  ),
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  words: <path d="M4 6h16M4 12h10M4 18h13" />
};

const Glyph = ({ name, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {glyphs[name]}
  </svg>
);

export default function JukeboxView({
  songs = [],
  folderName = 'All songs',
  isDarkMode,
  onSongOpened,
  onOpenPractice,
  onDataChanged,
  silentCount = 0
}) {
  const ids = useMemo(() => songs.map(song => song.id), [songs]);
  // The queue is rebuilt when the folder's songs change, not every time the
  // list is recalculated: a shuffle that reshuffled itself on every render
  // would never play the song it had just promised to play next.
  const idKey = ids.join('|');
  const [currentId, setCurrentId] = useState(() => ids[0] || null);
  const [isShuffled, setIsShuffled] = useState(false);
  const [order, setOrder] = useState(() => ids);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isMixerOpen, setIsMixerOpen] = useState(true);
  // Stems uploaded from inside this view, before the song list has caught up
  const [stemsById, setStemsById] = useState({});

  const [engine, setEngine] = useState(null);
  const engineRef = useRef(null);
  const wantsPlayRef = useRef(false);
  const currentIdRef = useRef(currentId);
  useEffect(() => { currentIdRef.current = currentId; }, [currentId]);

  // The queue follows the folder and the shuffle. Whatever is playing stays
  // playing: a reshuffle mid-song holds it at the front rather than cutting it.
  useEffect(() => {
    const list = idKey ? idKey.split('|') : [];
    const held = list.includes(currentIdRef.current) ? currentIdRef.current : null;
    setOrder(buildOrder(list, { shuffle: isShuffled, first: held }));
    if (!held) setCurrentId(list[0] || null);
  }, [idKey, isShuffled]);

  const current = useMemo(
    () => songs.find(song => song.id === currentId) || null,
    [songs, currentId]
  );

  const stems = (current && stemsById[current.id]) || current?.stems || [];

  // Opening a song here is practice just as much as opening its words is
  useEffect(() => {
    if (current && onSongOpened) onSongOpened(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const step = useCallback((delta) => {
    if (order.length < 2) return;
    const at = order.indexOf(currentIdRef.current);
    const next = order[((at < 0 ? 0 : at) + delta + order.length) % order.length];
    // A skip while it is playing keeps playing; a skip while it is stopped does not
    wantsPlayRef.current = !!engineRef.current?.isPlaying;
    setCurrentId(next);
  }, [order]);

  const handleEngineReady = useCallback((instance) => {
    engineRef.current = instance;
    setEngine(instance);
  }, []);

  // A song that has just loaded takes over from the one that ended or was
  // skipped, and the end of a song moves the queue on by itself.
  useEffect(() => {
    if (!engine) return undefined;
    if (wantsPlayRef.current) {
      wantsPlayRef.current = false;
      engine.play();
    }
    return engine.on('end', () => {
      wantsPlayRef.current = true;
      step(1);
    });
  }, [engine, step]);

  const skip = (delta) => {
    track('jukebox.skip', delta < 0 ? 'previous' : 'next');
    step(delta);
  };

  const toggleShuffle = () => {
    setIsShuffled(value => {
      track('jukebox.shuffle', value ? 'off' : 'on');
      return !value;
    });
  };

  const queue = useMemo(
    () => order.map(id => songs.find(song => song.id === id)).filter(Boolean),
    [order, songs]
  );
  const upNext = useMemo(() => {
    const at = queue.findIndex(song => song.id === currentId);
    return at < 0 ? queue : [...queue.slice(at + 1), ...queue.slice(0, at)];
  }, [queue, currentId]);

  if (!current) {
    return (
      <Flex direction="column" align="center" gap="2" py="9" px="4">
        <Text size="3" color="gray">Nothing to play in {folderName}</Text>
        <Text size="2" color="gray">
          {silentCount > 0
            ? `${silentCount} ${silentCount === 1 ? 'song has' : 'songs have'} no backing track yet. Open one and add or fetch a track for it.`
            : 'Add a song with a backing track and it will turn up here.'}
        </Text>
      </Flex>
    );
  }

  return (
    <Box>
      <style>{`
        /* The mixer is a side panel in the practice view; here it sits under
           the transport and has the width to itself. */
        .jukebox-mixer .stems-panel {
          width: auto !important;
          max-height: 40vh !important;
          height: auto !important;
          border-left: none !important;
          border-top: 1px solid var(--gray-a5) !important;
        }
        .jukebox-mixer .stems-panel .stem-fader { flex-basis: auto !important; max-width: 320px !important; }

        /* On a phone the song's name has the row to itself and the skips sit
           under it, where a thumb reaches them */
        @media (max-width: 640px) {
          .jukebox-head { flex-direction: column; align-items: stretch !important; gap: var(--space-2) !important; }
          .jukebox-head-controls { justify-content: space-between; }
        }
      `}</style>

      <Box
        px={{ initial: '3', md: '5' }}
        py="3"
        style={{ maxWidth: 980, margin: '0 auto' }}
      >
        {/* What is playing, and the two controls this view exists for */}
        <Flex className="jukebox-head" align="center" justify="between" gap="3" mb="3" wrap="wrap">
          <Box style={{ minWidth: 0, flex: 1 }}>
            <Text as="div" size="5" weight="bold" truncate>{current.title}</Text>
            <Flex align="center" gap="2">
              {current.artist && <Text as="div" size="2" color="gray" truncate>{current.artist}</Text>}
              <Badge variant="soft" color="gray" radius="full">
                {folderName} · {queue.indexOf(current) + 1} of {queue.length}
              </Badge>
            </Flex>
          </Box>

          <Flex className="jukebox-head-controls" align="center" gap="2">
            <Tooltip content="Previous song">
              <IconButton size="3" variant="soft" onClick={() => skip(-1)} disabled={queue.length < 2} aria-label="Previous song">
                <Glyph name="prev" />
              </IconButton>
            </Tooltip>
            <Tooltip content="Next song">
              <IconButton size="3" variant="soft" onClick={() => skip(1)} disabled={queue.length < 2} aria-label="Next song">
                <Glyph name="next" />
              </IconButton>
            </Tooltip>
            <Tooltip content={isShuffled ? 'Play in order' : 'Shuffle this folder'}>
              <IconButton
                size="3"
                variant={isShuffled ? 'solid' : 'soft'}
                color={isShuffled ? undefined : 'gray'}
                onClick={toggleShuffle}
                disabled={queue.length < 2}
                aria-label="Shuffle"
              >
                <Glyph name="shuffle" />
              </IconButton>
            </Tooltip>
            <Tooltip content="Up next">
              <IconButton
                size="3"
                variant={isQueueOpen ? 'solid' : 'soft'}
                color={isQueueOpen ? undefined : 'gray'}
                onClick={() => setIsQueueOpen(open => !open)}
                aria-label="Show the queue"
              >
                <Glyph name="list" />
              </IconButton>
            </Tooltip>
            <Tooltip content="Open the words for this song">
              <IconButton size="3" variant="soft" color="gray" onClick={() => onOpenPractice?.(current)} aria-label="Open the words">
                <Glyph name="words" />
              </IconButton>
            </Tooltip>
          </Flex>
        </Flex>

        {/* The transport itself: waveform, loop, speed, key, zoom */}
        <Box style={{ borderRadius: 'var(--radius-4)', overflow: 'hidden', border: '1px solid var(--gray-a5)' }}>
          <SongPlayer
            key={current.id}
            songId={current.id}
            stems={stems}
            bookmarks={[]}
            isDarkMode={isDarkMode}
            isStemsPanelOpen={isMixerOpen}
            onToggleStemsPanel={() => { setIsMixerOpen(open => !open); track('jukebox.mixer', isMixerOpen ? 'close' : 'open'); }}
            onEngineReady={handleEngineReady}
            showMarks={false}
          />

          <Box className="jukebox-mixer">
            <StemPlayerWrapper
              stems={stems}
              setStems={(next) => setStemsById(map => ({ ...map, [current.id]: next }))}
              textId={current.id}
              youtubeUrl={current.youtubeUrl || ''}
              isDarkMode={isDarkMode}
              isVisible={isMixerOpen}
              onStemsUpdate={onDataChanged}
              engine={engine}
            />
          </Box>
        </Box>

        {isQueueOpen && (
          <Box mt="3">
            <Text as="div" size="1" weight="bold" color="gray" mb="2" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Up next
            </Text>
            <Flex direction="column" gap="1">
              {upNext.length === 0 && <Text size="2" color="gray">Nothing else in this folder.</Text>}
              {upNext.map(song => (
                <Flex
                  key={song.id}
                  align="center"
                  justify="between"
                  px="2"
                  py="1"
                  style={{ borderRadius: 'var(--radius-3)', cursor: 'pointer', background: 'var(--gray-a2)' }}
                  onClick={() => {
                    wantsPlayRef.current = !!engineRef.current?.isPlaying;
                    setCurrentId(song.id);
                    track('jukebox.pick');
                  }}
                >
                  <Text size="2" truncate>{song.title}</Text>
                  {song.artist && <Text size="1" color="gray" truncate>{song.artist}</Text>}
                </Flex>
              ))}
            </Flex>
          </Box>
        )}

        {silentCount > 0 && (
          <Text as="div" size="1" color="gray" mt="3">
            {silentCount} {silentCount === 1 ? 'song in this folder has' : 'songs in this folder have'} no
            backing track yet, so {silentCount === 1 ? 'it is' : 'they are'} not in the queue.
          </Text>
        )}

        <Flex justify="center" mt="4">
          <Button variant="soft" color="gray" onClick={() => onOpenPractice?.(current)}>
            Practise “{current.title}” with the words
          </Button>
        </Flex>
      </Box>
    </Box>
  );
}
