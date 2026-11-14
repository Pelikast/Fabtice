# The iReal Pro link format, as this export writes it

iReal Pro's own site is not reachable from here, so the format was established
from open-source readers and writers, cross-checked against each other and
against real exports. Nothing below is copied code: the encoder
(`ireal.ts`, `irealChords.ts`) and the test reader (`../test/irealDecoder.ts`)
are written from this description.

## Sources

| Source | Licence | What it gave |
|---|---|---|
| `pianosnake/ireal-reader` (JavaScript, npm `ireal-reader`) | MIT | field order of the link, the 50-character scrambling, the bar/chord reader |
| `daumling/ireal-renderer` (JavaScript) | MIT | the cell model (one object per token, rows of 16 cells), the chord grammar (`chordRegex`), bar-line and annotation tokens, the substitutions `Kcl`, `LZ`, `XyQ` |
| `sciurius/perl-Data-iRealPro` (Perl) | Artistic / GPL (as Perl) | the **writer** side: `obfuscate` / `hussle`, the order of the three substitutions, the ten-field song, the percent-encoding, the old `irealbook://` layout, the time-signature table, a known input/output example |
| `splendidtoad/pyrealpro` (Python, PyPI `pyrealpro`) | MIT | another writer: old link layout, key list, style list, valid time signatures, one cell per beat, slashes `p`, `n` |
| `drs251/pyRealParser` (Python, PyPI `pyRealParser`) | MIT | a third reader, run on our links (see below) |
| `infojunkie/ireal-musicxml` (JavaScript, npm `@music-i18n/ireal-musicxml`) | GPL-3.0 | the documented list of every chord quality, the playback rules for empty cells (from iReal's forum), a MusicXML conversion of the cells, and **test data made of real iReal Pro exports** (about 2 200 songs: jazz, pop, country, blues, dixieland, plus iReal's own HTML pages). Only read and run here, never copied or shipped |
| `memowe/pyrealpro-format` (Python) | MIT | a typed model of the format, its list of tokens |

The real exports were the ground truth: every quality text of the table below
(except the two spelled differently on iReal's help page) occurs in them, the
layouts of bars were counted there, and the HTML pages iReal Pro writes showed
which percent-encoding it uses.

## The link

```
irealb://  encodeURIComponent( song )
song   = title=composer==style=key==MUSIC=feel=bpm=repeats
MUSIC  = "1r34LbKcu7" + scrambled chart string
```

- Ten fields separated by `=`: **title, composer, (empty), style, key,
  (empty: transposition), music, feel, tempo, repeat count.** `pyrealpro`'s and
  the Perl module's old `irealbook://` form has six: `title=composer=style=key=n=chart`
  with the chart string unscrambled (the field before the chart is `n`).
- Several songs are separated by `===`, and a playlist ends with `===name`. One
  song: no separator, no name (what `ireal-reader`, `ireal-musicxml` and `pyRealParser`
  all accept).
- iReal Pro's own HTML pages hold the link as `encodeURIComponent` of the whole
  song, `=` included (`%3D`), in an `<a href="irealb://…">`. Readers percent-decode
  first and split on `=` afterwards, so no field may contain `=`: the export turns
  it into `-` (and control characters into spaces).
- Some readers (`ireal-reader`, `pyRealParser`) split on **runs** of `=` and so
  drop empty fields: a missing *feel* shifts the tempo into its place. The export
  always writes a feel (`Jazz-Medium Swing`, as in iReal's own files).
- **Key**: 24 names, major `C Db D Eb E F Gb G Ab A Bb B`, minor `A- Bb- B- C- C#-
  D- Eb- E- F- F#- G- G#-`. **Style** `Medium Swing` (a free text of iReal's list),
  **feel** `Jazz-Medium Swing`, **tempo** the recording's tempo, 40-400, else `0`
  (iReal Pro then uses the style's), **repeats** `0`, **composer** `Unknown`
  ("Last First" on iReal's side; unknown here).

## The scrambling

Chart string → `   `→`XyQ`, then ` |`→`LZ`, then `| x`→`Kcl` (in this order, on the
plain string) → the shuffle → prefix `1r34LbKcu7`. Reading undoes it in the order
`XyQ`, `LZ`, `Kcl`, after removing the prefix (the three substitutions do not
overlap in the strings the export writes).

The shuffle works on pieces of 50 characters from the left; a piece is shuffled
**only if at least two characters follow it**, and the final piece (50 or fewer) is
left alone. In a piece, characters 0-4 swap with 49-45 and 10-23 with 39-26; 5-9,
24-25 and 40-44 stay. It is its own inverse. The three sources agree on all of
this (`ireal-reader` and the Perl module state the "fewer than two" rule; the
renderer states it as "longer than 51"; both give the same result for every
length, tested at 0-153 and 777).

## The chart string

The music is a flat list of tokens read left to right; every token that is not a
bar line or an annotation makes **one cell**. iReal Pro draws rows of **16 cells**
whatever the bars are.

| Token | Meaning |
|---|---|
| `[` `{` | opening double bar / repeat sign, before a bar |
| `|` `]` `}` `Z` | closing single bar / double bar / end repeat / final bar. `]` followed by `[` is how a section is separated |
| `*A` `*B` `*C` `*D` `*i` `*v` | section marks (A-D, intro, verse), written after the opening bar and before the time signature: `[*AT44C^7…` |
| `T44` `T34` … `T74` `T68` `T12`(=12/8) | time signature: numerator, denominator (`T12` is the one oddity) |
| a chord | `Bb`, `C^7`, `D-7/G`, see below: takes its cell |
| space | an empty cell |
| `n` | no chord (N.C.) |
| `p` | slash: the previous chord goes on, one cell |
| `x` | repeat the previous bar; iReal writes a one-bar repeat as ` x  ` (empty, `x`, empty, empty) after a bar line, hence `Kcl` |
| `r` | repeat the previous two bars (not written by the export) |
| `,` | separator between two chord cells with nothing between them (`C^7,A-7,`); readers skip it |
| `<text>` | a comment shown near the cell (also `D.C. al Coda`, `3x`…) |
| `N1` `N2` `N3` | first, second, third ending (not written) |
| `Q` `S` `f` `U` `Y` `s` `l` | coda, segno, fermata, end, vertical spacer, small/large chords (not written) |
| `(Dm7)` after a chord | alternate chord shown small above (not written) |

**Chord timing.** One cell is one beat in this export. This is the rule iReal's
player follows (documented in iReal's forum, implemented by `ireal-musicxml`): a
chord lasts at least one beat; every empty cell after it adds a beat; empty cells
before the first chord of a bar are dropped; if the bar then has more beats than the
time signature the spaces are cut, fewer and they are shared out. Writing exactly
`beats` cells per bar, a chord on its beat and spaces elsewhere, makes the
timing unambiguous. iReal's own editor writes four cells per bar even in 3/4 or
6/4 and relies on the cutting and sharing; the real exports contain every kind
(`C___`, `C_C_`, `ppC_`, `_x__`, `CCCC`, `C___C_C_` …).

**Bars that go on.** The chart's "no chord starts here, the previous one goes on"
is written ` x  ` (iReal's repeat sign, the chart's own simile mark) when the
previous bar is one chord on its first beat (or such a repeat), else `p` in every
cell, and `p` for the beats before a first chord that starts late in the bar.

## Chords

Root `A`-`G` with `b` or `#`, then a quality text, then `/bass`. The roots and
basses keep the spelling of the chart (`harmony/chordParts`, in the written key).
The quality texts the export writes — every one of them found in the real exports,
except `69` / `-69`, which iReal's help page writes `6/9` and its files `69`:

| App quality | + extensions → text |
|---|---|
| `maj` | `` · +9 `add9` |
| `maj6` | `6` · +9 `69` |
| `maj7` | `^7` · +9 `^9` · +13 `^13` · +♯11 `^7#11` · +9 +♯11 `^9#11` · +♯5 `^7#5` |
| `min` | `-` · +♭13 `-b6` · +♯5 `-#5` |
| `min6` | `-6` · +9 `-69` |
| `min7` | `-7` · +9 `-9` · +11 `-11` · +♭5 `-7b5` |
| `minmaj7` | `-^7` · +9 `-^9` |
| `dim` / `dim7` | `o` / `o7` |
| `hdim7` | `h7` · +9 `h9` |
| `aug` | `+` |
| `sus2` / `sus4` | `2` / `sus` |
| `7sus4` | `7sus` · +9 `9sus` · +13 `13sus` · +♭9 `7b9sus` · +♭13 `7b13sus` |
| `7` | `7` · `9` `11` `13` · `7alt` · `7b9` `7#9` `7b5` `7#5` `7b13` `7#11` · two of them `9#11` `13#11` `9b5` `9#5` `13b9` `13#9` `7b9b13` `7b9#5` `7b9b5` `7b9#9` `7#9#5` `7#9b5` `7#9#11` `7b9#11` |
| `aug7` | written as the dominant with ♯5: `7#5`, `9#5`… |

**Where iReal Pro has no equivalent** the export writes the nearest text, and the
test reads it back as exactly that:

- `aug7` (C+7) → `C7#5`, the same notes;
- an extension `6` on a major / minor triad → the sixth chord (`C6`, `C-6`); on a
  dominant → `13`;
- a combination with no text takes the **richest row that fits**: `9`+`13` → `13`
  (the 13 implies the 9), `9`+`11` on a minor seventh → `-11`, `b9`+`#11`+`13` →
  `7b9#11` (first of the equally rich; the 13 is dropped);
- extensions iReal has no text for on that quality are dropped: `♯11` on a major
  triad, `13` on a minor seventh (→ `-7`), anything on `dim7`, `sus4` or `aug`,
  `b13` on `hdim7`;
- `alt` on a dominant wins over its companions (`7alt`);
- iReal's `5` (power chord), `^` and `h` (triads) have no app counterpart.

A doubtful chord is written like any other (iReal has no such notion).

## Layout and what is not written

- Chords are at **concert pitch in the key the user plays** (the transport's
  transposition is applied by `chartForExport`); the instrument (B♭, E♭) is not:
  iReal Pro transposes for instruments itself.
- A **pick-up bar** (before « mesure 1 ») is written first as a whole bar, its
  chord on its beats and spaces before it. iReal Pro has no pick-up: it plays it as
  a full bar.
- Sections: A-D, `i`/`intro`, `v`/`verse` become iReal marks; any other label is a
  comment `<label>`. A section after the first is preceded by `]` and opened by `[`.
- **Rows.** iReal Pro breaks rows every 16 cells. With four cells per bar (4/4) a
  row is four bars like the chart's. In other meters the bars (3, 5, 6, 7 cells)
  do not divide 16: a bar may then straddle two rows. It is read correctly.
- Not written: repeat signs and endings, codas, segnos, alternate chords, `r`,
  small chords, vertical spacers, playlists.

## What was run

`ireal.test.ts` writes charts and reads them with `../test/irealDecoder.ts` (own
unscrambling, tokenizer and quality grammar): the demo piece, 2/4 to 7/4, two and
four chords, pick-up, N.C., repeats, a meter change, 300 bars, charts of every
size around the 50-character boundaries, every quality × every extension × basses,
unusual titles. `ireal.reference.test.ts` (off unless pointed at the readers) reads
the same links with `ireal-reader` (from the link and from the HTML page),
`@music-i18n/ireal-musicxml` (cells, and a full MusicXML conversion that logs any
unknown chord or overfull bar: none) and `pyRealParser` (bars and chords).

What only iReal Pro itself can tell: that it imports the file, how it lays out
rows in 3/4 and 6/4, and how it plays the bars written with slashes.
