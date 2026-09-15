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

// ---- Where the music actually turns over -------------------------------
//
// A tempo says how long a beat is, not where beat one falls, so the first
// point of a loop has no grid to land on. The audio itself does know: a chord
// change or a snare lands as a sharp rise in the waveform. Those rises are
// what a loop start wants to sit on, and the peaks drawn for the waveform are
// already a good enough picture of them.
//
// The resolution is one bucket — a few hundredths of a second on a typical
// song — which is close enough to hear as "on it" and far cheaper than
// decoding the audio again.

/**
 * Times, in seconds, where the sound rises sharply out of its surroundings.
 *
 * `peaks` is the normalised amplitude-per-bucket array drawn as the waveform.
 */
export function findOnsets(peaks, duration, { sensitivity = 1.2, minGap = 0.12 } = {}) {
  // 1.2 is set from real tracks rather than taste: a strummed bluegrass
  // instrumental carries so much sustained energy that a higher bar finds
  // nothing for seconds at a stretch, and a loop point then has nowhere near
  // it to land on. At 1.2 the transitions come about one per beat or two,
  // which is the spacing a loop start is actually chosen at.
  if (!peaks?.length || !(duration > 0)) return [];

  const perBucket = duration / peaks.length;
  const window = Math.max(3, Math.round(0.25 / perBucket)); // a quarter second either side
  const onsets = [];
  let last = -Infinity;

  for (let i = 1; i < peaks.length; i++) {
    const here = peaks[i];
    if (here <= peaks[i - 1]) continue; // only the rising edge

    // Loud compared with its neighbourhood, rather than loud outright, so a
    // quiet passage still has its own transitions
    let sum = 0;
    let seen = 0;
    for (let j = Math.max(0, i - window); j < Math.min(peaks.length, i + window); j++) {
      sum += peaks[j];
      seen++;
    }
    const local = seen ? sum / seen : 0;
    if (!(here > local * sensitivity)) continue;

    const at = i * perBucket;
    if (at - last < minGap) continue; // one hit, not the whole attack
    onsets.push(at);
    last = at;
  }

  return onsets;
}

/** The onset nearest `time`, or null when none is close enough to mean it. */
export function nearestOnset(onsets, time, window) {
  if (!onsets?.length || !(window > 0)) return null;

  let best = null;
  let bestGap = Infinity;
  for (const at of onsets) {
    const gap = Math.abs(at - time);
    if (gap < bestGap) {
      bestGap = gap;
      best = at;
    }
    if (at > time + window) break; // onsets are in order
  }
  return bestGap <= window ? best : null;
}
