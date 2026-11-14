#!/usr/bin/env python3
"""Generate rudiment practice routines as MusicXML (for Soundslice or any notation app).

    python3 practice-routines/generate.py                 # guitar/banjo: notation staff + linked TAB staff
    python3 practice-routines/generate.py --no-tab-staff  # single staff carrying string/fret data only

Every file is split into sections. Each section starts with a rehearsal mark and
ends with a double barline, so a section can be looped or the file played through.
Standard library only.
"""
import math
import os
import sys
from xml.sax.saxutils import escape

DIV = 12  # divisions per crotchet
TAB_STAFF = "--no-tab-staff" not in sys.argv
OUT = os.path.dirname(os.path.abspath(__file__))

LET = "CDEFGAB"
NAT = [0, 2, 4, 5, 7, 9, 11]
MAJ = [0, 2, 4, 5, 7, 9, 11]
NATMIN = [0, 2, 3, 5, 7, 8, 10]
HARM = [0, 2, 3, 5, 7, 8, 11]
MIXO = [0, 2, 4, 5, 7, 9, 10]
DOR = [0, 2, 3, 5, 7, 9, 10]

MAJ_KEYS = [("C", 0), ("G", 1), ("D", 2), ("A", 3), ("E", 4), ("B", 5), ("F#", 6),
            ("Db", -5), ("Ab", -4), ("Eb", -3), ("Bb", -2), ("F", -1)]
MIN_KEYS = [("A", 0), ("E", 1), ("B", 2), ("F#", 3), ("C#", 4), ("G#", 5), ("Eb", -6),
            ("Bb", -5), ("F", -4), ("C", -3), ("G", -2), ("D", -1)]

TYPES = {
    "major":   dict(pat=MAJ, deg=[0, 1, 2, 3, 4, 5, 6], minor=False, parent=0, name="major"),
    "natmin":  dict(pat=NATMIN, deg=[0, 1, 2, 3, 4, 5, 6], minor=True, parent=3, name="natural minor"),
    "harmin":  dict(pat=HARM, deg=[0, 1, 2, 3, 4, 5, 6], minor=True, parent=3, name="harmonic minor", raise7=True),
    "majpent": dict(pat=MAJ, deg=[0, 1, 2, 4, 5], minor=False, parent=0, name="major pentatonic"),
    "minpent": dict(pat=NATMIN, deg=[0, 2, 3, 4, 6], minor=True, parent=3, name="minor pentatonic"),
    "maj":     dict(pat=MAJ, deg=[0, 2, 4], minor=False, parent=0, name="major triad", suffix=""),
    "min":     dict(pat=NATMIN, deg=[0, 2, 4], minor=True, parent=3, name="minor triad", suffix="m"),
    "maj7":    dict(pat=MAJ, deg=[0, 2, 4, 6], minor=False, parent=0, name="major 7", suffix="maj7"),
    "dom7":    dict(pat=MIXO, deg=[0, 2, 4, 6], minor=False, parent=5, name="dominant 7", suffix="7", dom=True),
    "m7":      dict(pat=NATMIN, deg=[0, 2, 4, 6], minor=True, parent=3, name="minor 7", suffix="m7"),
}


# ---------------------------------------------------------------- pitch helpers
def tone(name):
    return (LET.index(name[0]), name.count("#") - name.count("b"))


def pretty(name):
    return name.replace("#", "♯").replace("b", "♭")


def pc(t):
    return (NAT[t[0]] + t[1]) % 12


def midi(p):
    return 12 * (p[2] + 1) + NAT[p[0]] + p[1]


def hepta(root, pattern):
    L, a = root
    rpc = pc(root)
    out = []
    for i, semi in enumerate(pattern):
        l = (L + i) % 7
        out.append((l, ((rpc + semi) % 12 - NAT[l] + 6) % 12 - 6))
    return out


def spell(m, pcmap):
    L, a = pcmap[m % 12]
    return (L, a, (m - NAT[L] - a) // 12 - 1)


def ascend(tones, octave, n):
    """n ascending pitches cycling through tones, tones[0] placed in `octave`."""
    out, o, prev = [], octave, None
    for i in range(n):
        L, a = tones[i % len(tones)]
        if prev is not None and L <= prev:
            o += 1
        out.append((L, a, o))
        prev = L
    return out


def keys_for(typ):
    return MIN_KEYS if TYPES[typ]["minor"] else MAJ_KEYS


def fifths_for(typ, key):
    f = dict(keys_for(typ))[key]
    return f - 1 if TYPES[typ].get("dom") else f


def tones_for(typ, key):
    h = hepta(tone(key), TYPES[typ]["pat"])
    return [h[d] for d in TYPES[typ]["deg"]]


def pcmap_for(typ, key):
    return {pc(t): t for t in tones_for(typ, key)}


# ---------------------------------------------------------------- events
def N(p, d=6, **kw):
    """Single-note event. p = (letter, alter, octave)."""
    note = dict(p=p)
    for k in ("s", "f", "fing"):
        if k in kw:
            note[k] = kw.pop(k)
    return dict(d=d, notes=[note], **kw)


def CH(notes, d, **kw):
    return dict(d=d, notes=notes, **kw)


def R(d):
    return dict(d=d, notes=[], rest=True)


def total(evs):
    return sum(e["d"] for e in evs)


def finish(evs, proto, barlen, beat):
    """Append a final long note (copy of proto) filling the bar, with rests if needed."""
    pos = total(evs) % barlen
    rem = barlen - pos
    nice = [72, 48, 36, 24, 12, 6] if beat == 12 else [72, 36, 18, 6]
    if pos % beat:
        d = 6
    else:
        d = next(x for x in nice if x <= rem and not (x == 36 and beat == 12 and rem != 36))
    e = dict(proto)
    e["d"] = d
    for k in ("tup", "acc"):
        e.pop(k, None)
    evs.append(e)
    rem -= d
    while rem:
        pos = total(evs) % barlen
        cands = [x for x in nice if x <= rem and (pos % beat == 0 or x == 6)]
        evs.append(R(cands[0]))
        rem -= cands[0]
    return evs


def quavers(notes, barlen=48, beat=12, d=6):
    """notes: list of note-event dicts (d ignored). Last one becomes the long final note."""
    evs = [dict(n, d=d) for n in notes[:-1]]
    return finish(evs, notes[-1], barlen, beat)


TYPE_OF = {72: ("whole", 1, 0), 48: ("whole", 0, 0), 36: ("half", 1, 0), 24: ("half", 0, 0),
           18: ("quarter", 1, 0), 12: ("quarter", 0, 0), 9: ("eighth", 1, 0), 6: ("eighth", 0, 0),
           3: ("16th", 0, 0), 8: ("quarter", 0, 1), 4: ("eighth", 0, 1)}


# ---------------------------------------------------------------- score writer
class Score:
    def __init__(self, title, kind, part_name, program, tuning=None, tempo=72):
        self.title, self.kind, self.part_name, self.program = title, kind, part_name, program
        self.tuning = tuning  # list of (line, step, alter, octave) bottom line first
        self.tempo = tempo
        self.sections = []

    def add(self, label, fifths, staves, time=(4, 4), tempo=None):
        """staves: list of event lists (one per staff)."""
        if not isinstance(staves[0], list):
            staves = [staves]
        self.sections.append(dict(label=label, fifths=fifths, staves=staves, time=time, tempo=tempo))

    # -- helpers
    @staticmethod
    def barify(evs, barlen, label):
        bars, cur, acc = [], [], 0
        for e in evs:
            cur.append(e)
            acc += e["d"]
            if acc > barlen:
                raise ValueError("event crosses barline in %r" % label)
            if acc == barlen:
                bars.append(cur)
                cur, acc = [], 0
        if cur:
            raise ValueError("incomplete final bar in %r (%d)" % (label, acc))
        return bars

    @staticmethod
    def beams(bar, beat):
        """Return per-event list of beam tag strings."""
        out = [""] * len(bar)
        pos, groups, cur, cur_beat = 0, [], [], None
        for i, e in enumerate(bar):
            ty = TYPE_OF[e["d"]][0]
            ok = not e.get("rest") and ty in ("eighth", "16th")
            b = pos // beat
            if ok and cur and b == cur_beat:
                cur.append(i)
            else:
                if len(cur) > 1:
                    groups.append(cur)
                cur, cur_beat = ([i], b) if ok else ([], None)
            pos += e["d"]
        if len(cur) > 1:
            groups.append(cur)
        for g in groups:
            for k, i in enumerate(g):
                s = "begin" if k == 0 else "end" if k == len(g) - 1 else "continue"
                tags = '<beam number="1">%s</beam>' % s
                if TYPE_OF[bar[i]["d"]][0] == "16th":
                    p16 = k > 0 and TYPE_OF[bar[g[k - 1]]["d"]][0] == "16th"
                    n16 = k < len(g) - 1 and TYPE_OF[bar[g[k + 1]]["d"]][0] == "16th"
                    s2 = ("continue" if p16 and n16 else "end" if p16 else "begin" if n16
                          else "forward hook" if k == 0 else "backward hook")
                    tags += '<beam number="2">%s</beam>' % s2
                out[i] = tags
        return out

    def note_xml(self, e, staff, voice, beam, accstate, keyalter, nstaves, tabstaff):
        ty, dots, tm = TYPE_OF[e["d"]]
        x = []
        if e.get("words") and not tabstaff:
            x.append('<direction placement="above"><direction-type><words font-style="italic">%s</words>'
                     '</direction-type>%s</direction>' % (escape(e["words"]), "<staff>%d</staff>" % staff if nstaves > 1 else ""))
        common = "<duration>%d</duration><voice>%d</voice><type>%s</type>%s" % (e["d"], voice, ty, "<dot/>" * dots)
        tmx = "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>" if tm else ""
        stf = "<staff>%d</staff>" % staff if nstaves > 1 else ""
        if e.get("rest"):
            x.append("<note><rest/>%s%s%s</note>" % (common, tmx, stf))
            return "".join(x)
        for i, n in enumerate(e["notes"]):
            L, a, o = n["p"]
            accx = ""
            if not tabstaff:
                cur = accstate.get((L, o), keyalter[L])
                if cur != a:
                    accx = "<accidental>%s</accidental>" % {-2: "flat-flat", -1: "flat", 0: "natural", 1: "sharp", 2: "double-sharp"}[a]
                    accstate[(L, o)] = a
            nota, tech, art = [], [], []
            if i == 0:
                for s in e.get("slur", []):
                    nota.append('<slur type="%s" number="1"/>' % s)
                if e.get("tup"):
                    nota.append('<tuplet type="%s" number="1"%s/>' % (e["tup"], ' bracket="yes"' if e["tup"] == "start" else ""))
                if e.get("bow"):
                    tech.append("<%s-bow/>" % e["bow"])
                if e.get("acc") and not tabstaff:
                    art.append("<accent/>")
                if e.get("stac") and not tabstaff:
                    art.append("<staccato/>")
            if "fing" in n and not tabstaff:
                tech.append("<fingering>%s</fingering>" % n["fing"])
            if "s" in n:
                tech.append("<string>%d</string><fret>%d</fret>" % (n["s"], n["f"]))
            if i == 0 and e.get("hp"):
                for kind, t in e["hp"]:
                    el = "hammer-on" if kind == "H" else "pull-off"
                    tech.append('<%s type="%s" number="1">%s</%s>' % (el, t, kind if t == "start" else "", el))
                    nota.append('<slur type="%s" number="2"/>' % t)
            if tech:
                nota.append("<technical>%s</technical>" % "".join(tech))
            if art:
                nota.append("<articulations>%s</articulations>" % "".join(art))
            lyr = ""
            if i == 0 and e.get("lyr") and not tabstaff:
                lyr = '<lyric number="1"><syllabic>single</syllabic><text>%s</text></lyric>' % escape(e["lyr"])
            x.append("<note>%s<pitch><step>%s</step>%s<octave>%d</octave></pitch>%s%s%s%s%s%s%s</note>" % (
                "<chord/>" if i else "", LET[L], "<alter>%d</alter>" % a if a else "", o, common, accx, tmx, stf,
                beam if i == 0 else "", "<notations>%s</notations>" % "".join(nota) if nota else "", lyr))
        return "".join(x)

    def xml(self):
        tab = self.kind in ("guitar", "banjo")
        dup = tab and TAB_STAFF
        nstaves = 2 if (self.kind == "piano" or dup) else 1
        h = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
             '<score-partwise version="3.1">',
             "<work><work-title>%s</work-title></work>" % escape(self.title),
             "<identification><encoding><software>practice-routines/generate.py</software></encoding></identification>",
             '<part-list><score-part id="P1"><part-name>%s</part-name>'
             '<score-instrument id="P1-I1"><instrument-name>%s</instrument-name></score-instrument>'
             '<midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>%d</midi-program></midi-instrument>'
             "</score-part></part-list>" % (self.part_name, self.part_name, self.program),
             '<part id="P1">']
        num, prev = 0, {}
        for si, sec in enumerate(self.sections):
            beats, unit = sec["time"]
            barlen = beats * DIV * 4 // unit
            beat = 18 if unit == 8 else 12
            staves = sec["staves"] * 2 if dup else sec["staves"]
            bars = [self.barify(s, barlen, sec["label"]) for s in staves]
            assert len({len(b) for b in bars}) == 1, sec["label"]
            f = sec["fifths"]
            keyalter = [0] * 7
            for k in range(abs(f)):
                keyalter[[3, 0, 4, 1, 5, 2, 6][k] if f > 0 else [6, 2, 5, 1, 4, 0, 3][k]] = 1 if f > 0 else -1
            for bi in range(len(bars[0])):
                num += 1
                m = ['<measure number="%d">' % num]
                if bi == 0:
                    if si:
                        m.append('<print new-system="yes"/>')
                    at = []
                    if si == 0:
                        at.append("<divisions>%d</divisions>" % DIV)
                    if prev.get("fifths") != f:
                        at.append("<key><fifths>%d</fifths></key>" % f)
                    if prev.get("time") != sec["time"]:
                        at.append("<time><beats>%d</beats><beat-type>%d</beat-type></time>" % sec["time"])
                    if si == 0:
                        if nstaves > 1:
                            at.append("<staves>2</staves>")
                        if self.kind == "piano":
                            at.append('<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>')
                        elif tab:
                            at.append('<clef%s><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>' % (' number="1"' if dup else ""))
                            if dup:
                                at.append('<clef number="2"><sign>TAB</sign><line>5</line></clef>')
                            tun = "".join('<staff-tuning line="%d"><tuning-step>%s</tuning-step>%s<tuning-octave>%d</tuning-octave></staff-tuning>'
                                          % (ln, st, "<tuning-alter>%d</tuning-alter>" % al if al else "", oc) for ln, st, al, oc in self.tuning)
                            at.append('<staff-details%s>%s%s</staff-details>' % (
                                ' number="2"' if dup else "", "<staff-lines>%d</staff-lines>" % len(self.tuning) if dup else "", tun))
                        else:
                            at.append("<clef><sign>G</sign><line>2</line></clef>")
                    if at:
                        m.append("<attributes>%s</attributes>" % "".join(at))
                    tempo = sec["tempo"] or (self.tempo if beat == 12 else 60)
                    if prev.get("tempo") != (tempo, beat):
                        m.append('<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>%s'
                                 '<per-minute>%d</per-minute></metronome></direction-type><sound tempo="%d"/></direction>'
                                 % ("<beat-unit-dot/>" if beat == 18 else "", tempo, tempo * (1.5 if beat == 18 else 1)))
                    m.append('<direction placement="above"><direction-type><rehearsal>%s</rehearsal></direction-type></direction>' % escape(sec["label"]))
                    prev = dict(fifths=f, time=sec["time"], tempo=(tempo, beat))
                for st in range(nstaves):
                    if st:
                        m.append("<backup><duration>%d</duration></backup>" % barlen)
                    bar = bars[st][bi]
                    bm = self.beams(bar, beat)
                    accstate = {}
                    for e, b in zip(bar, bm):
                        m.append(self.note_xml(e, st + 1, st + 1, b, accstate, keyalter, nstaves, dup and st == 1))
                if bi == len(bars[0]) - 1:
                    last = si == len(self.sections) - 1
                    m.append('<barline location="right"><bar-style>%s</bar-style></barline>' % ("light-heavy" if last else "light-light"))
                m.append("</measure>")
                h.append("".join(m))
        h.append("</part></score-partwise>")
        return "\n".join(h) + "\n"

    def write(self, folder, fname):
        d = os.path.join(OUT, folder)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, fname + ".musicxml"), "w", encoding="utf-8") as fh:
            fh.write(self.xml())
        bars = sum(total(s["staves"][0]) // (s["time"][0] * DIV * 4 // s["time"][1]) for s in self.sections)
        print("%-52s %3d sections %4d bars" % (folder + "/" + fname, len(self.sections), bars))


# ---------------------------------------------------------------- rhythm workout (shared)
RHYTHMS = [
    ("Crotchets – slow and even", (4, 4), [(12, 0)]),
    ("Straight quavers", (4, 4), [(6, 0), (6, 0)]),
    ("Straight quavers – accent the beat", (4, 4), [(6, 1), (6, 0)]),
    ("Straight quavers – accent the off-beat", (4, 4), [(6, 0), (6, 1)]),
    ("Swing quavers (long–short triplet feel)", (4, 4), [(8, 0), (4, 0)]),
    ("Swing quavers – accent the off-beat", (4, 4), [(8, 0), (4, 1)]),
    ("Dotted / hornpipe (long–short)", (4, 4), [(9, 0), (3, 0)]),
    ("Scotch snap (short–long)", (4, 4), [(3, 0), (9, 0)]),
    ("Triplets", (4, 4), [(4, 1), (4, 0), (4, 0)]),
    ("Gallop (long–short–short)", (4, 4), [(6, 0), (3, 0), (3, 0)]),
    ("Reverse gallop (short–short–long)", (4, 4), [(3, 0), (3, 0), (6, 0)]),
    ("Semiquavers", (4, 4), [(3, 1), (3, 0), (3, 0), (3, 0)]),
    ("Jig 6/8", (6, 8), [(6, 1), (6, 0), (6, 0)]),
    ("Slide / lilt 6/8 (crotchet–quaver)", (6, 8), [(12, 1), (6, 0)]),
]


def apply_cells(loops, cell, time, annotate=None):
    """loops: list of staves, each a list of note-events forming a loop that returns to its start.
    Returns staves of events: the loop(s) played in the rhythm cell, plus a final long first note."""
    period, c = len(loops[0]), len(cell)
    n = period * c // math.gcd(period, c)
    while n // c < 8:
        n *= 2
    barlen = time[0] * DIV * 4 // time[1]
    beat = 18 if time[1] == 8 else 12
    out = []
    for loop in loops:
        evs = []
        for i in range(n):
            d, acc = cell[i % c]
            e = dict(loop[i % period], d=d)
            if acc:
                e["acc"] = True
            if d in (8, 4):
                if i % c == 0:
                    e["tup"] = "start"
                elif i % c == c - 1:
                    e["tup"] = "stop"
            evs.append(e)
        finish(evs, loop[0], barlen, beat)
        if annotate:
            annotate(evs, [k for k in range(len(evs)) if k % c == 0 or k == n])
        out.append(evs)
    return out


def add_rhythm_sections(score, fifths, loops, annotate=None, only=None):
    for name, time, cell in RHYTHMS:
        if only and not only(cell):
            continue
        score.add(name, fifths, apply_cells(loops, cell, time, annotate), time=time)


# ---------------------------------------------------------------- piano
C_TYPE = ([1, 2, 3, 1, 2, 3, 4], 5)
RH_MAJ = {"F": ([1, 2, 3, 4, 1, 2, 3], 4), "Bb": ([4, 1, 2, 3, 1, 2, 3], None), "Eb": ([3, 1, 2, 3, 4, 1, 2], None),
          "Ab": ([3, 4, 1, 2, 3, 1, 2], None), "Db": ([2, 3, 1, 2, 3, 4, 1], None), "F#": ([2, 3, 4, 1, 2, 3, 1], None)}
LH_C = ([1, 4, 3, 2, 1, 3, 2], 5)
LH_FLAT = ([3, 2, 1, 4, 3, 2, 1], None)
LH_MAJ = {"B": ([1, 3, 2, 1, 4, 3, 2], 4), "F#": ([4, 3, 2, 1, 3, 2, 1], None),
          "Db": LH_FLAT, "Ab": LH_FLAT, "Eb": LH_FLAT, "Bb": LH_FLAT}
RH_MIN = {"F": ([1, 2, 3, 4, 1, 2, 3], 4), "F#": ([3, 4, 1, 2, 3, 1, 2], None), "C#": ([3, 4, 1, 2, 3, 1, 2], None),
          "G#": ([3, 4, 1, 2, 3, 1, 2], None), "Eb": ([3, 1, 2, 3, 4, 1, 2], None), "Bb": ([4, 1, 2, 3, 1, 2, 3], None)}
LH_MIN = {"B": ([1, 3, 2, 1, 4, 3, 2], 4), "F#": ([4, 3, 2, 1, 3, 2, 1], None), "C#": LH_FLAT, "G#": LH_FLAT,
          "Eb": ([2, 1, 4, 3, 2, 1, 3], None), "Bb": ([2, 1, 3, 2, 1, 4, 3], None)}


def rh_octave(t):
    return 4 if t[0] <= 3 else 3


def piano_scale_file(typ, idx):
    T = TYPES[typ]
    sc = Score("Piano – %s scales, 12 keys" % T["name"], "piano", "Piano", 1)
    hept = len(T["deg"]) == 7
    for key, f in keys_for(typ):
        tones = tones_for(typ, key)
        n = 2 * len(tones) + 1
        staves = []
        for hand in (0, 1):
            up = ascend(tones, rh_octave(tone(key)) if hand == 0 else 2, n)
            seq = up + up[-2::-1]
            fing = None
            if hept:
                tab = ((RH_MIN if T["minor"] else RH_MAJ) if hand == 0 else (LH_MIN if T["minor"] else LH_MAJ))
                cyc, edge = tab.get(key, C_TYPE if hand == 0 else LH_C)
                fu = [cyc[i % 7] for i in range(n)]
                if edge:
                    fu[-1 if hand == 0 else 0] = edge
                fing = fu + fu[-2::-1]
            notes = [N(p, fing=fing[i]) if fing else N(p) for i, p in enumerate(seq)]
            staves.append(quavers(notes))
        sc.add("%s %s" % (pretty(key), T["name"]), f, staves)
    sc.write("piano", "piano-%02d-%s-scales" % (idx, T["name"].replace(" ", "-")))


def piano_chord_file(size, minor, idx):
    nm = "triads" if size == 3 else "seventh chords"
    sc = Score("Piano – %s in 12 %s keys" % (nm, "minor" if minor else "major"), "piano", "Piano", 1, tempo=66)
    for key, f in (MIN_KEYS if minor else MAJ_KEYS):
        h = hepta(tone(key), NATMIN if minor else MAJ)
        kname = "%s %s" % (pretty(key), "minor" if minor else "major")
        ro = rh_octave(tone(key))
        ladders = [ascend(h, ro, 22), ascend(h, ro - 1, 22)]
        base = [0, 2, 4, 6][:size]
        invs = [base]
        for _ in range(size):
            invs.append(invs[-1][1:] + [invs[-1][0] + 7])
        order = invs + invs[-2:0:-1]
        # block inversions
        staves = []
        for lad in ladders:
            evs = [CH([dict(p=lad[i]) for i in v], 12) for v in order]
            staves.append(finish(evs, CH([dict(p=lad[i]) for i in base], 12), 48, 12))
        sc.add("%s – tonic %s, block inversions" % (kname, "triad" if size == 3 else "7th"), f, staves)
        # broken inversions
        staves = []
        for lad in ladders:
            evs = []
            for v in order:
                pat = [v[0], v[1], v[2], v[1]] if size == 3 else v
                evs += [N(lad[i]) for i in pat]
            staves.append(finish(evs, CH([dict(p=lad[i]) for i in base], 12), 48, 12))
        sc.add("%s – tonic %s, broken inversions" % (kname, "triad" if size == 3 else "7th"), f, staves)
        # diatonic chords up and down the scale
        degs = list(range(8)) + list(range(6, 0, -1))
        staves = []
        for lad in ladders:
            evs = [CH([dict(p=lad[d + i]) for i in base], 12) for d in degs]
            staves.append(finish(evs, CH([dict(p=lad[i]) for i in base], 12), 48, 12))
        sc.add("%s – %s on every degree of the scale" % (kname, nm), f, staves)
    sc.write("piano", "piano-%02d-%s-%s-keys" % (idx, nm.replace(" ", "-"), "minor" if minor else "major"))


def piano_rhythm_file(idx):
    sc = Score("Piano – rhythm workout (C major)", "piano", "Piano", 1)
    h = hepta(tone("C"), MAJ)
    loops = []
    for octave, fing in ((4, [1, 2, 3, 1, 2, 3, 4, 5]), (3, [5, 4, 3, 2, 1, 3, 2, 1])):
        up = ascend(h, octave, 8)
        seq, fg = up + up[-2:0:-1], fing + fing[-2:0:-1]
        loops.append([N(p, fing=x) for p, x in zip(seq, fg)])
    add_rhythm_sections(sc, 0, loops)
    sc.write("piano", "piano-%02d-rhythm-workout" % idx)


# ---------------------------------------------------------------- fretted instruments
GUITAR = dict(
    kind="guitar", name="Guitar", program=26, base_pc=0, centre=6.0,
    open={6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64},
    tuning=[(1, "E", 0, 2), (2, "A", 0, 2), (3, "D", 0, 3), (4, "G", 0, 3), (5, "B", 0, 3), (6, "E", 0, 4)],
    shapes=[
        ("C", {6: [0, 1, 3], 5: [0, 2, 3], 4: [0, 2, 3], 3: [0, 2], 2: [0, 1, 3], 1: [0, 1, 3]}),
        ("A", {6: [3, 5], 5: [2, 3, 5], 4: [2, 3, 5], 3: [2, 4, 5], 2: [3, 5, 6], 1: [3, 5]}),
        ("G", {6: [5, 7, 8], 5: [5, 7, 8], 4: [5, 7], 3: [4, 5, 7], 2: [5, 6, 8], 1: [5, 7, 8]}),
        ("E", {6: [7, 8, 10], 5: [7, 8, 10], 4: [7, 9, 10], 3: [7, 9, 10], 2: [8, 10], 1: [7, 8, 10]}),
        ("D", {6: [10, 12, 13], 5: [10, 12], 4: [9, 10, 12], 3: [9, 10, 12], 2: [10, 12, 13], 1: [10, 12, 13]}),
    ],
    minor_names={"C": "Am", "A": "Gm", "G": "Em", "E": "Dm", "D": "Cm"},
    dom_names={"C": "G", "A": "E", "G": "D", "E": "C", "D": "A"},
    home={False: "C", True: "A"},
)
BANJO = dict(
    kind="banjo", name="5-string Banjo", program=106, base_pc=7, centre=4.5,
    open={4: 50, 3: 55, 2: 59, 1: 62},
    tuning=[(1, "G", 0, 4), (2, "D", 0, 3), (3, "G", 0, 3), (4, "B", 0, 3), (5, "D", 0, 4)],
    shapes=[
        ("barre", {4: [0, 2, 4], 3: [0, 2], 2: [0, 1], 1: [0, 2, 4, 5]}),
        ("F", {4: [2, 4, 5], 3: [2, 4, 5], 2: [3, 5], 1: [4, 5, 7]}),
        ("D", {4: [7, 9, 10], 3: [7, 9], 2: [7, 8, 10], 1: [9, 10, 12]}),
    ],
    home={False: "G", True: "E"},
)
G5 = dict(p=(4, 0, 4), s=5, f=0)  # banjo 5th string


def position(inst, shape_idx, typ, key):
    """Notes of scale/arpeggio `typ` in `key` inside one position.
    Returns (label, [(midi, string, fret)] ascending)."""
    T = TYPES[typ]
    K = pc(tone(key))
    name, pattern = inst["shapes"][shape_idx]
    s = (K + T["parent"] - inst["base_pc"]) % 12
    lo = min(min(v) for v in pattern.values())
    if lo + s - 12 >= 0:
        s -= 12
    offs = sorted((T["pat"][d]) for d in T["deg"])
    if T.get("raise7"):
        offs = NATMIN
    pcs = {(K + o) % 12 for o in offs}
    notes = []
    for string, frets in pattern.items():
        for f in frets:
            m, fr = inst["open"][string] + f + s, f + s
            if m % 12 not in pcs:
                continue
            if T.get("raise7") and m % 12 == (K + 10) % 12:
                m, fr = m + 1, fr + 1
            notes.append((m, string, fr))
    notes.sort()
    assert all(a[0] < b[0] for a, b in zip(notes, notes[1:])), (typ, key, name)
    frs = [n[2] for n in notes]
    if inst["kind"] == "guitar":
        nm = inst["minor_names"][name] if T["minor"] else inst["dom_names"][name] if T.get("dom") else name
        label = "%s shape" % nm
    else:
        label = "%s shape" % name if not T["minor"] and not T.get("dom") else None
    where = "open position" if min(frs) == 0 else "frets %d–%d" % (min(frs), max(frs))
    return ("%s, %s" % (label, where) if label else where), notes


def fret_events(notes, pcmap):
    return [N(spell(m, pcmap), s=s, f=f) for m, s, f in notes]


def position_run(notes, K):
    """root -> top -> bottom -> root."""
    r = next(i for i, n in enumerate(notes) if n[0] % 12 == K)
    return notes[r:] + notes[-2::-1] + notes[1:r + 1]


def ordered_positions(inst, typ, key):
    ps = [position(inst, i, typ, key) for i in range(len(inst["shapes"]))]
    return sorted(ps, key=lambda p: min(n[2] for n in p[1]))


def link_runs(inst, typ, key):
    """Connect every position up the neck, then back down. Returns (up, down) note lists."""
    K = pc(tone(key))
    ps = [p[1] for p in ordered_positions(inst, typ, key)]
    up = []
    for i, p in enumerate(ps):
        run = p if i % 2 == 0 else p[::-1]
        up += run[1:] if up and up[-1] == run[0] else run
    down = []
    for j, p in enumerate(ps[::-1]):
        asc_last = (len(ps) - 1) % 2 == 0
        run = (p[::-1] if asc_last else p) if j % 2 == 0 else (p if asc_last else p[::-1])
        down += run[1:] if down and down[-1] == run[0] else run
    # finish on the nearest root
    last = ps[0] if down[-1] in ps[0] else ps[-1]
    i = last.index(down[-1])
    roots = [k for k, n in enumerate(last) if n[0] % 12 == K]
    r = min(roots, key=lambda k: abs(k - i))
    down += last[i + 1:r + 1] if r > i else last[r:i][::-1]
    top = up[-1]
    if top[0] % 12 != K:  # the up section ends on its top note
        pass
    return up, down


def single_string(inst, typ, key, string):
    T = TYPES[typ]
    K = pc(tone(key))
    pcs = {(K + T["pat"][d]) % 12 for d in T["deg"]}
    o = inst["open"][string]
    f0 = next(f for f in range(12) if (o + f) % 12 in pcs)
    up = [(o + f, string, f) for f in range(f0, f0 + 13) if (o + f) % 12 in pcs]
    return up + up[-2::-1]


def best_shape(inst, typ, key):
    def score(i):
        frs = [n[2] for n in position(inst, i, typ, key)[1]]
        return abs((min(frs) + max(frs)) / 2 - inst["centre"])
    return min(range(len(inst["shapes"])), key=score)


# -- right-hand annotation layers
def ann_none(evs, beats=None):
    return evs


def ann_scruggs(evs, beats=None):
    """Single-string style: thumb on the beat, index off it."""
    pos = 0
    for i, e in enumerate(evs):
        if not e.get("rest"):
            on = (i in beats) if beats is not None else pos % 12 == 0
            e["lyr"] = "T" if on else "I"
        pos += e["d"]
    return evs


def ann_claw(evs, beats=None):
    """Melodic clawhammer: strike on the beat; off-beat notes by hammer-on, pull-off,
    drop-thumb (T) or alternate-string hammer-on / pull-off (AH / AP)."""
    pos, prev = 0, None
    for i, e in enumerate(evs):
        if e.get("rest"):
            prev = None
            pos += e["d"]
            continue
        n = e["notes"][0]
        on = (i in beats) if beats is not None else pos % 12 == 0
        if on or prev is None:
            e["lyr"] = "I"
        else:
            pn = prev["notes"][0]
            if n["s"] == pn["s"] and n["f"] != pn["f"]:
                kind = "H" if n["f"] > pn["f"] else "P"
                e["lyr"] = kind
                prev.setdefault("hp", []).append((kind, "start"))
                e.setdefault("hp", []).append((kind, "stop"))
            elif n["s"] > pn["s"]:
                e["lyr"] = "T"
            elif n["s"] < pn["s"]:
                e["lyr"] = "AP" if n["f"] == 0 else "AH"
            else:
                e["lyr"] = "I"
        prev = e
        pos += e["d"]
    return evs


def fretted_score(inst, title, tempo=72):
    return Score(title, inst["kind"], inst["name"], inst["program"], inst["tuning"], tempo)


def add_position_sections(sc, inst, typ, ann, heading):
    """Home-key positions, 12 keys in one area of the neck, and along-the-neck work."""
    T = TYPES[typ]
    home = inst["home"][T["minor"]]
    arp = "suffix" in T

    def title(key):
        return "%s%s" % (pretty(key), T["suffix"]) if arp else "%s %s" % (pretty(key), T["name"])

    pm, K, f = pcmap_for(typ, home), pc(tone(home)), fifths_for(typ, home)
    for label, notes in ordered_positions(inst, typ, home):
        sc.add("%s – %s" % (title(home), label), f, ann(quavers(fret_events(position_run(notes, K), pm))))
    for key, _ in keys_for(typ):
        label, notes = position(inst, best_shape(inst, typ, key), typ, key)
        sc.add("12 keys: %s – %s" % (title(key), label), fifths_for(typ, key),
               ann(quavers(fret_events(position_run(notes, pc(tone(key))), pcmap_for(typ, key)))))
    up, down = link_runs(inst, typ, home)
    sc.add("%s – along the neck: linking positions, going up" % title(home), f, ann(quavers(fret_events(up, pm))))
    sc.add("%s – along the neck: linking positions, coming back" % title(home), f, ann(quavers(fret_events(down, pm))))
    if not arp:
        evs = []
        for string in sorted(inst["open"], reverse=True):
            part = quavers(fret_events(single_string(inst, typ, home, string), pm))
            part[0]["words"] = "string %d" % string
            evs += ann(part)
        sc.add("%s – along the neck: one string at a time" % title(home), f, evs)


# ---------------------------------------------------------------- guitar files
def guitar_files():
    i = 0
    for typ in ("major", "natmin", "harmin", "majpent", "minpent"):
        i += 1
        T = TYPES[typ]
        sc = fretted_score(GUITAR, "Guitar – %s scale: CAGED positions, 12 keys, along the neck" % T["name"])
        add_position_sections(sc, GUITAR, typ, ann_none, None)
        sc.write("guitar", "guitar-%02d-%s-scale" % (i, T["name"].replace(" ", "-")))
    for fname, title, typs in (("triad-arpeggios", "triad arpeggios", ("maj", "min")),
                               ("seventh-arpeggios", "4-note (seventh) arpeggios", ("maj7", "dom7", "m7"))):
        i += 1
        sc = fretted_score(GUITAR, "Guitar – %s: CAGED positions, 12 keys, along the neck" % title)
        for typ in typs:
            add_position_sections(sc, GUITAR, typ, ann_none, None)
        sc.write("guitar", "guitar-%02d-%s" % (i, fname))
    i += 1
    sc = fretted_score(GUITAR, "Guitar – rhythm workout (C major)")
    add_rhythm_sections(sc, 0, [home_octave_loop(GUITAR, 1, "C")])
    sc.write("guitar", "guitar-%02d-rhythm-workout" % i)


def home_octave_loop(inst, shape_idx, key):
    _, notes = position(inst, shape_idx, "major", key)
    K = pc(tone(key))
    r = next(k for k, n in enumerate(notes) if n[0] % 12 == K)
    up = notes[r:r + 8]
    return fret_events(up + up[-2:0:-1], pcmap_for("major", key))


# ---------------------------------------------------------------- banjo chord voicings
def voicings(pcs):
    out = []
    for t in range(12):
        if (62 + t) % 12 not in pcs:
            continue
        best = None
        for top in (t, t + 12):  # fall back an octave up when the low shape is impossible
            rng = range(max(0, top - 4), top + 5)
            for f4 in rng:
                for f3 in rng:
                    for f2 in rng:
                        fr = (f4, f3, f2, top)
                        if {(50 + f4) % 12, (55 + f3) % 12, (59 + f2) % 12, (62 + top) % 12} != set(pcs):
                            continue
                        span = max(fr) - min(fr)
                        if span > 4:
                            continue
                        cost = (span, sum(fr))
                        if best is None or cost < best[0]:
                            best = (cost, {4: f4, 3: f3, 2: f2, 1: top})
            if best:
                break
        if best:
            out.append(best[1])
    return sorted(out, key=lambda v: v[1])


def vnote(v, string, pm):
    if string == 5:
        return dict(G5)
    return dict(p=spell(BANJO["open"][string] + v[string], pm), s=string, f=v[string])


def vlabel(v):
    return "frets " + "-".join(str(v[s]) for s in (4, 3, 2, 1))


def banjo_chord_file(style, typs, fname, title, idx):
    sc = fretted_score(BANJO, "Banjo (%s) – %s up the neck, 12 keys" % (style, title), tempo=66)
    for typ in typs:
        T = TYPES[typ]
        for key, _ in keys_for(typ):
            pm = pcmap_for(typ, key)
            vs = voicings(set(pm))
            drone = 7 in pm
            evs = []
            for v in vs + vs[-2::-1]:
                if style == "Scruggs":
                    strings, fingers = ([3, 2, 5, 1, 4, 2, 5, 1] if drone else [3, 2, 4, 1, 3, 2, 4, 1]), "TITMTITM"
                    bar = [dict(d=6, notes=[vnote(v, s, pm)], lyr=fg) for s, fg in zip(strings, fingers)]
                else:
                    th = 5 if drone else 2
                    bar = []
                    for bum in (3, 4):
                        bar += [dict(d=12, notes=[vnote(v, bum, pm)], lyr="I"),
                                dict(d=6, notes=[vnote(v, 2, pm), vnote(v, 1, pm)], lyr="B"),
                                dict(d=6, notes=[vnote(v, th, pm)], lyr="T")]
                bar[0]["words"] = vlabel(v)
                evs += bar
            last = [3, 2, 1] if style == "Scruggs" else [4, 3, 2, 1]
            evs.append(dict(d=48, notes=[vnote(vs[0], s, pm) for s in last], lyr="pinch" if style == "Scruggs" else "B"))
            sc.add("%s%s – %s" % (pretty(key), T["suffix"], T["name"]), fifths_for(typ, key), evs)
    sc.write("banjo-" + style.lower(), "banjo-%s-%02d-%s" % (style.lower(), idx, fname))


OPEN_CHORDS = [("G", {4: 0, 3: 0, 2: 0, 1: 0}), ("C", {4: 2, 3: 0, 2: 1, 1: 2}), ("D7", {4: 0, 3: 2, 2: 1, 1: 0}), ("G", {4: 0, 3: 0, 2: 0, 1: 0})]
GPM = {pc(t): t for t in hepta(tone("G"), MAJ)}


def banjo_scale_files(style, ann, first_idx):
    i = first_idx
    for typ in ("major", "natmin", "harmin", "majpent", "minpent"):
        T = TYPES[typ]
        sc = fretted_score(BANJO, "Banjo (%s) – %s scale: positions, 12 keys, along the neck" % (style, T["name"]))
        home = BANJO["home"][T["minor"]]
        pm, f = pcmap_for(typ, home), fifths_for(typ, home)
        _, notes = position(BANJO, 0, typ, home)
        r = next(k for k, n in enumerate(notes) if n[0] % 12 == pc(tone(home)))
        octave = notes[r:r + len(T["deg"]) + 1]
        run = octave + octave[-2::-1]
        if style == "Scruggs" and typ == "major":
            mel = [(3, 0, "I"), (4, 7, "T"), (2, 0, "I"), (3, 5, "T"), (1, 0, "M"), (2, 5, "I"), (1, 4, "M"), (5, 0, "T")]
            seq = mel + mel[-2::-1]
            evs = []
            for s, fr, fg in seq:
                n = dict(G5) if s == 5 else dict(p=spell(BANJO["open"][s] + fr, pm), s=s, f=fr)
                evs.append(dict(d=6, notes=[n], lyr=fg))
            sc.add("G major – melodic style (a new string for every note)", f, quavers(evs))
        if style == "Clawhammer":
            evs = []
            for m, s, fr in run[:-1]:
                mel = dict(p=spell(m, pm), s=s, f=fr)
                brush = [mel if s == st else dict(p=spell(BANJO["open"][st], GPM), s=st, f=0) for st in (2, 1)]
                evs += [dict(d=12, notes=[mel], lyr="I"), dict(d=6, notes=brush, lyr="B"), dict(d=6, notes=[dict(G5)], lyr="T")]
            m, s, fr = run[-1]
            evs.append(dict(d=48, notes=[dict(p=spell(m, pm), s=s, f=fr)], lyr="I"))
            sc.add("%s %s – bum-ditty on every note" % (pretty(home), T["name"]), f, evs)
        add_position_sections(sc, BANJO, typ, ann, None)
        sc.write("banjo-" + style.lower(), "banjo-%s-%02d-%s-scale" % (style.lower(), i, T["name"].replace(" ", "-")))
        i += 1
    return i


def chord_bar(v, strings, fingers, durs=None):
    return [dict(d=(durs[k] if durs else 6), notes=[vnote(v, s, GPM)], lyr=fg) for k, (s, fg) in enumerate(zip(strings, fingers))]


def scruggs_files():
    sc = fretted_score(BANJO, "Banjo (Scruggs) – basic rolls over G, C, D7", tempo=66)
    evs = []
    for name, v in OPEN_CHORDS:
        bar = []
        for th in (3, 4):
            bar += [dict(d=12, notes=[vnote(v, th, GPM)], lyr="T"), dict(d=12, notes=[dict(G5), vnote(v, 1, GPM)], lyr="pinch")]
        bar[0]["words"] = name
        evs += bar
    evs.append(dict(d=48, notes=[vnote(OPEN_CHORDS[0][1], s, GPM) for s in (3, 2, 1)], lyr="pinch"))
    sc.add("Thumb and pinch", 1, evs)
    rolls = [("Alternating thumb roll", [3, 2, 5, 1, 4, 2, 5, 1], "TITMTITM"),
             ("Forward roll", [2, 1, 5, 2, 1, 5, 2, 1], "IMTIMTIM"),
             ("Backward roll", [1, 2, 5, 1, 2, 5, 1, 2], "MITMITMI"),
             ("Forward–reverse roll", [3, 2, 1, 5, 1, 2, 3, 1], "TIMTMITM"),
             ("Foggy Mountain roll", [2, 1, 2, 1, 5, 2, 1, 5], "IMTMTIMT")]
    for name, strings, fingers in rolls:
        evs = []
        for cname, v in OPEN_CHORDS:
            bar = chord_bar(v, strings, fingers)
            bar[0]["words"] = cname
            evs += bar
        evs.append(dict(d=48, notes=[vnote(OPEN_CHORDS[0][1], s, GPM) for s in (3, 2, 1)], lyr="pinch"))
        sc.add(name, 1, evs)
    sc.write("banjo-scruggs", "banjo-scruggs-01-rolls")
    i = banjo_scale_files("Scruggs", ann_scruggs, 2)
    banjo_chord_file("Scruggs", ("maj", "min"), "triad-rolls", "triad rolls", i)
    banjo_chord_file("Scruggs", ("maj7", "dom7", "m7"), "seventh-chord-rolls", "4-note (seventh) chord rolls", i + 1)
    # rhythm workout
    sc = fretted_score(BANJO, "Banjo (Scruggs) – rhythm workout")
    g = OPEN_CHORDS[0][1]
    fr = chord_bar(g, [3, 2, 1, 5, 1, 2, 3, 1], "TIMTMITM")
    for name, cell in (("Forward–reverse roll – straight", [(6, 0), (6, 0)]),
                       ("Forward–reverse roll – swing", [(8, 0), (4, 0)]),
                       ("Forward–reverse roll – dotted bounce", [(9, 0), (3, 0)]),
                       ("Forward–reverse roll – accent the thumb", None)):
        loop = fr
        if cell is None:
            loop = [dict(e, acc=True) if e["lyr"] == "T" else e for e in fr]
            cell = [(6, 0), (6, 0)]
        sc.add(name, 1, apply_cells([loop], cell, (4, 4))[0])
    sc.add("Forward roll in triplets (T–I–M)", 1,
           apply_cells([chord_bar(g, [3, 2, 1], "TIM")], [(4, 1), (4, 0), (4, 0)], (4, 4))[0])
    sc.add("Forward roll in 6/8 (T–I–M)", 1,
           apply_cells([chord_bar(g, [3, 2, 1], "TIM") + chord_bar(g, [4, 2, 1], "TIM")], [(6, 1), (6, 0), (6, 0)], (6, 8))[0], time=(6, 8))
    add_rhythm_sections(sc, 1, [home_octave_loop(BANJO, 0, "G")], ann_scruggs, only=lambda c: len(c) <= 2)
    sc.write("banjo-scruggs", "banjo-scruggs-%02d-rhythm-workout" % (i + 2))


def clawhammer_files():
    sc = fretted_score(BANJO, "Banjo (clawhammer) – basic strokes over G, C, D7", tempo=66)

    def brush(v):
        return [vnote(v, 3, GPM), vnote(v, 2, GPM), vnote(v, 1, GPM)]

    def section(name, cellfn, durs_note=None):
        evs = []
        for cname, v in OPEN_CHORDS:
            bar = cellfn(v, 3) + cellfn(v, 4)
            bar[0]["words"] = cname
            evs += bar
        evs.append(dict(d=48, notes=[vnote(OPEN_CHORDS[0][1], s, GPM) for s in (4, 3, 2, 1)], lyr="B"))
        sc.add(name, 1, evs)

    section("Bum-ditty (strike, brush, thumb)", lambda v, s: [
        dict(d=12, notes=[vnote(v, s, GPM)], lyr="I"), dict(d=6, notes=brush(v), lyr="B"), dict(d=6, notes=[dict(G5)], lyr="T")])
    section("Double thumb (bump-a-ditty)", lambda v, s: [
        dict(d=6, notes=[vnote(v, s, GPM)], lyr="I"), dict(d=6, notes=[dict(G5)], lyr="T"),
        dict(d=6, notes=brush(v), lyr="B"), dict(d=6, notes=[dict(G5)], lyr="T")])
    section("Drop thumb (thumb drops to the 2nd string)", lambda v, s: [
        dict(d=6, notes=[vnote(v, 1, GPM)], lyr="I"), dict(d=6, notes=[vnote(v, 2, GPM)], lyr="T"),
        dict(d=6, notes=[vnote(v, 1 if s == 3 else 3, GPM)], lyr="I"), dict(d=6, notes=[dict(G5)], lyr="T")])

    def lh(name, kind, pairs):
        evs = []
        for s, a, b in pairs * 2:
            x = dict(d=6, notes=[dict(p=spell(BANJO["open"][s] + a, GPM), s=s, f=a)], lyr="I", hp=[(kind, "start")])
            y = dict(d=6, notes=[dict(p=spell(BANJO["open"][s] + b, GPM), s=s, f=b)], lyr=kind, hp=[(kind, "stop")])
            evs += [x, y, dict(d=6, notes=brush(OPEN_CHORDS[0][1]), lyr="B"), dict(d=6, notes=[dict(G5)], lyr="T")]
        evs.append(dict(d=48, notes=[vnote(OPEN_CHORDS[0][1], s, GPM) for s in (4, 3, 2, 1)], lyr="B"))
        sc.add(name, 1, evs)

    lh("Hammer-ons inside the bum-ditty", "H", [(4, 0, 2), (3, 0, 2), (2, 0, 1), (1, 0, 2)])
    lh("Pull-offs inside the bum-ditty", "P", [(1, 2, 0), (2, 1, 0), (3, 2, 0), (4, 2, 0)])
    sc.write("banjo-clawhammer", "banjo-clawhammer-01-basic-strokes")
    i = banjo_scale_files("Clawhammer", ann_claw, 2)
    banjo_chord_file("Clawhammer", ("maj", "min"), "triads-bum-ditty", "triads with bum-ditty", i)
    banjo_chord_file("Clawhammer", ("maj7", "dom7", "m7"), "seventh-chords-bum-ditty", "4-note (seventh) chords with bum-ditty", i + 1)
    # rhythm workout
    sc = fretted_score(BANJO, "Banjo (clawhammer) – rhythm workout")
    g = OPEN_CHORDS[0][1]

    def bd(s):
        return [dict(notes=[vnote(g, s, GPM)], lyr="I"), dict(notes=brush(g), lyr="B"), dict(notes=[dict(G5)], lyr="T")]

    def dt(s):
        return [dict(notes=[vnote(g, s, GPM)], lyr="I"), dict(notes=[dict(G5)], lyr="T"), dict(notes=brush(g), lyr="B"), dict(notes=[dict(G5)], lyr="T")]

    def fixed(loop, durs, tup=()):
        evs = []
        for rep in range(4):
            for k, e in enumerate(loop):
                x = dict(e, d=durs[k % len(durs)])
                if k % len(durs) in tup:
                    x["tup"] = "start" if x["d"] == 8 else "stop"
                evs.append(x)
        evs.append(dict(d=48, notes=[vnote(g, s, GPM) for s in (4, 3, 2, 1)], lyr="B"))
        return evs

    sc.add("Bum-ditty – straight", 1, fixed(bd(3) + bd(4), [12, 6, 6]))
    sc.add("Bum-ditty – swung ditty", 1, fixed(bd(3) + bd(4), [12, 8, 4], tup=(1, 2)))
    sc.add("Bum-ditty – dotted bounce", 1, fixed(bd(3) + bd(4), [12, 9, 3]))
    sc.add("Double thumb – straight", 1, fixed(dt(3) + dt(4), [6, 6, 6, 6]))
    sc.add("Double thumb – swing", 1, fixed(dt(3) + dt(4), [8, 4, 8, 4], tup=(0, 1, 2, 3)))
    sc.add("Double thumb – dotted bounce", 1, fixed(dt(3) + dt(4), [9, 3, 9, 3]))
    add_rhythm_sections(sc, 1, [home_octave_loop(BANJO, 0, "G")], ann_claw, only=lambda c: len(c) <= 2 and c[0][0] != 3)
    sc.write("banjo-clawhammer", "banjo-clawhammer-%02d-rhythm-workout" % (i + 2))


# ---------------------------------------------------------------- fiddle
def P(name):
    """'F#4' -> pitch tuple"""
    t = tone(name[:-1])
    return (t[0], t[1], int(name[-1]))


def zigzag(tones, lo, hi, tonic_oct):
    """Loop of scale pitches between midi lo..hi starting on the tonic at tonic_oct, up then down."""
    lad = [p for p in ascend(tones, tonic_oct - 2, len(tones) * 5) if lo <= midi(p) <= hi]
    start = next(i for i, p in enumerate(lad) if p[:2] == tones[0] and p[2] == tonic_oct)
    loop = lad[start:] + lad[-2::-1] + lad[1:start]
    return loop


def bowed(evs, lead, cycle, start="down", mark=10 ** 9, stac=False):
    """Group events into bow strokes (slurring groups >1), alternating direction."""
    groups, i, k = [], 0, 0
    sizes = list(lead)
    while i < len(evs):
        if not sizes:
            sizes = list(cycle)
        g = sizes.pop(0)
        groups.append(list(range(i, min(i + g, len(evs)))))
        i += g
    bow = start
    for g in groups:
        g = [x for x in g if not evs[x].get("rest")]
        if not g:
            continue
        if g[0] < mark:
            evs[g[0]]["bow"] = bow
        if len(g) > 1:
            evs[g[0]]["slur"] = ["start"]
            evs[g[-1]]["slur"] = ["stop"]
            if stac:
                for x in g:
                    evs[x]["stac"] = True
        bow = "up" if bow == "down" else "down"
    return evs


def fiddle_part(pitches, bar_durs, nbars, accents, lead, cycle, start, tups=(), stac=False):
    evs, k = [], 0
    for b in range(nbars):
        for j, d in enumerate(bar_durs):
            e = N(pitches[k % len(pitches)], d)
            if j in accents:
                e["acc"] = True
            if d in (8, 4):
                e["tup"] = None
            evs.append(e)
            k += 1
    # tuplets: mark groups summing to a crotchet
    acc, first = 0, None
    for e in evs:
        if "tup" in e:
            if acc == 0:
                first = e
            acc += e["d"]
            e.pop("tup")
            if acc % 12 == 0:
                first["tup"], e["tup"] = "start", "stop"
                acc = 0
    return bowed(evs, lead, cycle, start, mark=2 * len(bar_durs), stac=stac)


FIDDLE_FINAL = {(4, 4): [48], (6, 8): [36], (9, 8): [36, -18], (12, 8): [72], (2, 4): [24], (3, 4): [36]}


def fiddle_final(time, bow):
    out = []
    for d in FIDDLE_FINAL[time]:
        out.append(R(-d) if d < 0 else N(P("D4"), d, bow=bow))
    return out


def fiddle_files():
    dmaj = hepta(tone("D"), MAJ)
    scale = zigzag(dmaj, midi(P("D4")), midi(P("D5")), 4)
    sc = Score("Fiddle – bowing and emphasis across folk rhythms", "fiddle", "Fiddle", 41, tempo=80)
    q8 = [6] * 8
    specs = [
        # label, time, bar durations, accents (note index in bar), lead, cycle, start bow, tempo
        ("Reel – single bows, lean on beats 1 and 3", (4, 4), q8, {0, 4}, [], [1], "down", 80),
        ("Reel – single bows, back-beat (2 and 4)", (4, 4), q8, {2, 6}, [], [1], "down", 80),
        ("Reel – slur three, bow one", (4, 4), q8, {0, 4}, [], [3, 1], "down", 80),
        ("Reel – slur across the beat", (4, 4), q8, {0, 4}, [1], [2], "down", 80),
        ("Old-time – Nashville shuffle (long, short, short)", (4, 4), [12, 6, 6, 12, 6, 6], {1, 4}, [], [1], "down", 80),
        ("Old-time – Georgia shuffle (accented down-bow on the back-beat)", (4, 4), q8, {2, 6}, [2], [1, 3], "up", 80),
        ("Hornpipe – dotted, single bows", (4, 4), [9, 3] * 4, {0, 4}, [], [1], "down", 66),
        ("Hornpipe – dotted, short note slurred into the beat", (4, 4), [9, 3] * 4, {0, 4}, [1], [2], "down", 66),
        ("Hornpipe – triplet swing", (4, 4), [8, 4] * 4, {0, 4}, [], [1], "down", 66),
        ("Strathspey – dotted and Scotch snap", (4, 4), [9, 3, 3, 9, 9, 3, 3, 9], {0, 2, 4, 6}, [], [1], "down", 60),
        ("Polka – push the off-beat", (2, 4), [6, 6, 6, 6], {1, 3}, [], [1], "down", 80),
        ("Waltz – long first beat, light second and third", (3, 4), [12, 6, 6, 6, 6], {0}, [], [1, 2, 2], "down", 80),
        ("Jig – single bows, lean on 1 and 4", (6, 8), [6] * 6, {0, 3}, [], [1], "down", 60),
        ("Jig – slur two, bow one", (6, 8), [6] * 6, {0, 3}, [], [2, 1], "down", 60),
        ("Jig – slur across the beat (3 into 4)", (6, 8), [6] * 6, {0, 3}, [], [1, 1, 2, 1, 1], "down", 60),
        ("Slip jig 9/8 – single bows", (9, 8), [6] * 9, {0, 3, 6}, [], [1], "down", 60),
        ("Slip jig 9/8 – slur two, bow one", (9, 8), [6] * 9, {0, 3, 6}, [], [2, 1], "down", 60),
        ("Slide 12/8 – crotchet–quaver lilt", (12, 8), [12, 6] * 4, {0, 4}, [], [1], "down", 60),
    ]
    for label, time, durs, acc, lead, cycle, start, tempo in specs:
        opens = [P("D4")] * len(durs) + [P("A4")] * len(durs)
        a = fiddle_part(opens, durs, 2, acc, lead, cycle, start)
        a[0]["words"] = "open strings"
        b = fiddle_part(scale, durs, 4, acc, lead, cycle, start)
        b[0]["words"] = "D major"
        sc.add(label, 2, a + b + fiddle_final(time, "down"), time=time, tempo=tempo)
    sc.write("fiddle", "fiddle-01-bowing-and-emphasis")

    # folk scales, first position with fingerings
    sc = Score("Fiddle – folk scales and modes (first position)", "fiddle", "Fiddle", 41, tempo=72)
    scales = [("D major", "D", MAJ, range(7), 2), ("G major", "G", MAJ, range(7), 1), ("A major", "A", MAJ, range(7), 3),
              ("C major", "C", MAJ, range(7), 0), ("D Mixolydian", "D", MIXO, range(7), 1), ("A Mixolydian", "A", MIXO, range(7), 2),
              ("G Mixolydian", "G", MIXO, range(7), 0), ("E Dorian", "E", DOR, range(7), 2), ("A Dorian", "A", DOR, range(7), 1),
              ("D Dorian", "D", DOR, range(7), 0), ("B minor (Aeolian)", "B", NATMIN, range(7), 2),
              ("E minor (Aeolian)", "E", NATMIN, range(7), 1), ("A minor (Aeolian)", "A", NATMIN, range(7), 0),
              ("G major pentatonic", "G", MAJ, [0, 1, 2, 4, 5], 1), ("D major pentatonic", "D", MAJ, [0, 1, 2, 4, 5], 2),
              ("A major pentatonic", "A", MAJ, [0, 1, 2, 4, 5], 3), ("E minor pentatonic", "E", NATMIN, [0, 2, 3, 4, 6], 1),
              ("A minor pentatonic", "A", NATMIN, [0, 2, 3, 4, 6], 0), ("B minor pentatonic", "B", NATMIN, [0, 2, 3, 4, 6], 2)]
    for label, key, pat, deg, f in scales:
        h = hepta(tone(key), pat)
        tones = [h[d] for d in deg]
        lad = [p for p in ascend(tones, 2, len(tones) * 5) if 55 <= midi(p) <= 83]
        r = next(i for i, p in enumerate(lad) if p[:2] == tones[0])
        seq = lad[r:] + lad[-2::-1] + lad[1:r + 1]
        evs = []
        for p in seq:
            m = midi(p)
            openL = 4 if m < 62 else 1 if m < 69 else 5 if m < 76 else 2
            evs.append(N(p, fing=(p[0] - openL) % 7))
        sc.add(label, f, quavers(evs))
    sc.write("fiddle", "fiddle-02-folk-scales")

    # slurs
    sc = Score("Fiddle – slur patterns", "fiddle", "Fiddle", 41, tempo=72)
    wide = zigzag(dmaj, midi(P("D4")), midi(P("A5")), 4)
    cross = []
    for nm in ("D4", "E4", "F#4", "G4", "F#4", "E4"):
        cross += [P(nm), P("A4")]
    trip = [8, 4] * 4
    slurs = [
        ("Separate bows (the baseline)", (4, 4), q8, wide, [], [1], "down", False),
        ("Slur two, on the beat", (4, 4), q8, wide, [], [2], "down", False),
        ("Slur two, across the beat", (4, 4), q8, wide, [1], [2], "down", False),
        ("Slur three, bow one", (4, 4), q8, wide, [], [3, 1], "down", False),
        ("Bow one, slur three", (4, 4), q8, wide, [], [1, 3], "down", False),
        ("Slur four", (4, 4), q8, wide, [], [4], "down", False),
        ("Slur 3 + 3 + 2", (4, 4), q8, wide, [], [3, 3, 2], "down", False),
        ("Slur the whole bar", (4, 4), q8, wide, [], [8], "down", False),
        ("Nashville shuffle (slur two, bow two)", (4, 4), q8, wide, [], [2, 1, 1], "down", False),
        ("Georgia shuffle (slur three up, one down)", (4, 4), q8, wide, [2], [1, 3], "up", False),
        ("String crossings, separate (D string against open A)", (4, 4), q8, cross, [], [1], "down", False),
        ("String crossings, slurred in pairs", (4, 4), q8, cross, [], [2], "down", False),
        ("Hooked bowing (dotted pair in one bow, stopped between)", (4, 4), [9, 3] * 4, wide, [], [2], "down", True),
        ("Slurred triplets", (4, 4), [4] * 12, wide, [], [3], "down", False),
        ("Swing – slur off-beat into the beat", (4, 4), trip, wide, [1], [2], "down", False),
        ("Jig – slur two, bow one", (6, 8), [6] * 6, wide, [], [2, 1], "down", False),
        ("Jig – bow one, slur two", (6, 8), [6] * 6, wide, [], [1, 2], "down", False),
        ("Jig – slur three", (6, 8), [6] * 6, wide, [], [3], "down", False),
    ]
    for label, time, durs, pitches, lead, cycle, start, stac in slurs:
        evs = fiddle_part(pitches, durs, 4, set(), lead, cycle, start, stac=stac)
        sc.add(label, 2, evs + fiddle_final(time, "down"), time=time, tempo=60 if time[1] == 8 else 72)
    sc.write("fiddle", "fiddle-03-slur-patterns")


# ---------------------------------------------------------------- chord progressions (I-IV-V, ii-V-I)
from itertools import product

PROGS = {"145": [0, 3, 4, 0], "251": [1, 4, 0, 0]}
ROMAN = {("145", False): "I–IV–V", ("145", True): "i–iv–V",
         ("251", False): "ii–V–I", ("251", True): "ii–V–i"}
QUAL = {(4, 7): "", (3, 7): "m", (3, 6): "°", (4, 7, 11): "maj7", (4, 7, 10): "7",
        (3, 7, 10): "m7", (3, 6, 10): "m7♭5"}


def prog_slots(key, minor, prog, size):
    """Chords of the progression: list of dict(name, pcs, root) plus the pitch-class spelling map.
    Minor keys use the natural minor with a major V (raised 7th)."""
    h = hepta(tone(key), NATMIN if minor else MAJ)
    pm = {pc(t): t for t in h}
    lead = (h[6][0], h[6][1] + 1)
    if minor:
        pm[pc(lead)] = lead
    out = []
    for deg in PROGS[prog]:
        tones = [h[(deg + 2 * i) % 7] for i in range(size)]
        if minor and deg == 4:
            tones[1] = lead
        r = pc(tones[0])
        name = LET[tones[0][0]] + {1: "♯", -1: "♭", 0: ""}[tones[0][1]] + QUAL[tuple((pc(t) - r) % 12 for t in tones[1:])]
        out.append(dict(name=name, pcs=frozenset(pc(t) for t in tones), root=r))
    return out, pm


_vcache = {}


def string_voicings(inst, strings, pcs, maxfret):
    """Closest-fingered voicing for each chord tone on the top string, low to high."""
    k = (inst["kind"], strings, pcs, maxfret)
    if k in _vcache:
        return _vcache[k]
    opens, res = inst["open"], []
    for top in range(maxfret + 1):
        if (opens[strings[-1]] + top) % 12 not in pcs:
            continue
        best = None
        for combo in product(range(max(0, top - 4), top + 5), repeat=len(strings) - 1):
            fr = combo + (top,)
            if {(opens[s] + f) % 12 for s, f in zip(strings, fr)} != set(pcs):
                continue
            span = max(fr) - min(fr)
            if span <= 4 and (best is None or (span, sum(fr)) < best[0]):
                best = ((span, sum(fr)), dict(zip(strings, fr)))
        if best:
            res.append(best[1])
    _vcache[k] = res
    return res


def prog_rows(inst, strings, slots):
    """For each tonic voicing up the neck: the whole progression in the closest voicings."""
    tonic = slots[-1]["pcs"]
    rows = []
    for tv in string_voicings(inst, strings, tonic, 15)[:4]:
        row = []
        for sl in slots:
            if sl["pcs"] == tonic:
                row.append(tv)
            else:
                row.append(min(string_voicings(inst, strings, sl["pcs"], 19),
                               key=lambda v: sum(abs(v[x] - tv[x]) for x in strings)))
        rows.append(row)
    return rows + rows[-2::-1]


def vnotes(inst, v, pm, strings=None):
    return [dict(p=spell(inst["open"][s] + v[s], pm), s=s, f=v[s]) for s in (strings or sorted(v, reverse=True))]


def prog_pool(inst, shape_idx, key, minor):
    if not minor:
        return position(inst, shape_idx, "major", key)
    label, a = position(inst, shape_idx, "natmin", key)
    return label, sorted(set(a) | set(position(inst, shape_idx, "harmin", key)[1]))


def arp_line(pool, slots, tonic_pc):
    """One bar of quavers per chord, moving to the nearest chord tone in the direction of travel."""
    cur, d, bars = None, 1, []
    for sl in slots:
        tones = [n for n in pool if n[0] % 12 in sl["pcs"]]
        if cur is None:
            cur = next(n for n in tones if n[0] % 12 == sl["root"])
        else:
            ups, downs = [n for n in tones if n[0] > cur[0]], [n for n in tones if n[0] < cur[0]]
            if (d == 1 and not ups) or (d == -1 and not downs):
                d = -d
            cur = ups[0] if d == 1 else downs[-1]
        bar = [cur]
        for _ in range(7):
            i = tones.index(cur)
            if not 0 <= i + d < len(tones):
                d = -d
            cur = tones[i + d]
            bar.append(cur)
        bars.append(bar)
    roots = [n for n in pool if n[0] % 12 == tonic_pc and n != cur]
    return bars, min(roots or [cur], key=lambda n: abs(n[0] - cur[0]))


def add_arp_line_sections(sc, inst, minor, prog, size, ann, home):
    keys = MIN_KEYS if minor else MAJ_KEYS
    rom = ROMAN[(prog, minor)]
    kind = "triad" if size == 3 else "7th"

    def build(key, shape_idx):
        slots, pm = prog_slots(key, minor, prog, size)
        label, pool = prog_pool(inst, shape_idx, key, minor)
        bars, last = arp_line(pool, slots, pc(tone(key)))
        evs = []
        for sl, bar in zip(slots, bars):
            part = fret_events(bar, pm)
            part[0]["words"] = sl["name"]
            evs += part
        evs += [dict(fret_events([last], pm)[0], d=48)]
        return label, ann(evs)

    order = sorted(range(len(inst["shapes"])), key=lambda i: min(n[2] for n in prog_pool(inst, i, home, minor)[1]))
    for i in order:
        label, evs = build(home, i)
        sc.add("%s %s arpeggios in position – %s" % (rom, kind, label), dict(keys)[home], evs)
    for key, f in keys:
        label, evs = build(key, best_shape(inst, "natmin" if minor else "major", key))
        sc.add("12 keys: %s%s %s – %s" % (pretty(key), "m" if minor else "", rom, label), f, evs)


def prog_title(inst, minor, prog, home):
    return "%s %s %s" % (pretty(home), "minor" if minor else "major", ROMAN[(prog, minor)])


def guitar_prog_file(prog, minor, idx):
    home = GUITAR["home"][minor]
    f = dict(MIN_KEYS if minor else MAJ_KEYS)[home]
    head = prog_title(GUITAR, minor, prog, home)
    sc = fretted_score(GUITAR, "Guitar – %s: triads and arpeggios up and down the neck" % head, tempo=66)
    slots, pm = prog_slots(home, minor, prog, 3)
    sets = [(3, 2, 1), (4, 3, 2), (5, 4, 3), (6, 5, 4)]
    for strings in sets:
        evs = []
        for row in prog_rows(GUITAR, strings, slots):
            k = 0
            while k < len(row):
                d = 24
                if k + 1 < len(row) and slots[k + 1]["pcs"] == slots[k]["pcs"]:
                    d = 48
                evs.append(CH(vnotes(GUITAR, row[k], pm), d, words=slots[k]["name"]))
                k += 2 if d == 48 else 1
        sc.add("%s – triads on strings %d-%d-%d, closest inversions, up the neck and back" % ((head,) + strings), f, evs)
    for strings in sets:
        evs = []
        rows = prog_rows(GUITAR, strings, slots)
        for row in rows:
            for sl, v in zip(slots, row):
                lo, mid, hi = vnotes(GUITAR, v, pm)
                part = [dict(d=6, notes=[n]) for n in (lo, mid, hi, mid)]
                part[0]["words"] = sl["name"]
                evs += part
        evs.append(CH(vnotes(GUITAR, rows[-1][-1], pm), 48))
        sc.add("%s – broken triads on strings %d-%d-%d, up the neck and back" % ((head,) + strings), f, evs)
    size = 3
    if prog == "251":
        size = 4
        slots7, pm7 = prog_slots(home, minor, prog, 4)
        for strings in [(4, 3, 2, 1), (5, 4, 3, 2)]:
            evs = []
            for row in prog_rows(GUITAR, strings, slots7):
                evs += [CH(vnotes(GUITAR, row[0], pm7), 24, words=slots7[0]["name"]),
                        CH(vnotes(GUITAR, row[1], pm7), 24, words=slots7[1]["name"]),
                        CH(vnotes(GUITAR, row[2], pm7), 48, words=slots7[2]["name"])]
            sc.add("%s – 7th chords on strings %d-%d-%d-%d, closest inversions, up the neck and back" % ((head,) + strings), f, evs)
    add_arp_line_sections(sc, GUITAR, minor, prog, size, ann_none, home)
    sc.write("guitar", "guitar-%02d-%s-%s" % (idx, "minor" if minor else "major", "1-4-5" if prog == "145" else "2-5-1"))


def banjo_prog_file(style, prog, minor, idx):
    home = BANJO["home"][minor]
    f = dict(MIN_KEYS if minor else MAJ_KEYS)[home]
    head = prog_title(BANJO, minor, prog, home)
    sc = fretted_score(BANJO, "Banjo (%s) – %s: chords and arpeggios up and down the neck" % (style, head), tempo=66)
    S4 = (4, 3, 2, 1)

    def one(v, s, pm):
        return [vnote(v, s, pm)]

    def vamp(v, pm, drone):
        return [dict(d=12, notes=one(v, 4, pm), lyr="T"), dict(d=12, notes=one(v, 2, pm) + one(v, 1, pm), lyr="IM", stac=True),
                dict(d=12, notes=one(v, 3, pm), lyr="T"), dict(d=12, notes=one(v, 2, pm) + one(v, 1, pm), lyr="IM", stac=True)]

    def roll(v, pm, drone):
        strings = [3, 2, 5, 1, 4, 2, 5, 1] if drone else [3, 2, 4, 1, 3, 2, 4, 1]
        return [dict(d=6, notes=one(v, s, pm), lyr=fg) for s, fg in zip(strings, "TITMTITM")]

    def bumditty(v, pm, drone):
        out = []
        for bum in (3, 4):
            out += [dict(d=12, notes=one(v, bum, pm), lyr="I"), dict(d=6, notes=one(v, 2, pm) + one(v, 1, pm), lyr="B"),
                    dict(d=6, notes=one(v, 5 if drone else 2, pm), lyr="T")]
        return out

    def dropthumb(v, pm, drone):
        out = []
        for a, b in ((1, 2), (2, 3), (3, 4), (2, 3)):
            out += [dict(d=6, notes=one(v, a, pm), lyr="I"), dict(d=6, notes=one(v, b, pm), lyr="T")]
        return out

    if style == "Scruggs":
        plan = [(3, vamp, "vamping triads (thumb, pinch)"), (3, roll, "triad rolls")]
        if prog == "251":
            plan.append((4, roll, "7th-chord rolls"))
    else:
        plan = [(3, bumditty, "triads with bum-ditty"), (3, dropthumb, "triads as drop-thumb arpeggios")]
        if prog == "251":
            plan.append((4, bumditty, "7th chords with bum-ditty"))
    for size, fn, what in plan:
        slots, pm = prog_slots(home, minor, prog, size)
        rows = prog_rows(BANJO, S4, slots)
        evs = []
        for row in rows:
            for sl, v in zip(slots, row):
                bar = fn(v, pm, 7 in sl["pcs"])
                bar[0]["words"] = "%s  %s" % (sl["name"], "-".join(str(v[s]) for s in S4))
                evs += bar
        last = rows[-1][-1]
        evs.append(dict(d=48, notes=[vnote(last, s, pm) for s in ((3, 2, 1) if style == "Scruggs" else S4)],
                        lyr="pinch" if style == "Scruggs" else "B"))
        sc.add("%s – %s, up the neck and back" % (head, what), f, evs)
    add_arp_line_sections(sc, BANJO, minor, prog, 4 if prog == "251" else 3,
                          ann_scruggs if style == "Scruggs" else ann_claw, home)
    sc.write("banjo-" + style.lower(), "banjo-%s-%02d-%s-%s" % (style.lower(), idx, "minor" if minor else "major",
                                                                "1-4-5" if prog == "145" else "2-5-1"))


def progression_files():
    combos = [("145", False), ("145", True), ("251", False), ("251", True)]
    for k, (prog, minor) in enumerate(combos):
        guitar_prog_file(prog, minor, 9 + k)
    for style in ("Scruggs", "Clawhammer"):
        for k, (prog, minor) in enumerate(combos):
            banjo_prog_file(style, prog, minor, 10 + k)



# ---------------------------------------------------------------- main
def main():
    for i, typ in enumerate(("major", "natmin", "harmin", "majpent", "minpent"), 1):
        piano_scale_file(typ, i)
    piano_chord_file(3, False, 6)
    piano_chord_file(3, True, 7)
    piano_chord_file(4, False, 8)
    piano_chord_file(4, True, 9)
    piano_rhythm_file(10)
    guitar_files()
    scruggs_files()
    clawhammer_files()
    fiddle_files()
    progression_files()


if __name__ == "__main__":
    main()
