//
// The scroll, taught by hand.
//
// Pacing the words by the length of the track assumes a song moves at one
// steady rate, and no song does: there are instrumental breaks, held notes and
// verses that hurry. So the app can be shown instead. While the track plays, a
// finger on the words takes the page over: hold it still where the song waits,
// or push it along where the page has fallen behind. Let go and it carries on
// from there, covering what is left of the page in what is left of the song.
//
// What that leaves behind is a handful of anchors, each saying where the page
// should be at one moment: { time in seconds, at as a fraction of the whole
// page }. A fraction rather than a pixel, so a song taught on a laptop still
// means something on a phone, where the words are a different size and the
// page a different length. Between anchors the page moves at a steady rate,
// and after the last one it aims for the end of the page at the end of the
// song, which is the same rule as having no anchors at all.
//

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * Read a stored map. Anchors come back sorted and deduplicated. A map from
 * before anchors existed is a list of [from, to] holds; those are replayed
 * under the old rule and kept as the anchors they amount to.
 */
export const toAnchors = (stored = [], duration = 0) => {
  if (!Array.isArray(stored) || !stored.length) return [];

  if (Array.isArray(stored[0])) return fromHolds(stored, duration);

  const anchors = stored
    .filter(anchor => anchor && Number.isFinite(anchor.time) && Number.isFinite(anchor.at))
    .map(anchor => ({ time: Math.max(0, anchor.time), at: clamp(anchor.at, 0, 1) }))
    .sort((a, b) => a.time - b.time);

  // One anchor per moment: the later teaching wins
  return anchors.filter((anchor, index) => {
    const next = anchors[index + 1];
    return !next || next.time - anchor.time > 0.02;
  });
};

/** The old shape: pairs of seconds the page was held still */
const fromHolds = (holds, duration) => {
  if (!duration) return [];
  const clean = holds
    .filter(hold => Array.isArray(hold) && Number.isFinite(hold[0]) && Number.isFinite(hold[1]) && hold[1] > hold[0])
    .sort((a, b) => a[0] - b[0]);

  const anchors = [];
  let at = 0;
  let since = 0;
  clean.forEach(([from, to]) => {
    if (from >= duration) return;
    const rate = (1 - at) / (duration - since);
    at = clamp(at + rate * (from - since), 0, 1);
    anchors.push({ time: from, at }, { time: to, at });
    since = to;
  });
  return anchors;
};

/** Where the page should be at `time`, in the same units as `furthest` */
export const positionAt = (anchors, time, duration, furthest) => {
  if (!duration || furthest <= 0) return 0;
  const points = [{ time: 0, at: 0 }, ...anchors, { time: duration, at: 1 }];

  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1];
    const after = points[index];
    if (time > after.time) continue;
    const span = after.time - before.time;
    const share = span > 0 ? (time - before.time) / span : 0;
    return clamp(before.at + (after.at - before.at) * share, 0, 1) * furthest;
  }
  return furthest;
};

/**
 * The other way round: which moment belongs at `position`, so a hand dragging
 * the words can take the playhead with it. Where the page waits, and one place
 * answers to many moments, the useful answer is the moment the wait began.
 */
export const timeAt = (anchors, position, duration, furthest) => {
  if (!duration || furthest <= 0) return 0;
  const wanted = clamp(position / furthest, 0, 1);
  const points = [{ time: 0, at: 0 }, ...anchors, { time: duration, at: 1 }];

  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1];
    const after = points[index];
    const low = Math.min(before.at, after.at);
    const high = Math.max(before.at, after.at);
    if (wanted > high) continue;
    if (wanted < low) return before.time;
    const span = after.at - before.at;
    const share = span !== 0 ? (wanted - before.at) / span : 0;
    return clamp(before.time + (after.time - before.time) * share, 0, duration);
  }
  return duration;
};

/** Add what has just been taught, replacing any anchors it overrules */
export const withAnchors = (anchors, added = []) => {
  const fresh = added.filter(anchor => anchor && Number.isFinite(anchor.time) && Number.isFinite(anchor.at));
  if (!fresh.length) return anchors;

  const from = Math.min(...fresh.map(anchor => anchor.time));
  const to = Math.max(...fresh.map(anchor => anchor.time));
  // Teaching a stretch again replaces what was there, rather than arguing with it
  const kept = anchors.filter(anchor => anchor.time < from - 0.02 || anchor.time > to + 0.02);
  return toAnchors([...kept, ...fresh.map(anchor => ({ time: Math.max(0, anchor.time), at: clamp(anchor.at, 0, 1) }))]);
};

/** Whether a song has been taught anything worth replaying */
export const hasTiming = (anchors) => Array.isArray(anchors) && anchors.length > 0;
