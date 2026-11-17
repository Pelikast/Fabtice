import { beforeEach, describe, expect, it } from 'vitest';
import type { UpdateState } from '../platform/desktopBridge';
import { appStore } from '../store/store';
import { noteBlocks } from './notes';
import { blockText, errorText, offersManual } from './texts';
import { closeUpdateMessage, initUpdates, showPending, updateHandle, updateMessageOpen, updateStore } from './updates';
import { viewOf } from '../components/UpdateMessage';

const base: UpdateState = { current: '1.0.0', phase: 'idle', origin: null, seq: 0, available: null, blocked: null, progress: null, error: null, room: null };
const available = (patch: Partial<UpdateState> = {}): UpdateState => ({
  ...base,
  phase: 'available',
  origin: 'launch',
  seq: 1,
  available: { version: '1.0.1', notes: '- Une chose.', publishedAt: '2026-12-01T10:00:00Z', size: 120_000_000 },
  ...patch,
});

let inTheWay = false;
const listeners = new Set<() => void>();

beforeEach(() => {
  updateStore.setState({ mode: 'desktop', desktop: null, message: null, pending: null, later: null, confirm: null, web: { phase: 'idle', error: null } });
  inTheWay = false;
  initUpdates({ launch: false, windowInTheWay: () => inTheWay, subscribeWindows: (l) => (listeners.add(l), () => listeners.delete(l)) });
  updateStore.setState({ mode: 'desktop' });
  appStore.setState((s) => ({ ui: { ...s.ui, settings: { ...s.ui.settings, open: false } } }));
});

describe('the message of the update', () => {
  it('comes at opening for a newer version only', () => {
    updateHandle.onDesktopState({ ...base, phase: 'checking', origin: 'launch' });
    expect(updateMessageOpen()).toBe(false);
    updateHandle.onDesktopState({ ...base, phase: 'up-to-date', origin: 'launch', seq: 1 });
    expect(updateMessageOpen()).toBe(false);
    updateHandle.onDesktopState({ ...base, phase: 'failed', origin: 'launch', seq: 2, error: { code: 'network', during: 'check' } });
    expect(updateMessageOpen()).toBe(false);
    updateHandle.onDesktopState(available({ seq: 3 }));
    expect(updateStore.getState().message).toEqual({ origin: 'launch' });
  });

  it('waits for the other windows, then comes', () => {
    inTheWay = true;
    updateHandle.onDesktopState(available());
    expect(updateMessageOpen()).toBe(false);
    expect(updateStore.getState().pending).toEqual({ origin: 'launch' });
    inTheWay = false;
    for (const l of listeners) l();
    expect(updateMessageOpen()).toBe(true);
  });

  it('« Plus tard » leaves this version until the next opening', () => {
    updateHandle.onDesktopState(available());
    closeUpdateMessage();
    expect(updateStore.getState().later).toBe('1.0.1');
    updateHandle.onDesktopState(available({ seq: 2 }));
    expect(updateMessageOpen()).toBe(false);
    // A newer one still comes.
    updateHandle.onDesktopState(available({ seq: 3, available: { version: '1.0.2', notes: '', publishedAt: '2026-12-02T10:00:00Z', size: 1 } }));
    expect(updateMessageOpen()).toBe(true);
  });

  it('the menu bar shows every answer; with Réglages open, on « Général »', () => {
    updateHandle.onDesktopState({ ...base, phase: 'up-to-date', origin: 'menu', seq: 1 });
    expect(updateStore.getState().message).toEqual({ origin: 'menu' });
    closeUpdateMessage();
    appStore.setState((s) => ({ ui: { ...s.ui, settings: { open: true, tab: 'display', direct: false } } }));
    updateHandle.onDesktopState({ ...base, phase: 'failed', origin: 'menu', seq: 2, error: { code: 'network', during: 'check' } });
    expect(updateMessageOpen()).toBe(false);
    expect(appStore.getState().ui.settings.tab).toBe('general');
  });

  it('the same answer twice does not bring it back', () => {
    updateHandle.onDesktopState(available());
    closeUpdateMessage();
    updateStore.setState({ later: null });
    updateHandle.onDesktopState(available({ progress: { fraction: 0.5, received: 1, total: 2 } }));
    expect(updateMessageOpen()).toBe(false);
    showPending();
    expect(updateMessageOpen()).toBe(false);
  });

  it('too old a macOS: nothing at opening', () => {
    updateHandle.onDesktopState(available({ blocked: { code: 'system', minimum: '13.0' } }));
    expect(updateMessageOpen()).toBe(false);
  });

  it('what the window shows follows the phase', () => {
    expect(viewOf('desktop', available(), 'idle')).toBe('available');
    expect(viewOf('desktop', { ...base, phase: 'downloading' }, 'idle')).toBe('progress');
    expect(viewOf('desktop', { ...base, phase: 'preparing' }, 'idle')).toBe('progress');
    expect(viewOf('desktop', { ...base, phase: 'failed' }, 'idle')).toBe('check-failed');
    expect(viewOf('desktop', { ...base, phase: 'checking' }, 'idle')).toBe('checking');
    expect(viewOf('web', null, 'ready')).toBe('web-ready');
    expect(viewOf('web', null, 'reloading')).toBe('web-reloading');
  });
});

describe('the sentences', () => {
  it('each failure and each place has its sentence', () => {
    const s = available();
    expect(errorText('damaged', s)).toBe('Le fichier téléchargé est incomplet ou abîmé. Rien n’a été changé.');
    expect(errorText('install', s)).toContain('Fabtice 1.0.0 reste en place');
    expect(errorText('disk-space', { ...s, room: { needed: 360_000_000, free: 1 } })).toContain('360 Mo');
    expect(errorText('network', s)).toContain('Pas de connexion à Internet');
    expect(blockText('translocated', s)).toContain('déplacez'.replace('d', 'D'));
    expect(blockText('read-only', s)).toContain('image disque');
    expect(blockText('system', { ...s, blocked: { code: 'system', minimum: '13.0' } })).toBe('La version 1.0.1 demande macOS 13.0 ou plus récent. Fabtice 1.0.0 reste en place.');
    expect(offersManual({ ...s, blocked: { code: 'translocated' } })).toBe(true);
    expect(offersManual({ ...s, error: { code: 'damaged', during: 'update' } })).toBe(true);
    expect(offersManual({ ...s, error: { code: 'refused', during: 'update' } })).toBe(false);
    expect(offersManual({ ...s, blocked: { code: 'system' } })).toBe(false);
  });

  it('the notes: titles, lists, paragraphs', () => {
    expect(noteBlocks('### Mieux\n- Une chose,\n  sur deux lignes.\n- Une autre.\n\nUn paragraphe\nqui continue.')).toEqual([
      { kind: 'title', text: 'Mieux' },
      { kind: 'list', items: ['Une chose, sur deux lignes.', 'Une autre.'] },
      { kind: 'para', text: 'Un paragraphe qui continue.' },
    ]);
    expect(noteBlocks('')).toEqual([]);
  });
});
