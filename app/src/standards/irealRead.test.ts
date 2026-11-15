import { describe, expect, it } from 'vitest';
import { exportToIRealPro, hussle, obfuscate } from '../export/ireal';
import { iRealCanonical, IREAL_QUALITIES } from '../export/irealChords';
import type { ExportBar, ExportChart } from '../export/chartExport';
import { chord, chordText } from '../harmony/chord';
import { parseChord } from '../harmony/parse';
import { CHORD_EXTENSIONS, CHORD_QUALITIES, type ChordSymbol } from '../model/harmony';
import {
  asAnalysisChord,
  chordFromIRealText,
  deobfuscate,
  displayComposer,
  displayTitle,
  extractIRealLinks,
  extractPlaylistFileLinks,
  iRealQualityMeaning,
  parseIRealKey,
  readIRealLink,
  readIRealPlaylists,
  readIRealText,
  safeDecode,
  splitIRealLink,
  tokenizeChart,
  unhussle,
  type ReadBar,
  type StandardChart,
} from './irealRead';

// ---------------------------------------------------------------- fixtures: tiny charts written here

interface FixtureSong {
  title: string;
  composer?: string;
  style?: string;
  key?: string;
  chart: string;
  bpm?: number;
}

const field = (s: string): string => s.replace(/=/g, '-');

/** One song as iReal writes it: ten fields, the chart string scrambled. */
function songText(s: FixtureSong): string {
  return [field(s.title), field(s.composer ?? 'Nobody Anna'), '', s.style ?? 'Medium Swing', s.key ?? 'C', '', obfuscate(s.chart), 'Jazz-Medium Swing', String(s.bpm ?? 120), '0'].join('=');
}

/** A link with everything percent-encoded (what this app writes). */
function link(songs: FixtureSong[], name?: string): string {
  return `irealb://${encodeURIComponent(songs.map(songText).join('===') + (name ? `===${name}` : ''))}`;
}

/** A link as iReal Pro's own files have it: only the fields are encoded, `=` stays. */
function rawLink(songs: FixtureSong[], name?: string): string {
  const enc = (t: string): string => t.split('=').map(encodeURIComponent).join('=');
  return `irealb://${songs.map((s) => songText(s).split('=').map((f, i) => (i === 6 ? encodeURIComponent(f) : encodeURIComponent(f))).join('=')).join('===')}${name ? `===${enc(name)}` : ''}`;
}

const readOne = (chart: string, extra: Partial<FixtureSong> = {}): StandardChart => {
  const pl = readIRealText(link([{ title: 'Test', chart, ...extra }]));
  expect(pl.skipped).toEqual([]);
  expect(pl.songs).toHaveLength(1);
  return pl.songs[0]!;
};

/** Compact picture of an unfolded chart: `source[passN][eN]:beat chord …`. */
function pic(bar: ReadBar): string {
  return `${bar.source}${bar.pass > 1 ? `p${bar.pass}` : ''}${bar.ending ? `e${bar.ending}` : ''}:${bar.chords.length === 0 ? '·' : bar.chords.map((c) => `${c.beat}${chordText(c.chord)}`).join(' ')}`;
}
const sources = (c: StandardChart): number[] => c.bars.map((b) => b.source);

// A 12-bar blues, a tune with a repeat and two endings, a tune with a coda, a tune with a segno.
const BLUES = '[*AT44F7   |Bb7   |F7   |F7   |Bb7   |Bb7   |F7   |F7   |C7   |Bb7   |F7 D7 |G-7 C7 Z';
const II_V_I = '{*AT44D-7   |G7   |N1C^7   |A7   }|N2C^7   |C6   ][*BE-7   |A7   |D-7   |G7   Z';
const CODA = '[*AT44C^7   |D-7   |E-7 Q  |F6   <D.C. al Coda> Z Y|QG7   |C6   Z';
const SEGNO = '[T44C^7   |SD-7   |E-7   |F6 <Fine>   |G7   |C6 <D.S. al Fine>   Z';

// ---------------------------------------------------------------- the link and the scrambling

describe('the link', () => {
  it('unscrambles what the writer scrambles, with the reader own formulation', () => {
    for (const n of [0, 1, 49, 50, 51, 52, 101, 102, 103, 150, 777]) {
      const s = Array.from({ length: n }, (_, i) => String.fromCharCode(33 + (i % 90))).join('');
      expect(unhussle(hussle(s))).toBe(s);
    }
    expect(deobfuscate(obfuscate('[T44C   |G   |C   |G   Z'))).toBe('[T44C   |G   |C   |G   Z');
  });

  it('reads a link percent-encoded as a whole and a link encoded field by field', () => {
    const songs = [{ title: "'S Wonderful", composer: 'Gershwin George', chart: BLUES, key: 'F' }, { title: 'Other Tune', chart: BLUES }];
    for (const url of [link(songs, 'My List'), rawLink(songs, 'My List')]) {
      const pl = readIRealText(url);
      expect(pl.name).toBe('My List');
      expect(pl.songs.map((s) => s.title)).toEqual(["'S Wonderful", 'Other Tune']);
      expect(pl.songs[0]!.composer).toBe('George Gershwin');
      expect(pl.songs[0]!.composerRaw).toBe('Gershwin George');
      expect(pl.songs[0]!.style).toBe('Medium Swing');
      expect(pl.songs[0]!.feel).toBe('Jazz-Medium Swing');
      expect(pl.songs[0]!.bpm).toBe(120);
      expect(pl.songs[0]!.key).toEqual({ tonic: 5, mode: 'major' });
      expect(pl.songs[0]!.bars).toHaveLength(12);
    }
  });

  it('reads one song without a playlist name, and the old irealbook:// link', () => {
    const one = readIRealText(link([{ title: 'Solo', chart: BLUES }]));
    expect(one.name).toBeNull();
    expect(one.songs).toHaveLength(1);
    const plain = BLUES.replace(/ /g, ' ');
    const old = `irealbook://${encodeURIComponent(['Volare', 'Modugno Domenico', 'Medium Swing', 'C', 'n', plain].join('='))}`;
    const pl = readIRealText(old);
    expect(pl.songs).toHaveLength(1);
    expect(pl.songs[0]!.title).toBe('Volare');
    expect(pl.songs[0]!.bars).toHaveLength(12);
    // two songs and a name, separated by « == »
    const two = `irealbook://${encodeURIComponent(['A Tune', 'X Y', 'Swing', 'C', 'n', plain, '', 'B Tune', 'X Y', 'Swing', 'F', 'n', plain, 'Old List'].join('='))}`;
    const pl2 = readIRealText(two);
    expect(pl2.songs.map((s) => s.title)).toEqual(['A Tune', 'B Tune']);
    expect(pl2.name).toBe('Old List');
  });

  it('finds the links of an HTML page, an apostrophe inside a link, entities, and several links', () => {
    const a = link([{ title: "Don't Blame Me", chart: BLUES }], 'One');
    const b = link([{ title: 'Second', chart: BLUES }], 'Two');
    const html = `<!DOCTYPE html><html><body><h3><a href="${a}">One</a></h3><p><a href='${b}'>Two</a></p><a href="https://example.org/">other</a>&amp;</body></html>`;
    expect(extractIRealLinks(html)).toEqual([a, b]);
    const apostrophe = 'irealb://%27S%20Wonderful=Gershwin%20George==Medium%20Swing=Eb==1r34LbKcu7XyQ==0=0';
    expect(extractIRealLinks(`<a href="${apostrophe}">x</a>`)).toEqual([apostrophe]);
    expect(extractIRealLinks("<a href='irealb://A%20B=C'>x</a>")).toEqual(['irealb://A%20B=C']);
    expect(extractIRealLinks(`${a}\n`)).toEqual([a]);
    const pls = readIRealPlaylists(html);
    expect(pls.map((p) => [p.name, p.songs.length])).toEqual([['One', 1], ['Two', 1]]);
    expect(readIRealText(html).songs.map((s) => s.title)).toEqual(["Don't Blame Me", 'Second']);
    expect(readIRealText(html).linkCount).toBe(2);
  });

  it('lists the attachments of a forum page, same site only', () => {
    const html = `<a href="/attachments/jazz-1460-html.1234/">Jazz 1460.html</a> <a href="https://forums.irealpro.com/attachments/x.9/">x</a>
      <a href="https://elsewhere.example/attachments/y.1/">y</a> <a href="/threads/foo.1/">thread</a> <a href="list.txt">txt</a> <a href="/attachments/jazz-1460-html.1234/">again</a>
      <a href="http://forums.irealpro.com/attachments/insecure.2/">http</a>`;
    expect(extractPlaylistFileLinks(html, 'https://forums.irealpro.com/threads/12753/')).toEqual([
      'https://forums.irealpro.com/attachments/jazz-1460-html.1234/',
      'https://forums.irealpro.com/attachments/x.9/',
      'https://forums.irealpro.com/threads/12753/list.txt',
    ]);
    expect(extractPlaylistFileLinks(html, 'not a url')).toEqual([]);
  });

  it('never throws on garbage and skips a bad song with its reason', () => {
    expect(readIRealText('')).toEqual({ name: null, songs: [], skipped: [], linkCount: 0 });
    expect(readIRealText('<html>no link</html>').songs).toEqual([]);
    expect(readIRealLink('irealb://').songs).toEqual([]);
    expect(readIRealLink('https://example.org').skipped[0]!.reason).toMatch(/not an irealb/);
    const good = songText({ title: 'Good', chart: BLUES });
    const noMusic = 'Broken=Nobody==Medium Swing=C==NOT-MUSIC==0=0';
    const empty = songText({ title: 'Empty', chart: '[T44   |    Z' });
    const odd = 'Odd=Nobody=Medium Swing=C';
    const pl = readIRealText(`irealb://${encodeURIComponent([noMusic, good, empty, odd].join('==='))}`);
    expect(pl.songs.map((s) => s.title)).toEqual(['Good']);
    expect(pl.skipped.map((s) => s.title)).toEqual(['Broken', 'Empty', 'Odd']);
    expect(pl.skipped.every((s) => s.reason.length > 0)).toBe(true);
    // bad percent-escapes do not stop the reading
    expect(safeDecode('100%')).toBe('100%');
    expect(safeDecode('a%20b%')).toBe('a b%');
    const withBadEscape = `irealb://${songText({ title: '50% Off', chart: BLUES }).replace(/ /g, '%20').replace('%20Off', '%20Off')}`;
    expect(readIRealText(withBadEscape).songs).toHaveLength(1);
  });

  it('splits a playlist into cheap raw songs and names it', () => {
    const { name, songs, skipped } = splitIRealLink(link([{ title: 'A', chart: BLUES }, { title: 'B', chart: BLUES }], 'Both'));
    expect(name).toBe('Both');
    expect(skipped).toEqual([]);
    expect(songs.map((s) => [s.index, s.title, s.format])).toEqual([[0, 'A', 'irealb'], [1, 'B', 'irealb']]);
  });

  it('reads a song written with a missing field (older exports without the feel and the transposition)', () => {
    const music = obfuscate(BLUES);
    const seven = ['Short', 'Nobody Anna', 'Medium Swing', 'C', music, '120', '0'].join('=');
    const pl = readIRealText(`irealb://${encodeURIComponent(seven)}`);
    expect(pl.songs).toHaveLength(1);
    expect(pl.songs[0]!.bpm).toBe(120);
    expect(pl.songs[0]!.feel).toBeNull();
    expect(pl.songs[0]!.style).toBe('Medium Swing');
  });

  it('puts titles and composers in reading order, and reads the keys', () => {
    expect(displayTitle('Girl From Ipanema, The')).toBe('The Girl From Ipanema');
    expect(displayTitle("Man I Love, The")).toBe('The Man I Love');
    expect(displayTitle('Hello, Dolly')).toBe('Hello, Dolly');
    expect(displayTitle('  Take   Five ')).toBe('Take Five');
    expect(displayComposer('Jobim Antonio-Carlos')).toBe('Antonio-Carlos Jobim');
    expect(displayComposer('Duke Ellington Billy Strayhorn')).toBe('Duke Ellington Billy Strayhorn');
    expect(parseIRealKey('Bb')).toEqual({ tonic: 10, mode: 'major' });
    expect(parseIRealKey('F#-')).toEqual({ tonic: 6, mode: 'minor' });
    expect(parseIRealKey('Am')).toEqual({ tonic: 9, mode: 'minor' });
    expect(parseIRealKey('H')).toBeNull();
    expect(parseIRealKey('')).toBeNull();
  });
});

// ---------------------------------------------------------------- chords

describe('chord texts', () => {
  it('reads every quality text of the writer table as the writer means it', () => {
    for (const q of IREAL_QUALITIES) {
      const m = chordFromIRealText(`Bb${q.text}/D`);
      expect(m, q.text).not.toBeNull();
      expect(m!.approximate, q.text).toBe(false);
      expect(m!.chord.quality, q.text).toBe(q.quality);
      expect([...m!.chord.extensions].sort(), q.text).toEqual([...q.ext].sort());
      expect(m!.chord.root).toBe(10);
      expect(m!.chord.bass).toBe(2);
    }
  });

  it('reads the texts real playlists have that the writer does not write', () => {
    const at = (t: string): ChordSymbol => chordFromIRealText(`C${t}`)!.chord;
    expect(at('^')).toEqual(chord(0, 'maj7'));
    expect(at('ø7')).toEqual(chord(0, 'hdim7'));
    expect(at('h')).toEqual(chord(0, 'hdim7'));
    expect(at('6/9')).toEqual(chord(0, 'maj6', ['9']));
    expect(at('-6/9')).toEqual(chord(0, 'min6', ['9']));
    expect(at('-^7')).toEqual(chord(0, 'minmaj7'));
    expect(at('-9')).toEqual(chord(0, 'min7', ['9']));
    expect(at('+7')).toEqual(chord(0, 'aug7'));
    expect(at('+')).toEqual(chord(0, 'aug'));
    expect(at('7sus')).toEqual(chord(0, '7sus4'));
    expect(at('13sus')).toEqual(chord(0, '7sus4', ['13']));
    expect(at('7alt')).toEqual(chord(0, '7', ['alt']));
    expect(at('7b9#11')).toEqual(chord(0, '7', ['b9', '#11']));
    expect(at('^7b5')).toEqual(chord(0, 'maj7', ['b5']));
    expect(at('^9#11')).toEqual(chord(0, 'maj7', ['9', '#11']));
    expect(at('2')).toEqual(chord(0, 'sus2'));
    expect(at('add9')).toEqual(chord(0, 'maj', ['9']));
    expect(at('-11')).toEqual(chord(0, 'min7', ['11']));
    expect(at('o7')).toEqual(chord(0, 'dim7'));
    // the same chords the app's own parser reads from what a player types
    for (const [ireal, typed] of [['C-7', 'Cm7'], ['F#h7', 'F#m7b5'], ['Eb^7', 'Ebmaj7'], ['G7b13', 'G7b13'], ['A-^7', 'Am(maj7)'], ['Bb69', 'Bb6/9']] as const) {
      const p = parseChord(typed);
      expect(p.ok && p.chord).toBeTruthy();
      if (p.ok) expect(chordFromIRealText(ireal)!.chord).toEqual(p.chord);
    }
  });

  it('keeps the closest chord and says so when there is no equivalent', () => {
    const power = chordFromIRealText('E5')!;
    expect(power.approximate).toBe(true);
    expect(power.chord).toEqual(chord(4, 'maj'));
    const slashed = chordFromIRealText('D5/E')!;
    expect(slashed.approximate).toBe(true);
    expect(slashed.chord.bass).toBe(4);
    expect(chordFromIRealText('Co^7')).toEqual({ chord: chord(0, 'dim7'), approximate: true });
    expect(chordFromIRealText('F#7susadd3')!.approximate).toBe(true);
    expect(chordFromIRealText('C7b11')!.approximate).toBe(true);
    expect(chordFromIRealText('H7')).toBeNull();
    expect(iRealQualityMeaning('-7').approximate).toBe(false);
  });

  it('names a chord as the analysis does, on request: m7♭5 is half-diminished, 7♯5 is augmented', () => {
    expect(asAnalysisChord(chordFromIRealText('A-7b5')!.chord)).toEqual(chord(9, 'hdim7'));
    expect(asAnalysisChord(chordFromIRealText('Ah7')!.chord)).toEqual(chord(9, 'hdim7'));
    expect(asAnalysisChord(chordFromIRealText('C7#5')!.chord)).toEqual(chord(0, 'aug7'));
    expect(asAnalysisChord(chordFromIRealText('C9#5')!.chord)).toEqual(chord(0, 'aug7', ['9']));
    expect(asAnalysisChord(chordFromIRealText('C7b9#5')!.chord)).toEqual(chord(0, 'aug7', ['b9']));
    expect(asAnalysisChord(chordFromIRealText('G7alt')!.chord)).toEqual(chord(7, '7', ['alt']));
    const plain = chord(2, 'min7', [], 7);
    expect(asAnalysisChord(plain)).toBe(plain);
  });

  it('keeps the original text and the bass note of a slash chord', () => {
    const song = readOne('[T44Bb^7#11/D   |C-7/Bb F7/A |n   Z');
    const [a, b, c] = song.bars;
    expect(a!.chords[0]!.text).toBe('Bb^7#11/D');
    expect(a!.chords[0]!.chord).toEqual(chord(10, 'maj7', ['#11'], 2));
    expect(b!.chords.map((x) => x.chord?.bass)).toEqual([10, 9]);
    expect(c!.chords).toEqual([{ beat: 0, duration: 4, chord: null, text: 'n', approximate: false }]);
  });

  it('keeps alternate chords apart from the chord that is played', () => {
    const song = readOne('[T44C^7(A-7)   |D-7 G7(Db7) |C^7   | (F7)x   |C^7   Z');
    expect(song.bars[0]!.chords).toHaveLength(1);
    expect(song.bars[0]!.chords[0]!.chord).toEqual(chord(0, 'maj7'));
    expect(song.bars[0]!.alternates).toEqual([{ beat: 0, chord: chord(9, 'min7'), text: 'A-7', approximate: false }]);
    expect(song.bars[1]!.alternates).toEqual([{ beat: 2, chord: chord(1, '7'), text: 'Db7', approximate: false }]);
    expect(song.bars[1]!.chords.map((c) => c.chord?.root)).toEqual([2, 7]);
    // an alternate on the cell of an empty beat, and after a repeat sign
    expect(song.bars[3]!.alternates.map((a) => a.text)).toEqual(['F7']);
  });
});

// ---------------------------------------------------------------- bars and beats

describe('bars and beats', () => {
  it('reads a blues: twelve bars, chords on their beats, a meter, a key, the section', () => {
    const blues = readOne(BLUES, { key: 'F' });
    expect(blues.bars).toHaveLength(12);
    expect(blues.writtenBars).toBe(12);
    expect(blues.meter).toEqual({ numerator: 4, denominator: 4 });
    expect(blues.bars[0]!.section).toBe('A');
    expect(blues.bars.map((b) => b.pass)).toEqual(new Array(12).fill(1));
    expect(blues.bars.map(pic)).toEqual([
      '0:0F7', '1:0B♭7', '2:0F7', '3:0F7', '4:0B♭7', '5:0B♭7', '6:0F7', '7:0F7', '8:0C7', '9:0B♭7', '10:0F7 2D7', '11:0Gm7 2C7',
    ].map((x, i) => x.replace(/^\d+/, String(i))));
    expect(blues.bars[10]!.chords.map((c) => c.duration)).toEqual([2, 2]);
    expect(blues.warnings).toEqual([]);
  });

  it('shares the beats of a bar as iReal Pro does: spaces cut, free beats shared out, leading spaces dropped', () => {
    const song = readOne('[T44C7 D7 E7 F7|C7   |C7 D7|C7 D7 E7|   C7 D7|  C7   Z');
    const rows = song.bars.map((b) => b.chords.map((c) => `${c.beat}+${c.duration}`).join(' '));
    // 3 cells: the free beat goes to the first chord; 5 cells: the first chord's space is cut
    expect(rows).toEqual(['0+1 1+1 2+1 3+1', '0+4', '0+3 3+1', '0+1 1+2 3+1', '0+3 3+1', '0+4']);
    // two chords with their usual two cells each (« C7 D7 »): half a bar each
    expect(readOne('[T44C7  D7  |C7 Z').bars[0]!.chords.map((c) => `${c.beat}+${c.duration}`)).toEqual(['0+2', '2+2']);
    // more chords than beats: the extra ones are dropped, with a warning
    const crowded = readOne('[T44C7 D7 E7 F7 G7 A7 B7 C7 D7 |C7   Z');
    expect(crowded.bars[0]!.chords).toHaveLength(4);
    expect(crowded.warnings.join()).toMatch(/chords in 4\/4/);
  });

  it('counts a small chord (s … l) as one beat, and carries a chord over with a slash', () => {
    const small = readOne('[T44sC7,B7,Bb7,A7|lD-7   |C7 D7 |pE7  Z');
    expect(small.bars[0]!.chords.map((c) => `${c.beat}${chordText(c.chord)}:${c.duration}`)).toEqual(['0C7:1', '1B7:1', '2B♭7:1', '3A7:1']);
    // a bar that begins with a slash: the chord of the bar before goes on, no onset on beat 0
    expect(small.bars[3]!.chords.map((c) => `${c.beat}${chordText(c.chord)}`)).toEqual(['1E7']);
    // a slash after a chord is a beat more for it
    const slashes = readOne('[T44C7pp D7 |C7 pD7 Z');
    expect(slashes.bars.map((b) => b.chords.map((c) => `${c.beat}+${c.duration}`).join(' '))).toEqual(['0+3 3+1', '0+2 2+2']);
  });

  it('reads an invisible chord W as the previous chord over a new bass', () => {
    const song = readOne('[T44C7 W/E |F6   |sW/G  lA7   Z');
    expect(song.bars[0]!.chords.map((c) => c.text)).toEqual(['C7', 'C7/E']);
    expect(song.bars[0]!.chords[1]!.chord).toEqual(chord(0, '7', [], 4));
    // with nothing before it, it is ignored
    expect(readOne('[T44W/G   |C   Z').bars[0]!.chords).toEqual([]);
  });

  it('follows the meters: 3/4, 6/8 and a change inside the chart', () => {
    const song = readOne('[T44C^7   |D-7   |T34G7  |C^7  |T68F6     |G7   Z');
    expect(song.meters).toEqual([{ numerator: 4, denominator: 4 }, { numerator: 3, denominator: 4 }, { numerator: 6, denominator: 8 }]);
    expect(song.bars.map((b) => `${b.meter.numerator}/${b.meter.denominator}`)).toEqual(['4/4', '4/4', '3/4', '3/4', '6/8', '6/8']);
    expect(song.bars[2]!.chords[0]!.duration).toBe(3);
    expect(song.bars[4]!.chords[0]!.duration).toBe(6);
    expect(readOne('[T12C   |D   Z').bars[0]!.meter).toEqual({ numerator: 12, denominator: 8 });
    expect(readOne('[T22C   |D   Z').bars[0]!.meter).toEqual({ numerator: 2, denominator: 2 });
    // no meter written: 4/4
    expect(readOne('[C   |D   Z').meter).toEqual({ numerator: 4, denominator: 4 });
  });

  it('keeps the section marks, the comments, and drops the padding between sections', () => {
    const song = readOne('[*iT44C   |D   ]    [*A<Head>E   |F   ]*B[G   |A   Z', { key: 'C' });
    expect(song.bars.map((b) => b.section)).toEqual([null, null, 'A', null, 'B', null].map((x, i) => (i === 0 ? 'i' : x)));
    expect(song.bars[2]!.comments).toEqual(['Head']);
    expect(song.bars).toHaveLength(6);
    expect(tokenizeChart('[T44C   |D   ]       [E   Z').bars).toHaveLength(3);
  });

  it('repeats a bar with x and two bars with r, and reads the bars that follow', () => {
    const song = readOne('[T44C^7   |D-7 G7 | x  |E-7   |A7   |   r|    |F6   Z');
    expect(song.bars.map(pic)).toEqual([
      '0:0C△', '1:0Dm7 2G7', '2:0Dm7 2G7', '3:0Em7', '4:0A7', '5:0Em7', '6:0A7', '7:0F6',
    ]);
    expect(song.bars.map((b) => b.simile)).toEqual([null, null, 'x', null, null, 'r', 'r', null]);
  });
});

// ---------------------------------------------------------------- unfolding

describe('unfolding', () => {
  it('plays a repeat with a first and second ending as played', () => {
    const song = readOne(II_V_I);
    expect(song.writtenBars).toBe(10);
    expect(sources(song)).toEqual([0, 1, 2, 3, 0, 1, 4, 5, 6, 7, 8, 9]);
    expect(song.bars.map((b) => [b.pass, b.ending])).toEqual([
      [1, null], [1, null], [1, 1], [1, 1], [2, null], [2, null], [2, 2], [2, 2], [1, null], [1, null], [1, null], [1, null],
    ]);
    expect(song.bars[2]!.chords[0]!.text).toBe('C^7');
    expect(song.bars[3]!.chords[0]!.text).toBe('A7');
    expect(song.bars[6]!.chords[0]!.text).toBe('C^7');
    expect(song.bars[7]!.chords[0]!.text).toBe('C6');
    expect(song.bars[8]!.section).toBe('B');
  });

  it('plays a plain repeat twice, and « 3x » three times', () => {
    expect(sources(readOne('{T44C   |D   |E   }|F   Z'))).toEqual([0, 1, 2, 0, 1, 2, 3]);
    expect(sources(readOne('{T44C   |D<3x>   }|F   Z'))).toEqual([0, 1, 0, 1, 0, 1, 2]);
    // an end repeat with no start repeats from the start
    expect(sources(readOne('[T44C   |D   }|F   Z'))).toEqual([0, 1, 0, 1, 2]);
    // three endings
    const three = readOne('{T44C   |N1D   }|N2E   }|N3F   Z');
    expect(sources(three)).toEqual([0, 1, 0, 2, 0, 3]);
  });

  it('follows D.C. al Coda: to the coda sign, then to the coda', () => {
    const song = readOne(CODA);
    expect(song.writtenBars).toBe(6);
    expect(sources(song)).toEqual([0, 1, 2, 3, 0, 1, 2, 4, 5]);
    expect(song.bars.at(-1)!.chords[0]!.text).toBe('C6');
    expect(song.warnings).toEqual([]);
  });

  it('follows D.S. al Fine: from the segno to the Fine', () => {
    expect(sources(readOne(SEGNO))).toEqual([0, 1, 2, 3, 4, 5, 1, 2, 3]);
  });

  it('follows D.C. al Fine, and « D.C. al 3rd ending »', () => {
    expect(sources(readOne('[T44C   |D   |E <Fine>  |F <D.C. al Fine>  Z'))).toEqual([0, 1, 2, 3, 0, 1, 2]);
    const third = readOne('{T44C   |N1D   }|N2E   ][*BG   |A   <D.C. al 3rd Ending>]|N3F   Z');
    expect(sources(third)).toEqual([0, 1, 0, 2, 3, 4, 0, 5]);
  });

  it('warns when a jump has nothing to jump to, and never loops for ever', () => {
    const noSegno = readOne('[T44C   |D <D.S. al Fine>  Z');
    expect(noSegno.warnings.join()).toMatch(/segno/);
    expect(noSegno.bars.length).toBeLessThan(20);
    // two directives that point at each other
    const loop = readOne('[T44C <D.C. al Fine>  |D <D.C. al Coda>  Z');
    expect(loop.bars.length).toBeLessThan(40);
  });
});

// ---------------------------------------------------------------- round trip with the writer

const NOT_YET = Symbol('nothing sounds yet');
type Sounding = ChordSymbol | null | typeof NOT_YET;

/** What sounds on each beat of each bar: a chord goes on until the next one. */
function sounding(bars: { beats: number; chords: { beat: number; chord: ChordSymbol | null }[] }[]): Sounding[][] {
  let going: Sounding = NOT_YET;
  return bars.map((b) => {
    const row: Sounding[] = [];
    for (let beat = 0; beat < b.beats; beat++) {
      const c = b.chords.find((x) => x.beat === beat);
      if (c) going = c.chord;
      row.push(going);
    }
    return row;
  });
}

function exportBar(i: number, beats: number, chords: [number, ChordSymbol | null][], opts: Partial<ExportBar> = {}): ExportBar {
  void beats;
  return {
    bar: i,
    section: null,
    doubleBarBefore: false,
    timeSignature: null,
    chords: chords.map(([beat, c]) => ({ beat, chord: c, text: '', doubtful: false })),
    repeat: false,
    final: false,
    ...opts,
  };
}

function exportChart(bars: ExportBar[], opts: Partial<ExportChart> = {}): ExportChart {
  bars[bars.length - 1]!.final = true;
  return { title: 'Round Trip', composer: null, style: null, key: { tonic: 0, mode: 'major' }, timeSignature: { numerator: 4, denominator: 4 }, tempo: 120, repeats: 'none', bars, ...opts };
}

function roundTrip(chart: ExportChart): void {
  const url = exportToIRealPro(chart).url;
  const pl = readIRealText(url);
  expect(pl.skipped).toEqual([]);
  expect(pl.songs).toHaveLength(1);
  const song = pl.songs[0]!;
  expect(song.warnings).toEqual([]);
  expect(song.bars).toHaveLength(chart.bars.length);
  let meter = chart.timeSignature;
  const expected = sounding(
    chart.bars.map((b) => {
      if (b.timeSignature) meter = b.timeSignature;
      return { beats: meter.numerator, chords: b.chords.map((c) => ({ beat: c.beat, chord: c.chord === null ? null : iRealCanonical(c.chord) })) };
    }),
  );
  const got = sounding(song.bars.map((b) => ({ beats: b.meter.numerator, chords: b.chords.map((c) => ({ beat: c.beat, chord: c.chord })) })));
  expect(got).toEqual(expected);
}

describe('round trip with the app writer', () => {
  const C = (q: ChordSymbol['quality'], root = 0, ext: ChordSymbol['extensions'] = [], bass: number | null = null) => chord(root, q, ext, bass);

  it('reads back a plain chart: one and two chords per bar, repeats, N.C., sections', () => {
    roundTrip(
      exportChart(
        [
          exportBar(0, 4, [[0, C('maj7')]], { section: 'A', timeSignature: { numerator: 4, denominator: 4 } }),
          exportBar(1, 4, [[0, C('min7', 2)], [2, C('7', 7)]]),
          exportBar(2, 4, [], { repeat: true }),
          exportBar(3, 4, [[0, C('maj7')], [1, C('7', 5)], [2, C('min7', 4)], [3, C('7', 9)]]),
          exportBar(4, 4, [[0, C('min7', 2)]], { section: 'B', doubleBarBefore: true }),
          exportBar(5, 4, [], { repeat: true }),
          exportBar(6, 4, [[0, null]]),
          exportBar(7, 4, [[0, C('7', 7, ['b9'], 11)], [2, C('maj6', 0)]]),
        ],
        { key: { tonic: 0, mode: 'major' } },
      ),
    );
  });

  it('reads back charts in 2/4 to 7/4 and a meter change, with chords carried over bars', () => {
    for (const n of [2, 3, 5, 6, 7]) {
      const bars = [
        exportBar(0, n, [[0, C('maj7')]], { timeSignature: { numerator: n, denominator: 4 } }),
        exportBar(1, n, [[0, C('min7', 9)], [n - 1, C('7', 2)]]),
        exportBar(2, n, [[Math.min(1, n - 1), C('7', 7)]]),
        exportBar(3, n, [], { repeat: true }),
        exportBar(4, n, [[0, C('maj7')]]),
      ];
      roundTrip(exportChart(bars, { timeSignature: { numerator: n, denominator: 4 } }));
    }
    roundTrip(
      exportChart([
        exportBar(0, 4, [[0, C('maj7')]], { timeSignature: { numerator: 4, denominator: 4 } }),
        exportBar(1, 4, [[0, C('7', 7)]]),
        exportBar(2, 3, [[0, C('min7', 9)], [1, C('7', 2)]], { timeSignature: { numerator: 3, denominator: 4 } }),
        exportBar(3, 3, [[0, C('maj7')]]),
      ]),
    );
  });

  it('reads back every quality with every extension and a bass note', () => {
    const bars: ExportBar[] = [];
    for (const q of CHORD_QUALITIES) {
      bars.push(exportBar(bars.length, 4, [[0, C(q, 3)]]));
      bars.push(exportBar(bars.length, 4, [[0, C(q, 8, [], 1)], [2, C(q, 6)]]));
      for (const e of CHORD_EXTENSIONS) bars.push(exportBar(bars.length, 4, [[0, C(q, 10, [e])]]));
    }
    roundTrip(exportChart(bars));
  });

  it('reads back a long chart and the title, composer, key and tempo fields', () => {
    const bars: ExportBar[] = [];
    for (let i = 0; i < 300; i++) bars.push(exportBar(i, 4, i % 3 === 0 ? [[0, C('min7', i % 12)], [2, C('7', (i + 5) % 12)]] : [[0, C('maj7', i % 12)]]));
    roundTrip(exportChart(bars));
    const url = exportToIRealPro(exportChart([exportBar(0, 4, [[0, C('maj7', 10)]])], { title: 'Équinoxe', key: { tonic: 10, mode: 'major' }, tempo: 96 })).url;
    const song = readIRealText(url).songs[0]!;
    expect(song.title).toBe('Équinoxe');
    expect(song.key).toEqual({ tonic: 10, mode: 'major' });
    expect(song.bpm).toBe(96);
  });

  it('does not keep an empty bar (iReal pads with empty cells, a bar of nothing cannot be told from padding)', () => {
    const chart = exportChart([exportBar(0, 4, [[0, C('maj7')]]), exportBar(1, 4, []), exportBar(2, 4, [[0, C('7', 7)]])]);
    const song = readIRealText(exportToIRealPro(chart).url).songs[0]!;
    expect(song.bars).toHaveLength(2);
  });
});
