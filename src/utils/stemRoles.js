//
// What a track actually is, rather than what its file was called.
//
// Stems arrive from three places and none of them agree on names: LALAL.AI
// writes "..._vocals@0_split_by_lalalai", StemDeck writes "— Backing", and a
// file dragged in from a phone is called whatever the phone called it. A
// singer only needs to know which part they are hearing, so the mixer shows
// the part and keeps the filename out of the way.
//

// The first pattern that matches wins, so the order here is the order the
// names overlap in: "backing vocals" contains "backing", and "no_vocals"
// contains "vocals". Where a track sits in the mixer is `rank`, not this order.
const ROLES = [
  { id: 'backingMix', name: 'Full Backing', rank: 0, color: '#0ea5e9', test: /mix[@_ -]?no[@_ -]?lead/ },
  { id: 'backingVocal', name: 'Backing Vocals', rank: 2, color: '#8b5cf6', test: /vocals?[@_ -]?1(?![0-9])|back(ing)?[@_ -]?vocals?|harmon/ },
  { id: 'accompaniment', name: 'Accompaniment', rank: 1, color: '#3b82f6', test: /no[@_ -]?vocals?|instrumental|accompaniment|karaoke|backing|original/ },
  { id: 'leadVocal', name: 'Lead Vocal', rank: 3, color: '#f59e0b', test: /vocals?[@_ -]?0(?![0-9])|lead[@_ -]?vocals?|vocals?|voice|acapella|a cappella/ }
];

const OTHER = { id: 'other', name: 'Track', rank: 4, color: '#6b7280' };

/** The part a stem plays, worked out from its label and its file name */
export const roleFor = (stem) => {
  let text = `${stem?.label || ''} ${stem?.src || ''}`;
  try {
    text = decodeURIComponent(text);
  } catch {
    // A malformed escape in the URL is no reason to give up on the label
  }
  const haystack = text.toLowerCase();
  return ROLES.find(role => role.test.test(haystack)) || OTHER;
};

/**
 * Stems paired with the position they hold in the engine, ordered the way a
 * mixer reads: the backing at the top, the part being learned at the bottom.
 * The index has to travel with the stem because the engine still addresses
 * its tracks in the order they were loaded.
 */
export const inMixOrder = (stems = []) => stems
  .map((stem, index) => ({ stem, index, role: roleFor(stem) }))
  .sort((a, b) => a.role.rank - b.role.rank || a.index - b.index);

/** A name for a track whose part we could not work out */
export const fallbackName = (stem, index) => {
  // Only a real audio extension, so a name like "YTDown.com_..." keeps its tail
  const label = (stem?.label || '').replace(/\.(mp3|wav|m4a|aac|flac|ogg|opus|webm)$/i, '').trim();
  return label || `Track ${index + 1}`;
};

/** What the mixer shows for a stem */
export const displayName = (stem, index) => {
  const role = roleFor(stem);
  return role.id === 'other' ? fallbackName(stem, index) : role.name;
};
