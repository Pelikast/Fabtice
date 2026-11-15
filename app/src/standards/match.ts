// Finding a standard by its title. The titles that come from a video link are
// noisy (« Lester Young - All The Things You Are (1945) [Remastered] »,
// « Autumn Leaves - Live at … », accents, quotes, « feat. », a year, « take 2 »),
// the titles of the charts are iReal's (« Girl From Ipanema, The », « 'Round
// Midnight », « Aquarela Do Brasil (a.k.a. Brazil) »). A WRONG chart is worse
// than none: the score of a match is in [0, 1] and nothing below the threshold
// (0.85 unless asked otherwise) is returned.
//
// Pure functions over an index built once (`buildTitleIndex`): a few thousand
// titles, a lookup scores only the titles that share a word (or the first three
// letters of one) with the query, so it takes well under a millisecond.
//
// How a score is made
//  - the query is cut into variants: without brackets, with their content,
//    each part between « - », « | », « : », before « by », with the trailing
//    noise (years, « remastered », « live at … », « feat. … », « take 2 »,
//    « official video »…) taken away;
//  - a title and a variant are compared word by word, in order (the longest
//    common run of words, a word one letter off counting 0.9): 1 for the same
//    words, a little less when only small words (« of », « by ») differ;
//  - a title found whole inside a longer variant counts 0.9 (≤ 2 extra words)
//    or 0.86 (≤ 4), but never for a title of one real word (« Misty », « Blue »):
//    those must be the whole title;
//  - a title is also known under its alias: the text in brackets of the chart
//    (« Brazil », « Sugar Foot Stomp »), and a short table of translations
//    (« Les feuilles mortes »); an alias counts 0.98 of the same match;
//  - when the chart has a composer and the query names it, +0.02.

/** What goes in the index. `data` is whatever the caller wants back (a chart, a position in a playlist). */
export interface TitleEntry<T = unknown> {
  id: string;
  title: string;
  /** Other titles of the same tune (the brackets of an iReal title are added by themselves). */
  aliases?: readonly string[];
  /** « Antonio-Carlos Jobim »: used to break ties when the query names the composer. */
  composer?: string | null;
  data?: T;
}

export type TitleMatchKind = 'exact' | 'close' | 'contained';

export interface TitleMatch<T = unknown> {
  entry: TitleEntry<T>;
  /** In [0, 1]; at least the threshold. */
  score: number;
  kind: TitleMatchKind;
  /** The title with its articles and noise removed: equal for two charts of the same tune. */
  titleKey: string;
  /** The alias that matched, or null when the title itself did. */
  viaAlias: string | null;
  /** The part of the query that matched (normalised). */
  matched: string;
}

export interface FindOptions {
  /** Nothing below this is returned. Default 0.85. */
  threshold?: number;
  /** At most this many matches. Default 5. */
  max?: number;
}

export const DEFAULT_MATCH_THRESHOLD = 0.85;

// ---------------------------------------------------------------- normalising

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'and', 'or', 'for', 'with', 'from', 'by']);
const LEADING_ARTICLES = new Set(['the', 'a', 'an']);

const WORD_MAP: Record<string, string> = { st: 'saint', ste: 'sainte', mt: 'mount' };

/** Lower case, no accents, no punctuation; « nothin' » is « nothing », « & » is « and », « St. » is « saint ». */
export function normalizeTitle(text: string): string {
  return tokenize(text).join(' ');
}

function tokenize(text: string): string[] {
  const s = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201b`\u00b4]/g, "'")
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/\b(\p{L}+)in'(?=\s|$)/gu, '$1ing')
    .replace(/'/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  if (s === '') return [];
  return s.split(' ').map((w) => WORD_MAP[w] ?? w);
}

/** Words without a leading article (« the girl from ipanema » is « girl from ipanema »). */
function keyTokens(tokens: readonly string[]): string[] {
  return tokens.length > 1 && LEADING_ARTICLES.has(tokens[0]!) ? tokens.slice(1) : [...tokens];
}

const nonStop = (tokens: readonly string[]): string[] => tokens.filter((t) => !STOP.has(t));

// ---------------------------------------------------------------- noise in queries

/** Phrases that end a video title without being part of the tune (matched at the end, case-insensitive). */
const TRAILING_NOISE: RegExp[] = [
  /\b(?:digitally\s+)?(?:19|20)?\d{0,2}\s*remaster(?:ed)?(?:\s+(?:19|20)\d{2})?\s*$/i,
  /\b(?:official\s+)?(?:music\s+)?(?:video|audio|visualizer|lyric\s+video|lyrics?)\s*$/i,
  /\b(?:hd|hq|4k|mono|stereo|remix|instrumental|karaoke|cover)\s*$/i,
  /\b(?:full\s+)?(?:album|single|radio|original|studio|stereo|mono)\s+(?:version|edit|mix|take|recording)\s*$/i,
  /\b(?:alt\.?|alternate|alternative|master|first|second|third|take)\s+(?:take\s+)?(?:\d+|one|two|three|four|five|[a-d])\s*$/i,
  /\btake\s+(?:\d+|one|two|three|four|five)\s*$/i,
  /\b(?:backing\s+track|play[\s-]?along|jam\s+track|chord\s+(?:chart|changes|progression)|tutorial|lesson)\b.*$/i,
  /\b(?:live|recorded\s+live|en\s+direct|en\s+vivo)(?:\s+(?:at|in|from|@|au|à|a|en|dans)\b.*)?\s*$/i,
  /\b(?:feat\.?|featuring|ft\.?)\s+.*$/i,
  /\b(?:19|20)\d{2}\s*$/,
  /\b(?:19|20)\d{2}\b(?=\s+(?:live|remaster))/i,
];

const BRACKETS = /\([^)]*\)|\[[^\]]*\]|\{[^}]*\}|【[^】]*】/g;

/** Years, « live », « remastered »… on their own in a bracket: noise, not an alias. */
const NOISE_WORD = /^(?:(?:19|20)\d{2}|remaster(?:ed)?|live|mono|stereo|hd|hq|official|audio|video|lyrics?|alt(?:ernate)?|version|take|solo|intro|ending|cover|instrumental|remix|karaoke|feat|ft|part|pt|\d+)$/;

function stripTrailingNoise(text: string): string {
  let s = text.trim();
  for (let guard = 0; guard < 6; guard++) {
    const before = s;
    for (const re of TRAILING_NOISE) {
      const stripped = s.replace(re, '').replace(/[\s,;:–—-]+$/g, '').trim();
      // keep at least one word: a title that is only noise is not stripped to nothing
      if (stripped !== s && stripped !== '') s = stripped;
    }
    if (s === before) break;
  }
  return s;
}

/**
 * The parts of a query worth comparing with titles: the whole text, without its brackets, the content of its
 * brackets, each part between separators, and each of those without trailing noise.
 */
export function queryVariants(query: string): string[] {
  const out: string[] = [];
  const add = (s: string): void => {
    const t = s.replace(/\s+/g, ' ').trim();
    if (t !== '' && !out.includes(t)) out.push(t);
  };
  const base = query.replace(/[_]+/g, ' ');
  const noBrackets = base.replace(BRACKETS, ' ');
  const bracketContents = [...base.matchAll(BRACKETS)].map((m) => m[0].slice(1, -1));
  const texts = [noBrackets, base.replace(/[()[\]{}【】]/g, ' ')];
  for (const c of bracketContents) if (!NOISE_WORD.test(normalizeTitle(c))) texts.push(c);
  for (const text of texts) {
    const parts = text.split(/\s[-–—|:/•·]\s|[|•·]|\s:\s|:\s|\s-\s/).map((p) => p.trim());
    const candidates = [text, ...parts];
    for (const p of parts) {
      const by = /^(.*?)\s+by\s+/i.exec(p);
      if (by) candidates.push(by[1]!);
    }
    for (const c of candidates) {
      add(c);
      add(stripTrailingNoise(c));
    }
  }
  return out.filter((v) => tokenize(v).length > 0).slice(0, 24);
}

// ---------------------------------------------------------------- aliases

/**
 * Titles under which a tune is also known, by its iReal title, in the languages a recording may carry.
 * Small on purpose: only the translations that are common on recordings.
 */
const TRANSLATIONS: readonly (readonly string[])[] = [
  ['Autumn Leaves', 'Les Feuilles Mortes'],
  ['Girl From Ipanema', 'Garota De Ipanema', 'Menina Do Ipanema'],
  ['Quiet Nights Of Quiet Stars', 'Corcovado'],
  ['One Note Samba', 'Samba De Uma Nota So'],
  ['How Insensitive', 'Insensatez'],
  ['No More Blues', 'Chega De Saudade'],
  ['Water To Drink', 'Agua De Beber'],
  ['Slightly Out Of Tune', 'Desafinado'],
  ['Dreamer', 'Vivo Sonhando'],
  ['Under Paris Skies', 'Sous Le Ciel De Paris'],
  ['I Wish You Love', 'Que Reste T Il De Nos Amours'],
  ['My Man', 'Mon Homme'],
  ['In Other Words', 'Fly Me To The Moon'],
  ['Round Midnight', 'Round About Midnight'],
  ['Saint Thomas', 'St Thomas'],
];

const TRANSLATION_BY_KEY = (() => {
  const map = new Map<string, string[]>();
  for (const group of TRANSLATIONS) {
    for (const name of group) {
      const key = keyTokens(tokenize(name)).join(' ');
      map.set(key, group.filter((g) => g !== name));
    }
  }
  return map;
})();

/** `Title (Other Title)` → `Title` and `Other Title`; brackets that are only noise (« (Alternate) », « (1927) ») give no alias. */
export function splitTitleBrackets(title: string): { main: string; aliases: string[] } {
  const aliases: string[] = [];
  for (const m of title.matchAll(BRACKETS)) {
    const inner = m[0].slice(1, -1).replace(/^\s*(?:a\.?k\.?a\.?|also\s+known\s+as|or|aka)\s*:?\s*/i, '').trim();
    const norm = normalizeTitle(inner);
    if (norm !== '' && !norm.split(' ').every((w) => NOISE_WORD.test(w))) aliases.push(inner);
  }
  const main = title.replace(BRACKETS, ' ').replace(/\s+/g, ' ').trim();
  return { main: main === '' ? title : main, aliases };
}

// ---------------------------------------------------------------- scoring

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/** 1 for the same word, 0.9 for a word one letter off (5+ letters), 0.85 two letters off (9+ letters), else 0. */
function wordSim(a: string, b: string): number {
  if (a === b) return 1;
  const len = Math.max(a.length, b.length);
  if (len < 5) return 0;
  const d = editDistance(a, b, 2);
  if (d === 1) return 0.9;
  if (d === 2 && len >= 9) return 0.85;
  return 0;
}

/** Longest common run of words in order, weighted by `wordSim`; the result in [0, 1] as 2·common / (|a| + |b|). */
function sequenceSim(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const row = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j]!;
      const w = wordSim(a[i - 1]!, b[j - 1]!);
      row[j] = Math.max(up, row[j - 1]!, w > 0 ? diag + w : 0);
      diag = up;
    }
  }
  return (2 * row[b.length]!) / (a.length + b.length);
}

function containsRun(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

interface Scored {
  score: number;
  kind: TitleMatchKind;
}

/** Score of a query variant against one title (both as word lists). */
function scoreWords(q: readonly string[], t: readonly string[]): Scored | null {
  const qk = keyTokens(q);
  const tk = keyTokens(t);
  if (qk.length === 0 || tk.length === 0) return null;
  if (qk.length === tk.length && qk.every((w, i) => w === tk[i])) return { score: 1, kind: 'exact' };
  const qs = nonStop(qk);
  const ts = nonStop(tk);
  const useStop = qs.length >= 2 && ts.length >= 2;
  const a = useStop ? qs : qk;
  const b = useStop ? ts : tk;
  let best: Scored | null = null;
  if (a.length === b.length && a.every((w, i) => w === b[i])) best = { score: 0.96, kind: 'close' };
  else {
    const sim = sequenceSim(a, b);
    if (sim >= 0.5) best = { score: Math.min(0.97, sim), kind: 'close' };
  }
  // the whole title inside a longer text: not for a title of one real word
  if (ts.length >= 2 || (tk.length >= 3 && ts.length >= 1 && ts[0]!.length >= 4)) {
    if (ts.length >= 2 && containsRun(qs, ts)) {
      const extra = qs.length - ts.length;
      const score = extra <= 2 ? 0.9 : extra <= 4 ? 0.86 : 0;
      if (score > 0 && (best === null || score > best.score)) best = { score, kind: 'contained' };
    }
  }
  return best;
}

// ---------------------------------------------------------------- the index

interface Name {
  words: string[];
  alias: string | null;
}

interface Indexed<T> {
  entry: TitleEntry<T>;
  names: Name[];
  titleKey: string;
  /** Last names of the composer (words of 4+ letters), for the tie-break. */
  composerWords: string[];
}

export interface TitleIndex<T = unknown> {
  readonly size: number;
  readonly items: readonly Indexed<T>[];
  readonly byWord: ReadonlyMap<string, readonly number[]>;
  readonly byPrefix: ReadonlyMap<string, readonly number[]>;
}

const prefixOf = (w: string): string | null => (w.length >= 4 ? w.slice(0, 3) : null);

/** Builds the index once for a list of titles (a few thousand: a few milliseconds). */
export function buildTitleIndex<T>(entries: readonly TitleEntry<T>[]): TitleIndex<T> {
  const items: Indexed<T>[] = [];
  const byWord = new Map<string, number[]>();
  const byPrefix = new Map<string, number[]>();
  const push = (map: Map<string, number[]>, key: string, i: number): void => {
    const list = map.get(key);
    if (!list) map.set(key, [i]);
    else if (list[list.length - 1] !== i) list.push(i);
  };
  for (const entry of entries) {
    const { main, aliases } = splitTitleBrackets(entry.title);
    const mainWords = tokenize(main);
    if (mainWords.length === 0) continue;
    const names: Name[] = [{ words: mainWords, alias: null }];
    const titleKey = keyTokens(mainWords).join(' ');
    const extra = [...aliases, ...(entry.aliases ?? []), ...(TRANSLATION_BY_KEY.get(titleKey) ?? [])];
    const seen = new Set<string>([titleKey]);
    for (const a of extra) {
      const { main: aMain } = splitTitleBrackets(a);
      const words = tokenize(aMain);
      const key = keyTokens(words).join(' ');
      if (words.length === 0 || seen.has(key)) continue;
      seen.add(key);
      names.push({ words, alias: a });
    }
    const i = items.length;
    const composerWords = tokenize(entry.composer ?? '').filter((w) => w.length >= 4);
    items.push({ entry, names, titleKey, composerWords });
    for (const n of names) {
      const real = nonStop(keyTokens(n.words));
      for (const w of real.length > 0 ? real : n.words) {
        push(byWord, w, i);
        const p = prefixOf(w);
        if (p) push(byPrefix, p, i);
      }
    }
  }
  return { size: items.length, items, byWord, byPrefix };
}

/**
 * Titles of the index that match `query`, best first, none below the threshold. Equal scores keep the
 * entries named by the query's composer first, then the order of the index.
 */
export function findTitle<T>(index: TitleIndex<T>, query: string, options: FindOptions = {}): TitleMatch<T>[] {
  const threshold = options.threshold ?? DEFAULT_MATCH_THRESHOLD;
  const max = options.max ?? 5;
  const variants = queryVariants(query);
  if (variants.length === 0 || index.size === 0) return [];
  const queryWords = new Set(tokenize(query));
  const best = new Map<number, TitleMatch<T> & { order: number }>();
  for (const variant of variants) {
    const q = tokenize(variant);
    const qReal = nonStop(keyTokens(q));
    const candidates = new Set<number>();
    for (const w of qReal.length > 0 ? qReal : q) {
      for (const i of index.byWord.get(w) ?? []) candidates.add(i);
      const p = prefixOf(w);
      if (p) for (const i of index.byPrefix.get(p) ?? []) candidates.add(i);
    }
    for (const i of candidates) {
      const item = index.items[i]!;
      for (const name of item.names) {
        const s = scoreWords(q, name.words);
        if (!s) continue;
        let score = name.alias === null ? s.score : s.score * 0.98;
        if (item.composerWords.some((w) => queryWords.has(w))) score = Math.min(1, score + 0.02);
        const known = best.get(i);
        if (!known || score > known.score) {
          best.set(i, { entry: item.entry, score, kind: s.kind, titleKey: item.titleKey, viaAlias: name.alias, matched: variant, order: i });
        }
      }
    }
  }
  return [...best.values()]
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, max)
    .map(({ order: _order, ...m }) => m);
}
