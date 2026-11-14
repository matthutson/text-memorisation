# Rudiment practice routines (MusicXML for Soundslice)

51 MusicXML files for piano, guitar, 5-string banjo (Scruggs and clawhammer sets) and fiddle.
Every file is one routine split into labelled sections: each section starts with a
rehearsal mark and ends with a double barline, so you can loop one section or play the
file straight through.

All files are produced by `generate.py` (Python 3, no dependencies). Re-run it to rebuild.

## Uploading to Soundslice

1. Create a slice, choose **Upload notation**, and pick a `.musicxml` file.
2. To loop a section, drag across its bars (from one rehearsal mark to the next double bar).
3. Use the speed control rather than editing tempos. The written tempos are deliberately slow.

Guitar and banjo files have two linked staves: standard notation on top and tablature
underneath, with the tuning included (gDGBD for banjo). Right-hand letters, chord names and
accents are attached to the notation staff. To build single-staff files instead, run
`python3 practice-routines/generate.py --no-tab-staff`.

## What is in each folder

### piano/
| File | Contents |
|---|---|
| 01 major scales | 12 keys, two octaves, hands together, standard fingering |
| 02 natural minor scales | same |
| 03 harmonic minor scales | same |
| 04, 05 major / minor pentatonic | 12 keys, two octaves (no fingering printed, see tips) |
| 06, 07 triads | per key: tonic triad block inversions, broken inversions, then a triad on every degree of the scale |
| 08, 09 seventh chords | same three sections with 4-note chords |
| 10 rhythm workout | C major in 14 straight, swung, dotted and compound rhythms |

Keys go round the circle of fifths. Minor-key chords use the natural minor (the folk sound:
i, ii°, III, iv, v, VI, VII).

### guitar/
| File | Contents |
|---|---|
| 01 to 05 scales | one file per scale type: the 5 CAGED positions in a home key (C or A minor), then all 12 keys played in one area of the neck by changing shape, then along the neck (linking all five positions up and back, and one string at a time) |
| 06 triad arpeggios | major and minor, same three-part layout |
| 07 seventh arpeggios | maj7, dominant 7, minor 7, same layout |
| 08 rhythm workout | C major in 14 rhythms |
| 09 major I–IV–V, 10 minor i–iv–V | triads on each set of three strings moving by closest inversion up the neck and back (as chords, then broken), then continuous arpeggio lines through the changes in each CAGED position and in 12 keys |
| 11 major ii–V–I, 12 minor ii–V–i | the same with triads, plus 4-note 7th chords on strings 4-3-2-1 and 5-4-3-2, and 7th arpeggio lines |

Each position runs root → top note → bottom note → root, so you learn the whole shape and
always start and finish on the tonic.

### banjo-scruggs/ and banjo-clawhammer/
Open G tuning (gDGBD). The letters under the notes are right-hand instructions.

| Scruggs | Clawhammer |
|---|---|
| 01 rolls over G, C, D7 | 01 basic strokes over G, C, D7 |
| 02 to 06 scales: single-string style in 3 positions, 12 keys, along the neck (02 also has the melodic-style G scale) | 02 to 06 scales: bum-ditty on every note, then melodic clawhammer in 3 positions, 12 keys, along the neck |
| 07 triad rolls up the neck, 12 keys | 07 triads with bum-ditty up the neck, 12 keys |
| 08 seventh-chord rolls, 12 keys | 08 seventh chords with bum-ditty, 12 keys |
| 09 rhythm workout | 09 rhythm workout |
| 10 to 13 major and minor I–IV–V and ii–V–I: vamping, then rolls, through the three chord shapes up the neck and back; single-string arpeggio lines in position and in 12 keys | 10 to 13 the same progressions with bum-ditty, drop-thumb arpeggios, and melodic clawhammer arpeggio lines |

Legend: **T** thumb, **I** index, **M** middle, **pinch** thumb and fingers together,
**B** brush, **H** hammer-on, **P** pull-off, **AH** alternate-string hammer-on (left hand
hammers a note on a new string), **AP** alternate-string pull-off (left hand plucks the
open string).

The three positions are built round the F shape, D shape and barre shape, which do the job
on banjo that CAGED does on guitar. In the chord files the 5th-string drone is only used
when G belongs to the chord; otherwise the roll stays on strings 1 to 4.

### How the progression files work
- **Closest inversions:** each pass plays the whole progression in one area of the neck, with every chord in the voicing nearest to the tonic chord. The next pass starts from the next inversion up, and the exercise climbs the neck and comes back.
- **Arpeggio lines:** one bar of quavers per chord. At each chord change the line carries on in the same direction to the nearest note of the new chord, instead of jumping back to the root.
- **Minor keys** use a major V chord (E in A minor, B in E minor), which is the usual minor I–IV–V and ii–V–i. The ii chord is diminished (m7♭5 as a 4-note chord).
- Chord names are printed above the stave; the banjo files also show the fret shape for each chord.

### fiddle/
| File | Contents |
|---|---|
| 01 bowing and emphasis | 18 patterns: reel, old-time shuffles, hornpipe, strathspey, polka, waltz, jig, slip jig, slide. Each one on open strings first, then on a D major scale |
| 02 folk scales | major, Mixolydian, Dorian, Aeolian and pentatonic scales in the usual session keys, covering the whole of first position, with fingerings |
| 03 slur patterns | 18 slurring patterns on a D major scale, from separate bows to Georgia shuffle, hooked bowing and jig slurs |

Bow directions are printed for the first two bars of each pattern; keep the pattern going after that.

## Getting it smooth and comfortable

**Tempo and looping**
- Find the tempo where it feels easy, not just possible. If your shoulders, jaw or thumb tighten, it is too fast.
- Loop one section three times cleanly before raising the speed by about 5%. One clean slow pass is worth more than several rough fast ones.
- Stop while it still sounds good. Ten focused minutes on two or three sections beats a tired play-through of a whole file.
- Rotate keys through the week (for example three keys a day) so the awkward ones get equal time.

**Evenness**
- Listen for the weak spots: the thumb passing under on piano, string changes on guitar and banjo, the bow change on fiddle. Isolate just those two or three notes and loop them.
- Play each section quietly as well as at normal volume. Quiet playing exposes uneven fingers very quickly.
- Keep fingers close to the keys or strings. Excess movement is what makes fast playing feel hard.

**Straight and swing rhythms**
- Use the rhythm workout file first, then carry each rhythm over to the scale and arpeggio files by ear. The notes stay the same; only the rhythm changes.
- A useful order: crotchets, straight quavers, swing quavers, dotted (hornpipe), Scotch snap, triplets, then jig time.
- Practising a passage long-short and then short-long is the quickest way to even it out. Each version makes you move quickly between a different pair of notes.
- For swing, think of a triplet with the middle note missing ("doo – ba"), keep it relaxed, and lean slightly on the off-beat note rather than the beat. The accent sections drill exactly that.
- Change where the accent falls (on the beat, off the beat, on 2 and 4) without changing the tempo. Being able to move the accent at will is what makes a rhythm feel settled.
- Tap your foot or count aloud on the main beats, especially in 6/8 where the beat is the dotted crotchet (two beats a bar, not six).

**Piano**
- Fingerings are printed for the seven-note scales. For pentatonics, group the fingers 1-2-3 and 1-2 and put the thumb on a white key wherever you can.
- Learn hands separately first; add the second hand only when each is automatic.
- For the thumb passing under, move the thumb early and keep the wrist level instead of twisting the elbow out.

**Guitar**
- Use strict alternate picking (down on the beat, up off it), also when crossing strings.
- Say the name of the shape and where the root sits before you play each position.
- In the 12-key section, keep the hand in one area of the neck and notice which shape gives you each key.

**Banjo**
- Scruggs: keep the ring or little finger anchored on the head, and make every note the same volume before adding accents. The thumb must never rush.
- Clawhammer: the hand moves as one unit from the wrist, and the thumb lands on the 5th string on every stroke even when it does not play it. Hammer-ons and pull-offs should be as loud as struck notes.
- The 12-key and seventh-chord sections are deliberately beyond what most tunes ask for in open G. Treat them as fretboard knowledge, and spend most of your time on the G, C, D, Em and Am material.

**Fiddle**
- Do each bowing on the open strings until the arm runs it by itself, then add the left hand.
- Make accents with bow speed and a little weight from the index finger, not by pressing hard.
- In slurs, keep the bow speed constant through the string crossing and let the elbow lead the change of string.
- For jigs, the beat falls on alternate down and up bows when you play single bows, so practise making an up-bow accent as strong as a down-bow one.
