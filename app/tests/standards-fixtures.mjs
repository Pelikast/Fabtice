// Tiny invented playlists for the browser and Mac app checks of the standards offer, in the shapes the
// real pages come in. Written here from the format (`src/export/IREAL-FORMAT.md`): no real playlist is
// ever kept in this repository, and nothing here imports the app's own code.

const hussle = (text) => {
  let rest = text;
  let out = '';
  while (rest.length > 50) {
    const piece = rest.slice(0, 50);
    rest = rest.slice(50);
    if (rest.length < 2) {
      out += piece;
      continue;
    }
    const c = piece.split('');
    const o = c.slice();
    for (let i = 0; i < 5; i++) {
      o[49 - i] = c[i];
      o[i] = c[49 - i];
    }
    for (let i = 10; i < 24; i++) {
      o[49 - i] = c[i];
      o[i] = c[49 - i];
    }
    out += o.join('');
  }
  return out + rest;
};
const obfuscate = (plain) => `1r34LbKcu7${hussle(plain.replace(/ {3}/g, 'XyQ').replace(/ \|/g, 'LZ').replace(/\| x/g, 'Kcl'))}`;
const field = (s) => s.replace(/=/g, '-');
const CHARTS = ['[*AT44C^7   |D-7 G7 |E-7 A7 |D-7 G7 Z', '[*AT44F7   |Bb7   |F7   |F7   Z', '[*AT44D-7   |G7   |C^7   |A7   Z'];

export const songText = (s, i = 0) =>
  [field(s.title), field(s.composer ?? 'Nobody Anna'), '', 'Medium Swing', s.key ?? 'C', '', obfuscate(s.chart ?? CHARTS[i % CHARTS.length]), 'Jazz-Medium Swing', '120', '0'].join('=');

/** An `irealb://` link of `songs`, optionally a named playlist. */
export const link = (songs, name) => `irealb://${encodeURIComponent(songs.map(songText).join('===') + (name ? `===${name}` : ''))}`;

/** `count` invented tunes: « Fixture Tune 1 »… */
export const tunes = (count, prefix = 'Fixture Tune') => Array.from({ length: count }, (_, i) => ({ title: `${prefix} ${i + 1}` }));

/** The page iReal Pro's official site would hold: one link per playlist. */
export const officialPage = (playlists) => `<html><body>${playlists.map((p) => `<p><a href="${link(p.songs, p.name)}">${p.name}</a></p>`).join('\n')}</body></html>`;

/** A forum thread that only points to attached files. */
export const forumPage = (attachments) => `<html><body><h1>Thread</h1>${attachments.map((a) => `<a href="${a}">file</a>`).join(' ')}</body></html>`;

/** The file iReal Pro writes: a page with one link. */
export const playlistFile = (songs, name) => `<html><body><a href="${link(songs, name)}">${name}</a></body></html>`;

/** What a forum answers to a visitor who is not logged in. */
export const LOGIN_PAGE = '<html><body><h1>Log in</h1><form action="/login/login" method="post"><input name="login"><input type="password" name="password"></form></body></html>';

/**
 * A fake internet for the checks: `/<host><path>` → what that page answers. Pages of the bundled list are
 * kept at their real addresses; only the sizes are small (`shrinkList`), so that tiny playlists pass `minTunes`.
 */
export function shrinkList(list, tunesPerCollection = 20, minTunes = 15) {
  return {
    ...list,
    collections: list.collections.map((c) => ({ ...c, tunes: c.tunes === null ? null : tunesPerCollection, minTunes })),
  };
}
