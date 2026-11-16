// The command table (C6): which commands can run, what the menus show, and the
// shortcuts that reach them (cmd on a Mac, Ctrl elsewhere).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoSwingResult } from '../analysis/fromDemoSwing';
import { setLanguage } from '../i18n';
import { applyAnalysis } from '../store/analysisActions';
import { leaveDialog } from '../project/leave';
import { fromProjectDocument } from '../store/document';
import { startHistory, stopHistory } from '../store/history';
import { appStore, initialState } from '../store/store';
import { sampleDocument } from '../test/sampleDocument';
import { installCommandKeys, lastKeyCommand, shortcutCommandFor } from './commandKeys';
import {
  COMMAND_IDS,
  COMMANDS,
  FABTICE_MENU,
  commandContext,
  commandStates,
  nodeEnabled,
  offeredNodes,
  pathOf,
  runCommand,
  shortcutAccelerator,
  shortcutText,
  type CommandContext,
  type MenuNode,
} from './commands';
import { runMenuBarCommand, SAME_KEY_MS } from './menuBar';

setLanguage('fr');

const NO_HISTORY = { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null, modified: false };
const ctx = (over: Partial<CommandContext> = {}): CommandContext => ({
  hasProject: true,
  demo: false,
  hasTracks: true,
  hasChords: true,
  busy: false,
  opening: false,
  blocked: false,
  textField: false,
  history: NO_HISTORY,
  desktop: false,
  canOpenIReal: false,
  hasRecent: false,
  canQuit: false,
  ...over,
});
const enabledIds = (c: CommandContext) => COMMAND_IDS.filter((id) => COMMANDS[id].enabled(c) && (!COMMANDS[id].offered || COMMANDS[id].offered!(c)));
/** The menu as a list of labels (commands by id, submenus by id with their children). */
const outline = (nodes: readonly MenuNode[], c: CommandContext): string[] =>
  offeredNodes(nodes, c).map((n) => (n.kind === 'separator' ? '-' : n.kind === 'command' ? n.id : n.kind === 'recent' ? 'recent…' : `${n.id}[${outline(n.children, c).join(',')}]`));

describe('which commands can run', () => {
  it('no project: only new, open and the settings', () => {
    expect(enabledIds(ctx({ hasProject: false, hasTracks: false, hasChords: false }))).toEqual(['newFromLink', 'newFromFile', 'open', 'settings']);
  });

  it('a piece without chords: save, export the sound; iReal Pro, PDF and printing greyed out', () => {
    expect(enabledIds(ctx({ hasChords: false }))).toEqual(['newFromLink', 'newFromFile', 'open', 'save', 'saveAs', 'exportAudio', 'settings']);
  });

  it('a piece with chords: everything; undo and redo when the history has a step', () => {
    const c = ctx({ history: { canUndo: true, canRedo: false, undoLabel: 'Annuler : volume de la piste', redoLabel: null, modified: true } });
    expect(enabledIds(c)).toEqual(['undo', 'newFromLink', 'newFromFile', 'open', 'save', 'saveAs', 'exportAudio', 'irealFile', 'pdf', 'print', 'settings']);
    expect(COMMANDS.undo.label(c)).toBe('Annuler : volume de la piste');
    expect(COMMANDS.redo.label(c)).toBe('Rétablir');
  });

  it('the demonstration piece is never saved', () => {
    expect(enabledIds(ctx({ demo: true }))).not.toContain('save');
    expect(enabledIds(ctx({ demo: true }))).not.toContain('saveAs');
  });

  it('a window in the way: nothing but quitting; the opening screen lets one start another project', () => {
    expect(enabledIds(ctx({ blocked: true, history: { ...NO_HISTORY, canUndo: true } }))).toEqual([]);
    expect(enabledIds(ctx({ opening: true, history: { ...NO_HISTORY, canUndo: true } }))).toEqual(['newFromLink', 'newFromFile', 'open', 'settings']);
    expect(enabledIds(ctx({ busy: true }))).toEqual([]);
  });

  it('in a text field « Annuler » and « Rétablir » undo the typing, with their plain labels', () => {
    const c = ctx({ textField: true, history: { canUndo: true, canRedo: false, undoLabel: 'Annuler : boucle', redoLabel: null, modified: true } });
    expect(COMMANDS.undo.enabled(c) && COMMANDS.redo.enabled(c)).toBe(true);
    expect(COMMANDS.undo.label(c)).toBe('Annuler');
  });

  it('the Mac app adds « Ouvrir dans iReal Pro », « Projets récents » and « Quitter »', () => {
    const web = ctx();
    const mac = ctx({ desktop: true, canOpenIReal: true, hasRecent: true, canQuit: true });
    expect(outline(FABTICE_MENU, web)).toEqual([
      'undo',
      'redo',
      '-',
      'new[newFromLink,newFromFile]',
      'open',
      '-',
      'save',
      'saveAs',
      'export[exportAudio,ireal[irealFile],pdf]',
      'print',
      '-',
      'settings',
    ]);
    expect(outline(FABTICE_MENU, mac)).toEqual([
      'undo',
      'redo',
      '-',
      'new[newFromLink,newFromFile]',
      'open',
      'recent[recent…]',
      '-',
      'save',
      'saveAs',
      'export[exportAudio,ireal[irealFile,irealOpen],pdf]',
      'print',
      '-',
      'settings',
      'quit',
    ]);
  });

  it('a submenu opens when one of its entries can run', () => {
    const exp = FABTICE_MENU.find((n) => n.kind === 'submenu' && n.id === 'export')!;
    expect(nodeEnabled(exp, ctx({ hasChords: false }))).toBe(true);
    expect(nodeEnabled(exp, ctx({ hasProject: false, hasTracks: false, hasChords: false }))).toBe(false);
    const ireal = (exp as Extract<MenuNode, { kind: 'submenu' }>).children.find((n) => n.kind === 'submenu')!;
    expect(nodeEnabled(ireal, ctx({ hasChords: false }))).toBe(false);
    expect(pathOf('irealOpen')).toEqual(['export', 'ireal']);
    expect(pathOf('save')).toEqual([]);
  });
});

describe('shortcuts as the menus show them', () => {
  it('cmd on a Mac, Ctrl elsewhere, Maj first', () => {
    expect(shortcutText(COMMANDS.undo.shortcut!, true)).toBe('cmd + Z');
    expect(shortcutText(COMMANDS.redo.shortcut!, true)).toBe('Maj + cmd + Z');
    expect(shortcutText(COMMANDS.redo.shortcut!, false)).toBe('Maj + Ctrl + Z');
    expect(shortcutText(COMMANDS.settings.shortcut!, true)).toBe('cmd + ,');
    expect(shortcutText(COMMANDS.print.shortcut!, false)).toBe('Ctrl + P');
    expect(shortcutAccelerator(COMMANDS.saveAs.shortcut!)).toBe('CommandOrControl+Shift+S');
  });
});

const key = (k: string, mods: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean; code?: string } = {}) => ({
  key: k,
  code: mods.code ?? (k === ',' ? 'Comma' : `Key${k.toUpperCase()}`),
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

describe('keys of the commands', () => {
  it('Mac: cmd + O, P, « , », S, Z; Ctrl does nothing there', () => {
    expect(shortcutCommandFor(key('o', { meta: true }), true)).toBe('open');
    expect(shortcutCommandFor(key('p', { meta: true }), true)).toBe('print');
    expect(shortcutCommandFor(key(',', { meta: true }), true)).toBe('settings');
    expect(shortcutCommandFor(key('s', { meta: true }), true)).toBe('save');
    expect(shortcutCommandFor(key('S', { meta: true, shift: true }), true)).toBe('saveAs');
    expect(shortcutCommandFor(key('z', { meta: true }), true)).toBe('undo');
    expect(shortcutCommandFor(key('o', { ctrl: true }), true)).toBeNull();
    expect(shortcutCommandFor(key('p', { meta: true, alt: true }), true)).toBeNull();
    expect(shortcutCommandFor(key('O', { meta: true, shift: true }), true)).toBeNull();
    expect(shortcutCommandFor(key('q', { meta: true }), true)).toBeNull();
  });

  it('elsewhere: Ctrl + O, P, « , »; cmd does nothing', () => {
    expect(shortcutCommandFor(key('o', { ctrl: true }), false)).toBe('open');
    expect(shortcutCommandFor(key('p', { ctrl: true }), false)).toBe('print');
    expect(shortcutCommandFor(key(',', { ctrl: true }), false)).toBe('settings');
    expect(shortcutCommandFor(key('y', { ctrl: true }), false)).toBe('redo');
    expect(shortcutCommandFor(key('o', { meta: true }), false)).toBeNull();
    expect(shortcutCommandFor(key('o'), false)).toBeNull();
  });

  it('the letter as typed; the key position only for another alphabet, never for another sign', () => {
    // AZERTY: « , » has its own key (where QWERTY has M), and the key QWERTY calls Comma types « ; ».
    expect(shortcutCommandFor(key(',', { ctrl: true, code: 'KeyM' }), false)).toBe('settings');
    expect(shortcutCommandFor(key(';', { ctrl: true, code: 'Comma' }), false)).toBeNull();
    // Cyrillic: « щ » on the O key, « з » on P, « б » on Comma.
    expect(shortcutCommandFor(key('щ', { ctrl: true, code: 'KeyO' }), false)).toBe('open');
    expect(shortcutCommandFor(key('з', { ctrl: true, code: 'KeyP' }), false)).toBe('print');
    expect(shortcutCommandFor(key('б', { ctrl: true, code: 'Comma' }), false)).toBe('settings');
    // A Latin letter elsewhere is that letter, whatever its position.
    expect(shortcutCommandFor(key('p', { ctrl: true, code: 'KeyO' }), false)).toBe('print');
  });
});

/** A keydown on a stand-in window (Node has no keyboard events). */
function press(win: EventTarget, k: ReturnType<typeof key> & { repeat?: boolean }): { prevented: boolean } {
  const e = Object.assign(new Event('keydown', { cancelable: true }), { repeat: false, ...k });
  win.dispatchEvent(e);
  return { prevented: e.defaultPrevented };
}

describe('the keyboard and the Mac menu bar run the commands through the table', () => {
  let stops: (() => void)[] = [];
  beforeEach(() => {
    appStore.setState(initialState(), true);
    appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
    stops = [startHistory(appStore)];
  });
  afterEach(() => {
    for (const s of stops) s();
    stopHistory();
    leaveDialog.setState({ open: false, saving: false });
  });

  it('a command greyed out does nothing, from the keyboard or the bar; the browser never gets the key', async () => {
    const win = new EventTarget();
    stops.push(installCommandKeys(win as Window, false));
    const states = commandStates(commandContext());
    expect(states.print.enabled).toBe(false);
    expect(press(win, key('p', { ctrl: true })).prevented).toBe(true);
    expect(appStore.getState().ui.printOpen).toBe(false);
    expect(await runCommand('exportAudio')).toBe(false);
  });

  it('cmd + P opens the print window from « Pistes » too; once only for a key held down', () => {
    appStore.setState(fromProjectDocument(sampleDocument(), appStore.getState()));
    appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
    applyAnalysis(demoSwingResult(36));
    expect(appStore.getState().view.mode).toBe('pistes');
    const win = new EventTarget();
    stops.push(installCommandKeys(win as Window, true));
    expect(commandContext().hasChords).toBe(true);
    press(win, key('p', { meta: true }));
    expect(appStore.getState().ui.printOpen).toBe(true);
    expect(lastKeyCommand()?.id).toBe('print');
    // The window is now in the way: the shortcut does nothing more (still taken from the browser).
    appStore.setState((s) => ({ ui: { ...s.ui, printOpen: false } }));
    expect(press(win, { ...key('p', { meta: true }), repeat: true }).prevented).toBe(true);
    expect(appStore.getState().ui.printOpen).toBe(false);
  });

  it('cmd + , opens the settings; the alert in the way: nothing', () => {
    const win = new EventTarget();
    stops.push(installCommandKeys(win as Window, true));
    leaveDialog.setState({ open: true, saving: false });
    press(win, key(',', { meta: true }));
    expect(appStore.getState().ui.settings.open).toBe(false);
    leaveDialog.setState({ open: false, saving: false });
    press(win, key(',', { meta: true }));
    expect(appStore.getState().ui.settings.open).toBe(true);
  });

  it('undo from the bar acts on the piece; the same key just handled by the page is not run twice', () => {
    appStore.setState(fromProjectDocument(sampleDocument(), appStore.getState()));
    appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
    const win = new EventTarget();
    stops.push(installCommandKeys(win as Window, true));
    const cents = (n: number) => appStore.setState((s) => ({ corrections: { ...s.corrections, tuningCents: n } }));
    cents(10);
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(1000);
      cents(20);
      vi.advanceTimersByTime(1000);
      press(win, key('z', { meta: true }));
      expect(appStore.getState().corrections.tuningCents).toBe(10);
      // The bar says it got the same shortcut at once: dropped.
      expect(runMenuBarCommand({ id: 'undo', accelerator: true })).toBe(false);
      expect(appStore.getState().corrections.tuningCents).toBe(10);
      // A click in the bar (not the shortcut) is run.
      expect(runMenuBarCommand({ id: 'undo', accelerator: false })).toBe(true);
      expect(appStore.getState().corrections.tuningCents).not.toBe(10);
      // Later, the shortcut from the bar is a press of its own.
      vi.advanceTimersByTime(SAME_KEY_MS + 10);
      expect(runMenuBarCommand({ id: 'redo', accelerator: true })).toBe(true);
      expect(runMenuBarCommand({ id: 'nothing' })).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
