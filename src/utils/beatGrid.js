// Snapping the A-B loop to the beat.
//
// The loop itself is already seamless — the wrap happens inside the sample
// pull. What makes a loop stumble is musical: if the distance from A to B is
// not a whole number of beats, the pulse shifts every time it comes round.
//
// So the thing to quantise is the interval, not the position. That needs only
// a tempo: the fixed end of the loop anchors the grid, and the moving end is
// pulled to a whole number of beats away from it. Knowing where beat one of
// the song truly falls would let both ends snap to an absolute grid, but that
// needs a downbeat, which a BPM alone does not give.

export const secondsPerBeat = (bpm) => (bpm > 0 ? 60 / bpm : 0);

// The unit a loop of this length should be measured in: bars once it is long
// enough to hold one, beats below that
export function gridUnit(length, bpm, meter = 4) {
  const beat = secondsPerBeat(bpm);
  if (!beat) return 0;
  const bar = beat * Math.max(1, meter);
  return length >= bar ? bar : beat;
}

// Pull `time` onto the grid laid out from `origin`, but only when it is already
// within `window` of a line — so a deliberate placement is left alone
export function stickySnap(time, origin, step, window) {
  if (!(step > 0)) return time;
  const steps = (time - origin) / step;
  const nearest = Math.round(steps);
  const landed = origin + nearest * step;
  return Math.abs(time - landed) <= window ? landed : time;
}

/**
 * Square the loop off to a whole number of beats or bars.
 *
 * `anchor` is the end that stays put; the other is moved. Returns the loop
 * unchanged when there is no tempo to work from.
 */
export function snapLoop(start, end, { bpm, meter = 4, anchor = 'start', duration = Infinity }) {
  const beat = secondsPerBeat(bpm);
  if (!beat || !(end > start)) return { start, end };

  const unit = gridUnit(end - start, bpm, meter);
  const units = Math.max(1, Math.round((end - start) / unit));
  const length = units * unit;

  if (anchor === 'end') {
    const from = Math.max(0, end - length);
    return { start: from, end: from + length };
  }
  const to = Math.min(duration, start + length);
  return { start: Math.max(0, to - length), end: to };
}
