// Transposing the chords that sit above the lyrics.
//
// Chord lines are monospaced cues: each chord sits over the syllable it is
// played on. Transposing can change a chord's width (F# -> G, A -> Ab), so the
// spacing between chords is adjusted to keep every chord over its own syllable.

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NATURAL_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// A root note: a letter plus up to two sharps or flats
const ROOT = '[A-G](?:#{1,2}|b{1,2})?';
// Everything a chord quality may be built from — deliberately narrow, so that
// ordinary words are never mistaken for chords
const QUALITY = '(?:maj|Maj|MAJ|min|mi|m|M|aug|dim|sus|add|alt|no|°|º|ø|Δ|\\+|-|\\^|\\*|\\d|#|b|\\(|\\))*';
const CHORD_PART = new RegExp(`^(${ROOT})(${QUALITY})$`);
// Punctuation a chord may be wrapped in, e.g. "(C)" or "| Am |"
const WRAPPED = /^([([|{]*)(.*?)([)\]|}.,;:]*)$/;

const semitonesOf = (root) => {
  let value = NATURAL_SEMITONES[root[0]];
  for (const accidental of root.slice(1)) value += accidental === '#' ? 1 : -1;
  return ((value % 12) + 12) % 12;
};

const nameFor = (semitone, useFlats) => (useFlats ? FLAT_NAMES : SHARP_NAMES)[semitone];

const transposeRoot = (root, steps, useFlats) =>
  nameFor((semitonesOf(root) + steps % 12 + 12) % 12, useFlats);

// Transpose a single token, e.g. "F#m7/A#". Returns null when it is not a chord.
export function transposeChord(token, steps, useFlats) {
  const parts = token.split('/');
  if (parts.length > 2) return null;

  const transposed = [];
  for (const part of parts) {
    const match = part.match(CHORD_PART);
    if (!match) return null;
    transposed.push(transposeRoot(match[1], steps, useFlats) + match[2]);
  }
  return transposed.join('/');
}

export const isChord = (token) => {
  const [, , body] = token.match(WRAPPED) || [];
  return Boolean(body) && transposeChord(body, 0, false) !== null;
};

// Transpose one stretch of a chord line, keeping the chords over their
// syllables. `state` carries the columns owed across calls, so a line split
// over several text nodes still lines up.
export function transposeChordText(text, steps, useFlats, state = { debt: 0 }) {
  if (!steps) return text;

  const parts = text.match(/\s+|\S+/g);
  if (!parts) return text;

  return parts
    .map((part) => {
      if (/^\s/.test(part)) {
        // Spacing absorbs the width the chords gained or lost
        const width = Math.max(1, part.length - state.debt);
        state.debt -= part.length - width;
        if (width === part.length) return part;
        if (width < part.length) return part.slice(0, width);
        // Pad with the same kind of space the line already uses
        const filler = part.includes('\u00a0') ? '\u00a0' : ' ';
        return part + filler.repeat(width - part.length);
      }

      const [, open, body, close] = part.match(WRAPPED);
      const moved = body && transposeChord(body, steps, useFlats);
      if (!moved) return part;

      state.debt += moved.length - body.length;
      return open + moved + close;
    })
    .join('');
}

// Songs written with flats read better transposed into flats, and likewise for
// sharps, so follow whichever the source text uses.
export function prefersFlats(text) {
  let flats = 0;
  let sharps = 0;
  // The text may be the editor's HTML, so look at the words rather than the markup
  const words = String(text).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
  for (const token of words.split(/\s+/)) {
    if (!isChord(token)) continue;
    const [, , body] = token.match(WRAPPED);
    for (const part of body.split('/')) {
      const root = part.match(CHORD_PART)[1];
      if (root.includes('b')) flats++;
      if (root.includes('#')) sharps++;
    }
  }
  return flats > sharps;
}

// How a transposition reads in the controls, e.g. "+2" or "−3"
export const formatSteps = (steps) =>
  steps === 0 ? '0' : `${steps > 0 ? '+' : '−'}${Math.abs(steps)}`;
