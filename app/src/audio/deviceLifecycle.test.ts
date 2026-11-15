import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n';
import { browserName, watchAudioDevice } from './deviceLifecycle';
import { JOURNAL_SIZE, journalEntries, journalText, recordAudio, recordPlay, resetJournalForTests } from './journal';
import type { EngineState } from './AudioEngine';
import type { PowerEvent } from '../platform/desktopBridge';

class FakeTarget {
  listeners = new Map<string, Set<(e: Event) => void>>();
  addEventListener(type: string, fn: (e: Event) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: (e: Event) => void) {
    this.listeners.get(type)?.delete(fn);
  }
  fire(type: string, extra: Record<string, unknown> = {}) {
    for (const fn of this.listeners.get(type) ?? []) fn({ type, ...extra } as unknown as Event);
  }
  count() {
    let n = 0;
    for (const s of this.listeners.values()) n += s.size;
    return n;
  }
}

function setup(state: EngineState = 'ready') {
  const engine = { state, releases: [] as string[], getState: () => engine.state, releaseDevice: (r: string) => void engine.releases.push(r) };
  const doc = Object.assign(new FakeTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  const win = new FakeTarget();
  const devices = Object.assign(new FakeTarget(), {
    enumerateDevices: async () => [{ kind: 'audiooutput', label: 'AirPods de Quelqu’un' }, { kind: 'audiooutput', label: '' }, { kind: 'audioinput', label: '' }],
  });
  let power: ((e: PowerEvent) => void) | null = null;
  const stop = watchAudioDevice({
    engine,
    doc,
    win,
    devices,
    onPower: (cb) => {
      power = cb;
      return () => {
        power = null;
      };
    },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) fabtice/0.1.0 Chrome/150.0.7400.0 Electron/43.8.9 Safari/537.36',
    deviceDebounceMs: 20,
  });
  return { engine, doc, win, devices, stop, power: (e: PowerEvent) => power?.(e), hasPower: () => power !== null };
}

describe('the audio output life cycle (deviceLifecycle)', () => {
  beforeEach(() => {
    setLanguage('fr');
    resetJournalForTests();
  });
  afterEach(() => vi.useRealTimers());

  it('names the browser with names and versions only', () => {
    expect(browserName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7400.0 Electron/43.8.9 Safari/537.36')).toBe(
      'Chrome/150.0.7400.0 Electron/43.8.9 Safari/537.36 (Macintosh)',
    );
    expect(browserName('')).toBe('navigateur inconnu');
  });

  it('releases on sleep and on wake, playing or not; on a locked screen only when idle', () => {
    const s = setup('playing');
    s.power({ kind: 'suspend' });
    s.power({ kind: 'resume' });
    s.power({ kind: 'lock-screen' });
    expect(s.engine.releases).toEqual(['sleep', 'wake']);
    s.engine.state = 'ready';
    s.power({ kind: 'lock-screen' });
    s.power({ kind: 'unlock-screen' });
    expect(s.engine.releases).toEqual(['sleep', 'wake', 'lock']);
    s.stop();
  });

  it('a hidden page lets the output go only when nothing plays; leaving the page always does', () => {
    const s = setup('playing');
    s.doc.visibilityState = 'hidden';
    s.doc.fire('visibilitychange');
    expect(s.engine.releases).toEqual([]);
    s.engine.state = 'ready';
    s.doc.fire('visibilitychange');
    expect(s.engine.releases).toEqual(['hidden']);
    s.engine.state = 'playing';
    s.win.fire('pagehide');
    expect(s.engine.releases).toEqual(['hidden', 'pagehide']);
    const events = journalEntries().map((e) => e.event);
    expect(events).toEqual(['page-start', 'hidden', 'hidden', 'pagehide']);
    s.stop();
  });

  it('a burst of device changes gives one release, and the journal counts the outputs without their names', async () => {
    const s = setup('playing');
    s.devices.fire('devicechange');
    s.devices.fire('devicechange');
    s.devices.fire('devicechange');
    await new Promise((r) => setTimeout(r, 80));
    expect(s.engine.releases).toEqual(['device']);
    const change = journalEntries().find((e) => e.event === 'device-change')!;
    expect(change.text).toContain('2 sortie');
    expect(journalText()).not.toContain('AirPods');
    s.stop();
  });

  it('stops listening everywhere', () => {
    const s = setup();
    expect(s.doc.count() + s.win.count() + s.devices.count()).toBe(4);
    expect(s.hasPower()).toBe(true);
    s.stop();
    expect(s.doc.count() + s.win.count() + s.devices.count()).toBe(0);
    expect(s.hasPower()).toBe(false);
  });
});

describe('the audio journal', () => {
  beforeEach(() => {
    setLanguage('fr');
    resetJournalForTests();
  });

  it('keeps the last 200 events, oldest first, and the last playback apart', () => {
    for (let i = 0; i < JOURNAL_SIZE + 30; i++) recordAudio('reopen', { ms: i });
    recordPlay(123.4, true);
    const list = journalEntries();
    expect(list.length).toBe(JOURNAL_SIZE);
    expect(list[0]!.text).toBe('Sortie audio rouverte en 30 ms');
    const text = journalText();
    expect(text).toMatch(/Dernière lecture réussie : \d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} — lecture démarrée en 123 ms, sortie audio rouverte/);
    expect(text.split('\n').length).toBe(4 + JOURNAL_SIZE);
  });

  it('writes French sentences with their numbers', () => {
    recordAudio('context-created', { rate: 48000, base: '10.7', state: 'running' });
    recordAudio('release', { reason: 'mise en veille', playing: '' });
    const [a, b] = journalEntries();
    expect(a!.text).toBe('Sortie audio ouverte : contexte à 48000 Hz, latence de base 10.7 ms, état running');
    expect(b!.text).toBe('Sortie audio rendue au système (mise en veille)');
    expect(a!.source).toBe('page');
  });
});
