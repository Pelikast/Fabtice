// The audio journal: a short, dated list of what the app did with the audio
// output (context created, put to sleep, closed, reopened; sleeps and wakes of
// the machine, output changes, recoveries), to understand a problem with the
// sound after the fact. The owner copies it from Aide → Diagnostic… (Mac app,
// where the main process keeps it across restarts, see
// `desktop/src/audio-journal.js`) or from the advanced settings (web app,
// where it is kept in this browser's local storage).
//
// No personal data: events, numbers and the browser's name only. Device
// LABELS are never read (they can carry a person's name, « AirPods de … »),
// only how many outputs the page can see.

import { t, type MessageKey } from '../i18n';
import { getDesktopBridge } from '../platform/desktopBridge';

/** At most this many events are kept; the oldest go first. */
export const JOURNAL_SIZE = 200;
const STORAGE_KEY = 'fabtice.journalAudio';

export type AudioJournalEvent =
  | 'page-start'
  | 'context-created'
  | 'context-closed'
  | 'context-state'
  | 'suspend-failed'
  | 'start-failed'
  | 'release'
  | 'reopen'
  | 'stall'
  | 'recovery'
  | 'error'
  | 'hidden'
  | 'visible'
  | 'pagehide'
  | 'pageshow'
  | 'device-change'
  | 'play'
  | 'system';

export interface AudioJournalEntry {
  /** ISO 8601 time. */
  at: string;
  /** Who wrote it: the interface, the Mac app's main process (« système ») or the diagnostic window. */
  source: 'page' | 'system' | 'diagnostic';
  event: string;
  /** One line, in French, ready to read. */
  text: string;
}

/** Why the engine gave the output back (journal and tests). */
export type ReleaseReason = 'idle' | 'hidden' | 'pagehide' | 'sleep' | 'wake' | 'device' | 'lock' | 'system' | 'failure' | 'dispose';

/** Fields of an event, put in its sentence (`audioJournal.<event>` in the messages). */
export type JournalFields = Record<string, string | number>;

const entries: AudioJournalEntry[] = [];
let lastPlay: { at: string; text: string } | null = null;
let restored = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

/** The sentence of a release reason (« inactivité », « mise en veille »…). */
export function reasonText(reason: ReleaseReason | string): string {
  const key = `audioJournal.reason.${reason}` as MessageKey;
  const text = t(key);
  return text === undefined ? String(reason) : text;
}

/** A piece of a journal sentence, from the messages. */
export function journalPhrase(key: MessageKey, params?: Record<string, string | number>): string {
  return t(key, params) ?? key;
}

function sentence(event: AudioJournalEvent, fields?: JournalFields): string {
  const text = t(`audioJournal.${event}` as MessageKey, fields);
  return (text ?? event).replace(/\s+/g, ' ').slice(0, 300);
}

/** Local storage, web app only (the Mac app's main process keeps the journal). Never throws. */
function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined' || getDesktopBridge()) return null;
    return localStorage;
  } catch {
    return null;
  }
}

function restore(): void {
  if (restored) return;
  restored = true;
  const st = storage();
  if (!st) return;
  try {
    const kept = JSON.parse(st.getItem(STORAGE_KEY) ?? 'null') as { entries?: unknown; lastPlay?: unknown } | null;
    if (kept && Array.isArray(kept.entries)) {
      for (const e of kept.entries.slice(-JOURNAL_SIZE)) {
        if (e && typeof e.at === 'string' && typeof e.text === 'string' && typeof e.event === 'string') {
          entries.push({ at: e.at, source: e.source === 'diagnostic' || e.source === 'system' ? e.source : 'page', event: e.event, text: e.text.slice(0, 300) });
        }
      }
    }
    const lp = kept?.lastPlay as { at?: unknown; text?: unknown } | undefined;
    if (lp && typeof lp.at === 'string' && typeof lp.text === 'string') lastPlay = { at: lp.at, text: lp.text };
  } catch {
    // an unreadable journal starts again empty
  }
}

function scheduleSave(): void {
  const st = storage();
  if (!st || saveTimer !== null) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      st.setItem(STORAGE_KEY, JSON.stringify({ entries, lastPlay }));
    } catch {
      // full or refused: the journal stays in memory
    }
  }, 1000);
}

function forward(entry: AudioJournalEntry, sticky: boolean): void {
  const bridge = getDesktopBridge();
  if (!bridge?.audioJournalAdd) return;
  try {
    void bridge.audioJournalAdd({ event: entry.event, text: entry.text, sticky }).catch(() => {});
  } catch {
    // an older Mac app, or the main process is going away: the page keeps its copy
  }
}

/** Adds an event to the journal (and hands it to the Mac app, which keeps it across restarts). */
export function recordAudio(event: AudioJournalEvent, fields?: JournalFields): AudioJournalEntry {
  restore();
  const entry: AudioJournalEntry = { at: nowIso(), source: 'page', event, text: sentence(event, fields) };
  entries.push(entry);
  if (entries.length > JOURNAL_SIZE) entries.splice(0, entries.length - JOURNAL_SIZE);
  forward(entry, false);
  scheduleSave();
  return entry;
}

/**
 * Remembers the last playback that really started (« dernière lecture réussie »): kept apart from the
 * list, so that a practice session of a hundred starts does not push the rare events out of it.
 */
export function recordPlay(ms: number, reopened: boolean): void {
  restore();
  lastPlay = { at: nowIso(), text: sentence('play', { ms: Math.round(ms), how: reopened ? t('audioJournal.play.reopened') : '' }) };
  forward({ at: lastPlay.at, source: 'page', event: 'play', text: lastPlay.text }, true);
  scheduleSave();
}

/** The events kept, oldest first (a copy). */
export function journalEntries(): AudioJournalEntry[] {
  restore();
  return entries.slice();
}

export function lastPlayEntry(): { at: string; text: string } | null {
  restore();
  return lastPlay;
}

/** « 2026-11-15 14:03:12.345 » in local time: what the owner sees on his clock. */
export function journalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/** The journal as text, to paste into a conversation. */
export function journalText(): string {
  restore();
  const lines = [t('audioJournal.title'), `${t('audioJournal.copied')} ${journalTime(nowIso())}`];
  lines.push(lastPlay ? `${t('audioJournal.lastPlay')} ${journalTime(lastPlay.at)} — ${lastPlay.text}` : `${t('audioJournal.lastPlay')} ${t('audioJournal.none')}`);
  lines.push(t('audioJournal.count', { n: entries.length }));
  for (const e of entries) lines.push(`${journalTime(e.at)}  ${e.text}`);
  return lines.join('\n');
}

/** Tests: forget everything (memory and storage). */
export function resetJournalForTests(): void {
  entries.length = 0;
  lastPlay = null;
  restored = false;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = null;
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // nothing kept
  }
}
