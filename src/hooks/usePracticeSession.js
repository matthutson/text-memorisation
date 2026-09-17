import { useEffect, useRef } from 'react';
import { recordPractice } from '../utils/practiceTally';

//
// What counts as having practised a song.
//
// Opening one is not it: a browse through a folder would run the tally up
// without a note being sung. A mark is earned by staying with a song — five
// minutes with it on the screen and in front of you — and each sitting earns
// one mark however long it runs on, because a tally counts times you sat down,
// not minutes served.
//
// Time only gathers while the tab is actually being looked at, so a song left
// open behind another window overnight earns nothing.
//
export const PRACTICE_MINUTES = 5;
const THRESHOLD = PRACTICE_MINUTES * 60 * 1000;
const CHECK_EVERY = 15000;

/**
 * Count one practice of `songId` once it has been open and visible long enough.
 *
 * @param songId    the song on screen, or null for none
 * @param onCounted called with the new tally when the mark is earned
 */
export default function usePracticeSession(songId, onCounted) {
  const onCountedRef = useRef(onCounted);
  useEffect(() => { onCountedRef.current = onCounted; }, [onCounted]);

  useEffect(() => {
    if (!songId) return undefined;

    let gathered = 0;
    let since = document.visibilityState === 'visible' ? Date.now() : null;
    let counted = false;

    const gather = () => {
      if (since === null) return;
      const now = Date.now();
      gathered += now - since;
      since = now;
    };

    const check = () => {
      gather();
      if (counted || gathered < THRESHOLD) return;
      counted = true;
      onCountedRef.current?.(recordPractice(songId));
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        since = Date.now();
      } else {
        gather();
        since = null;
      }
    };

    const timer = setInterval(check, CHECK_EVERY);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [songId]);
}
