import { describe, expect, it } from 'vitest';
import { buildTitleIndex, DEFAULT_MATCH_THRESHOLD, findTitle, normalizeTitle, queryVariants, splitTitleBrackets, type TitleEntry } from './match';

// Invented playlist entries: real titles of tunes, no chart.
const TITLES: [string, string?][] = [
  ['All Of Me', 'Marks Gerald'],
  ['All Of You', 'Porter Cole'],
  ['All The Things You Are', 'Kern Jerome'],
  ['Alone Together', 'Schwartz Arthur'],
  ['Aquarela Do Brasil (a.k.a. Brazil)', 'Barroso Ary'],
  ['Autumn In New York', 'Duke Vernon'],
  ['Autumn Leaves', 'Kosma Joseph'],
  ['Blue Bossa', 'Dorham Kenny'],
  ['Blue In Green', 'Davis Miles'],
  ['Blue Moon', 'Rodgers Richard'],
  ['Body And Soul', 'Green Johnny'],
  ['Caravan', 'Ellington Duke'],
  ['Corcovado (Quiet Nights Of Quiet Stars)', 'Jobim Antonio-Carlos'],
  ['Dippermouth Blues (Sugar Foot Stomp)', 'Oliver King'],
  ['Fly Me To The Moon', 'Howard Bart'],
  ['Girl From Ipanema, The', 'Jobim Antonio-Carlos'],
  ['How High The Moon', 'Lewis Morgan'],
  ['How Insensitive', 'Jobim Antonio-Carlos'],
  ['In A Sentimental Mood', 'Ellington Duke'],
  ['Love For Sale', 'Porter Cole'],
  ['Love Is Here To Stay', 'Gershwin George'],
  ['Mood Indigo', 'Ellington Duke'],
  ['Misty', 'Garner Erroll'],
  ['Nature Boy', 'Ahbez Eden'],
  ['Night And Day', 'Porter Cole'],
  ['One Note Samba', 'Jobim Antonio-Carlos'],
  ["'Round Midnight", 'Monk Thelonious'],
  ['Satin Doll', 'Ellington Duke'],
  ['Satin Doll', 'Nobody Else'],
  ['Someday My Prince Will Come', 'Churchill Frank'],
  ['Someone To Watch Over Me', 'Gershwin George'],
  ['St. Thomas', 'Rollins Sonny'],
  ['Stella By Starlight', 'Young Victor'],
  ["Stompin' At The Savoy", 'Goodman Benny'],
  ['Summertime', 'Gershwin George'],
  ["Take The 'A' Train", 'Strayhorn Billy'],
  ['Take Five', 'Desmond Paul'],
  ["There Will Never Be Another You", 'Warren Harry'],
  ['What Is This Thing Called Love?', 'Porter Cole'],
  ['When The Saints Go Marching In (Dixieland Tunes)', 'Traditional'],
  ["'S Wonderful", 'Gershwin George'],
  ['Misty Blue Eyes', 'Nobody'],
  ['Yes', 'Nobody'],
  ['Blue', 'Nobody'],
];

const entries: TitleEntry<number>[] = TITLES.map(([title, composer], i) => ({ id: `t${i}`, title, composer: composer ?? null, data: i }));
const index = buildTitleIndex(entries);
const top = (query: string, threshold?: number): string | null => findTitle(index, query, { threshold })[0]?.entry.title ?? null;

describe('normalising', () => {
  it('lower-cases, drops accents, quotes and punctuation, and reads « in\' », « & » and « St. »', () => {
    expect(normalizeTitle("Stompin' At The Savoy")).toBe('stomping at the savoy');
    expect(normalizeTitle("'Round Midnight")).toBe('round midnight');
    expect(normalizeTitle('Água De Beber')).toBe('agua de beber');
    expect(normalizeTitle('Rhythm-A-Ning')).toBe('rhythm a ning');
    expect(normalizeTitle('Rock & Roll')).toBe('rock and roll');
    expect(normalizeTitle('St. Louis Blues')).toBe('saint louis blues');
    expect(normalizeTitle("Don’t Get Around Much Anymore")).toBe('dont get around much anymore');
    expect(normalizeTitle('')).toBe('');
    expect(normalizeTitle('!!!')).toBe('');
  });

  it('splits the brackets of an iReal title into its main title and its aliases, without the noise', () => {
    expect(splitTitleBrackets('Aquarela Do Brasil (a.k.a. Brazil)')).toEqual({ main: 'Aquarela Do Brasil', aliases: ['Brazil'] });
    expect(splitTitleBrackets('Dippermouth Blues (Sugar Foot Stomp)').aliases).toEqual(['Sugar Foot Stomp']);
    expect(splitTitleBrackets("'S Wonderful (1927)")).toEqual({ main: "'S Wonderful", aliases: [] });
    expect(splitTitleBrackets('Misty (Alternate)').aliases).toEqual([]);
    expect(splitTitleBrackets('(Untitled)').main).toBe('(Untitled)');
  });

  it('cuts a video title into the parts worth comparing', () => {
    const v = queryVariants('Lester Young - All The Things You Are (1945) [Remastered]');
    expect(v).toContain('All The Things You Are');
    expect(v).toContain('Lester Young');
    expect(queryVariants('Autumn Leaves - Live at the Village Vanguard 1961')).toContain('Autumn Leaves');
    expect(queryVariants('Misty by Erroll Garner')).toContain('Misty');
    expect(queryVariants('Round Midnight (take 2)')).toContain('Round Midnight');
    expect(queryVariants('')).toEqual([]);
    expect(queryVariants('   ')).toEqual([]);
  });
});

describe('finding a title', () => {
  it('finds the tune in the titles people give videos', () => {
    const cases: [string, string][] = [
      ['Lester Young - All The Things You Are (1945) [Remastered]', 'All The Things You Are'],
      ['Autumn Leaves - Live at Montreux 1991', 'Autumn Leaves'],
      ['Miles Davis - Autumn Leaves (feat. Cannonball Adderley)', 'Autumn Leaves'],
      ['Autumn Leaves (Take 2)', 'Autumn Leaves'],
      ['Julian "Cannonball" Adderley – Autumn Leaves | Official Audio', 'Autumn Leaves'],
      ['The Girl From Ipanema - Stan Getz & João Gilberto', 'Girl From Ipanema, The'],
      ['girl from ipanema', 'Girl From Ipanema, The'],
      ["Thelonious Monk - 'Round Midnight (Take 2)", "'Round Midnight"],
      ['Round Midnight', "'Round Midnight"],
      ['Stomping at the Savoy', "Stompin' At The Savoy"],
      ['Saint Thomas - Sonny Rollins', 'St. Thomas'],
      ['Autum Leaves', 'Autumn Leaves'],
      ['Take the A Train', "Take The 'A' Train"],
      ['Duke Ellington - Caravan (1937)', 'Caravan'],
      ['Sugar Foot Stomp', 'Dippermouth Blues (Sugar Foot Stomp)'],
      ['BLUE BOSSA (Kenny Dorham) - HD', 'Blue Bossa'],
      ['Stella by Starlight (Backing Track)', 'Stella By Starlight'],
      ['Stella Starlight', 'Stella By Starlight'],
      ['All Things You Are', 'All The Things You Are'],
      ['Misty', 'Misty'],
      ['Bill Evans Trio - Blue in Green (Live at the Village Vanguard)', 'Blue In Green'],
      ['Dexter Gordon: Body and Soul', 'Body And Soul'],
      ['Louis Armstrong - When the Saints Go Marching In', 'When The Saints Go Marching In (Dixieland Tunes)'],
      ['What is this thing called love', 'What Is This Thing Called Love?'],
      ["'S Wonderful", "'S Wonderful"],
      ['S Wonderful - Ella Fitzgerald 1957', "'S Wonderful"],
    ];
    for (const [query, title] of cases) expect(top(query), query).toBe(title);
  });

  it('knows a tune under the text in brackets of its chart and under a few translations', () => {
    expect(top('Brazil')).toBe('Aquarela Do Brasil (a.k.a. Brazil)');
    expect(top('Aquarela do Brasil')).toBe('Aquarela Do Brasil (a.k.a. Brazil)');
    expect(top('Les feuilles mortes')).toBe('Autumn Leaves');
    expect(top('Yves Montand - Les Feuilles Mortes (1949)')).toBe('Autumn Leaves');
    expect(top('Garota de Ipanema')).toBe('Girl From Ipanema, The');
    expect(top('Quiet Nights of Quiet Stars')).toBe('Corcovado (Quiet Nights Of Quiet Stars)');
    expect(top('Samba de uma nota so')).toBe('One Note Samba');
    expect(top('In Other Words')).toBe('Fly Me To The Moon');
    expect(top("Round About Midnight")).toBe("'Round Midnight");
    const viaAlias = findTitle(index, 'Les feuilles mortes')[0]!;
    expect(viaAlias.viaAlias).toBe('Les Feuilles Mortes');
    expect(viaAlias.score).toBeLessThan(1);
    expect(findTitle(index, 'Autumn Leaves')[0]!.viaAlias).toBeNull();
  });

  it('returns nothing rather than a wrong tune', () => {
    for (const query of [
      'Blue Skies',
      'Autumn',
      'All Of Us',
      'Love Is Here',
      'Someone To Watch',
      'Misty Blue',
      'Caravan Palace - Rock It For Me',
      'Never Gonna Give You Up',
      'Cover Girl',
      'Someday',
      'Night',
      'Fly Me',
      'A Day In The Life Of A Fool',
      'Live At The Village Vanguard',
      'Remastered 1959',
      '',
      '???',
    ]) {
      const got = findTitle(index, query).map((m) => m.entry.title);
      expect(got, query).toEqual([]);
    }
  });

  it('wants the whole title for a title of one word', () => {
    expect(top('Yes')).toBe('Yes');
    expect(top('Yes - Roundabout')).toBe('Yes');
    expect(top('I Say Yes To Everything')).toBeNull();
    expect(top('Blue')).toBe('Blue');
    expect(top('Blue Train')).toBeNull();
  });

  it('gives a score in [0, 1], best first, and respects the threshold and the maximum', () => {
    const all = findTitle(index, 'Autumn Leaves', { threshold: 0.3, max: 10 });
    expect(all[0]!.entry.title).toBe('Autumn Leaves');
    expect(all[0]!.score).toBe(1);
    expect(all[0]!.kind).toBe('exact');
    for (let i = 1; i < all.length; i++) expect(all[i - 1]!.score).toBeGreaterThanOrEqual(all[i]!.score);
    expect(all.every((m) => m.score >= 0.3 && m.score <= 1)).toBe(true);
    expect(findTitle(index, 'Autumn Leaves', { threshold: 0.3, max: 1 })).toHaveLength(1);
    expect(DEFAULT_MATCH_THRESHOLD).toBe(0.88);
    const typo = findTitle(index, 'Autum Leaves')[0]!;
    expect(typo.kind).toBe('close');
    expect(typo.score).toBeGreaterThan(0.9);
    expect(typo.score).toBeLessThan(1);
    const inside = findTitle(index, 'Frank Sinatra and Count Basie Fly Me To The Moon Sands Hotel Las Vegas')[0];
    expect(inside).toBeUndefined();
    const near = findTitle(index, 'Sinatra Fly Me To The Moon')[0]!;
    expect(near.kind).toBe('contained');
    expect(near.score).toBeGreaterThanOrEqual(DEFAULT_MATCH_THRESHOLD);
    expect(near.score).toBeLessThan(1);
  });

  it('keeps both charts of a title, the one whose composer the query names first', () => {
    const got = findTitle(index, 'Duke Ellington - Satin Doll');
    expect(got.map((m) => m.entry.composer)).toEqual(['Ellington Duke', 'Nobody Else']);
    expect(got[0]!.titleKey).toBe(got[1]!.titleKey);
    const plain = findTitle(index, 'Satin Doll');
    expect(plain.map((m) => m.score)).toEqual([1, 1]);
    expect(plain.map((m) => m.entry.data)).toEqual([27, 28]);
  });

  it('hands back what was stored with the entry', () => {
    const m = findTitle(index, 'Caravan')[0]!;
    expect(m.entry.id).toBe(`t${m.entry.data}`);
    expect(m.matched).toBe('Caravan');
  });

  it('works on an empty index and an index of entries without words', () => {
    expect(findTitle(buildTitleIndex([]), 'Anything')).toEqual([]);
    const odd = buildTitleIndex([{ id: 'x', title: '???' }, { id: 'y', title: 'Real Title' }]);
    expect(odd.size).toBe(1);
    expect(findTitle(odd, 'Real Title')).toHaveLength(1);
  });

  it('is fast on thousands of titles', () => {
    const words = ['blue', 'moon', 'love', 'night', 'day', 'dream', 'sweet', 'swing', 'rhythm', 'river', 'star', 'time', 'heart', 'rain', 'sun', 'summer', 'winter', 'train', 'street', 'paris', 'lady', 'baby', 'honey', 'soul', 'jazz', 'bossa', 'samba', 'tango', 'waltz', 'blues'];
    const many: TitleEntry[] = [];
    for (let i = 0; i < 5000; i++) many.push({ id: String(i), title: `${words[i % 30]} ${words[(i * 7 + 3) % 30]} ${words[(i * 11 + 5) % 30]} ${i}` });
    const t0 = performance.now();
    const big = buildTitleIndex(many);
    const built = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < 200; i++) findTitle(big, `Some Artist - ${words[i % 30]} ${words[(i * 7 + 3) % 30]} ${words[(i * 11 + 5) % 30]} ${i * 5} (Live 1960) [Remastered]`);
    const lookups = performance.now() - t1;
    expect(big.size).toBe(5000);
    expect(built).toBeLessThan(1000);
    expect(lookups).toBeLessThan(1500);
    expect(findTitle(big, 'blue night dream 0')[0]?.entry.id).toBe('0');
  });
});
