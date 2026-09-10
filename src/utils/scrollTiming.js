//
// The scroll, taught by hand.
//
// Pacing the words by the length of the track assumes a song moves at one
// steady rate, and no song does: there are instrumental breaks, held notes and
// verses that hurry. So the app can be shown instead. While the track plays,
// holding a finger on the words stops the scroll; letting go starts it again
// and it catches up so the last line still lands with the last bar.
//
// What that leaves behind is only the list of moments that were held, because
// everything between them follows from the rule above: on release, cover the
// rest of the page in the rest of the song. Storing the holds rather than a
// sampled curve keeps it small and readable, and it replays exactly.
//

/** Tidy a taught list: sorted, non-overlapping, no negative or zero-length holds */
export const tidyPauses = (pauses = []) => {
  const clean = pauses
    .filter(pause => Array.isArray(pause) && typeof pause[0] === 'number')
    .map(([from, to]) => [Math.max(0, from), typeof to === 'number' ? Math.max(0, to) : null])
    .filter(([from, to]) => to === null || to > from + 0.05)
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  clean.forEach(pause => {
    const last = merged[merged.length - 1];
    // A hold that starts inside the one before it is the same hold
    if (last && last[1] !== null && pause[0] <= last[1]) {
      last[1] = pause[1] === null ? null : Math.max(last[1], pause[1]);
      return;
    }
    merged.push([...pause]);
  });
  return merged;
};

/**
 * How far along the page should be at `time`, in the same units as `furthest`.
 * With no holds this is the plain proportion of the track played.
 */
export const positionAt = (pauses, time, duration, furthest) => {
  if (!duration || furthest <= 0) return 0;
  const held = tidyPauses(pauses);
  if (!held.length) return Math.min(furthest, (time / duration) * furthest);

  let at = 0;      // where the page has reached
  let since = 0;   // the moment the current run started

  for (const [from, to] of held) {
    if (from >= duration) break;
    const rate = since >= duration ? 0 : (furthest - at) / (duration - since);
    if (time <= from) return Math.min(furthest, at + rate * (time - since));

    at = Math.min(furthest, at + rate * (from - since));
    if (to === null || time <= to) return at; // still being held
    since = to;
  }

  const rate = since >= duration ? 0 : (furthest - at) / (duration - since);
  return Math.min(furthest, at + rate * (time - since));
};

/**
 * The other way round: which moment in the track belongs at `position`, so a
 * hand dragging the words can take the playhead with it. A held stretch has
 * one position and many moments, and the useful answer there is the moment the
 * hold began: the page waits, so dragging to it means arriving at the wait.
 */
export const timeAt = (pauses, position, duration, furthest) => {
  if (!duration || furthest <= 0) return 0;
  const wanted = Math.min(furthest, Math.max(0, position));
  const held = tidyPauses(pauses).filter(([, to]) => to !== null);
  if (!held.length) return (wanted / furthest) * duration;

  let at = 0;
  let since = 0;

  for (const [from, to] of held) {
    if (from >= duration) break;
    const rate = since >= duration ? 0 : (furthest - at) / (duration - since);
    const reached = at + rate * (from - since);
    if (wanted <= reached) return rate > 0 ? since + (wanted - at) / rate : since;
    at = reached;
    since = to;
  }

  const rate = since >= duration ? 0 : (furthest - at) / (duration - since);
  return Math.min(duration, rate > 0 ? since + (wanted - at) / rate : since);
};

/** Whether a song has been taught anything worth replaying */
export const hasTiming = (pauses) => tidyPauses(pauses).some(([, to]) => to !== null);
