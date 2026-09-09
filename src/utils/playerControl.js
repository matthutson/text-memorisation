// Imperative controls for the <stemplayer-js> web component.
//
// These live outside the React components because the player is a DOM node
// that we drive by setting properties on it, not a value we render.

/** Seek to `seconds`, clamped into the track */
export const seekTo = (player, seconds, duration) => {
  if (!player) return 0;
  const limit = duration ? duration - 0.05 : seconds;
  const clamped = Math.min(Math.max(0, seconds), limit);
  player.currentTime = clamped;
  return clamped;
};

/**
 * Loop between `a` and `b` by setting the playback region and letting the
 * source nodes loop natively, which keeps the loop gapless.
 */
export const applyLoopRegion = (player, a, b) => {
  if (!player) return;
  const current = player.state?.currentTime;
  player.offset = a;
  player.duration = b - a;
  player.loop = true;
  if (typeof current === 'number' && (current < a || current >= b)) {
    player.currentTime = a;
  }
};

/** Play the whole track again */
export const clearLoopRegion = (player) => {
  if (!player) return;
  player.loop = false;
  player.offset = 0;
  player.duration = undefined;
};

/** Playback rate is per stem, so every stem has to be set */
export const applyPlaybackRate = (player, rate) => {
  if (!player) return;
  player.querySelectorAll('stemplayer-js-stem').forEach(stem => {
    stem.playbackRate = rate;
  });
};
