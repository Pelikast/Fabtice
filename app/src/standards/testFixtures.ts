// Tiny playlists written for the tests (and nothing else): invented tunes with a few bars, in the
// shapes the real pages come in. No real playlist is ever kept in this repository.

import { obfuscate } from '../export/ireal';

export interface FixtureSong {
  title: string;
  composer?: string;
  style?: string;
  key?: string;
  chart?: string;
  bpm?: number;
}

const field = (s: string): string => s.replace(/=/g, '-');

const CHARTS = [
  '[*AT44C^7   |D-7 G7 |E-7 A7 |D-7 G7 Z',
  '[*AT44F7   |Bb7   |F7   |F7   Z',
  '[*AT44D-7   |G7   |C^7   |A7   Z',
];

/** One song as iReal writes it: ten fields, the chart string scrambled. */
export function songText(s: FixtureSong, i = 0): string {
  return [field(s.title), field(s.composer ?? 'Nobody Anna'), '', s.style ?? 'Medium Swing', s.key ?? 'C', '', obfuscate(s.chart ?? CHARTS[i % CHARTS.length]!), 'Jazz-Medium Swing', String(s.bpm ?? 120), '0'].join('=');
}

/** An `irealb://` link of `songs`, optionally a named playlist. */
export function link(songs: FixtureSong[], name?: string): string {
  return `irealb://${encodeURIComponent(songs.map(songText).join('===') + (name ? `===${name}` : ''))}`;
}

/** `count` invented tunes: « Fixture Tune 1 »…, each with a few bars. */
export function tunes(count: number, prefix = 'Fixture Tune'): FixtureSong[] {
  return Array.from({ length: count }, (_, i) => ({ title: `${prefix} ${i + 1}` }));
}

/** An official-style page: a link per playlist. */
export function officialPage(playlists: { name: string; songs: FixtureSong[] }[]): string {
  return `<html><body>${playlists.map((p) => `<p><a href="${link(p.songs, p.name)}">${p.name}</a></p>`).join('\n')}</body></html>`;
}

/** A forum thread that only points to attached files. */
export function forumPage(attachments: string[]): string {
  return `<html><body><h1>Thread</h1>${attachments.map((a) => `<a href="${a}">file</a>`).join(' ')}<a href="/members/someone.1/">someone</a></body></html>`;
}

/** The file iReal Pro writes: a page with one link. */
export function playlistFile(songs: FixtureSong[], name: string): string {
  return `<html><body><a href="${link(songs, name)}">${name}</a></body></html>`;
}

/** What a forum answers to a visitor who is not logged in. */
export const LOGIN_PAGE = '<html><body><h1>Log in</h1><form action="/login/login" method="post"><input name="login"><input type="password" name="password"></form></body></html>';
