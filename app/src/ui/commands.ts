// The app's commands (C6): one table that the menu Fabtice, the keyboard and
// the Mac menu bar all read, so that a command greyed out is greyed out
// everywhere and runs the same way from each of them.
//
// Each command has an id, a label, an optional shortcut, a rule that says
// whether it can run now (from a `CommandContext`, a plain snapshot of what
// the app shows), and an action. The menu Fabtice lays the commands out in
// `FABTICE_MENU`; the Mac menu bar (`desktop/src/menu.js`) places the same ids
// where macOS users expect them and greys them as the page reports
// (`ui/menuBar.ts`).
//
// Adding a command: one entry in `COMMANDS` (and its `CommandId`), one line in
// `FABTICE_MENU` where it goes, its label in `i18n/fr.ts` (`menu.*`), and, for
// the Mac menu bar, one line in `desktop/src/menu.js` (and its id in
// `MENU_COMMANDS` there).

import { useSyncExternalStore } from 'react';
import { chartForExport, exportToIRealPro } from '../export';
import { t, type MessageKey } from '../i18n';
import { getDesktopBridge } from '../platform/desktopBridge';
import { chooseProjectFile } from '../project/choose';
import { leaveDialog, requestNewProject } from '../project/leave';
import { saveActivity, saveProject, saveProjectAs } from '../project/saveFlow';
import { standardsMessageOpen } from '../standards/messageStep';
import { standardsStore } from '../standards/offer';
import { openSettings } from '../store/actions';
import { selectHasChords } from '../store/chartSelectors';
import { openExportAudio, openPrint } from '../store/exportActions';
import { openExportLogic } from '../export/logic/dialog';
import { historyStatus, redo, subscribeHistory, undo, type HistoryStatus } from '../store/history';
import { appStore, type AppState } from '../store/store';
import { isMacPlatform, isTextField } from './historyKeys';
import { otherWindowOpen } from './windows';

export const COMMAND_IDS = [
  'undo',
  'redo',
  'newFromLink',
  'newFromFile',
  'open',
  'save',
  'saveAs',
  'exportAudio',
  'irealFile',
  'irealOpen',
  'pdf',
  'exportLogic',
  'print',
  'settings',
  'quit',
] as const;
export type CommandId = (typeof COMMAND_IDS)[number];

/** A shortcut: cmd (Ctrl outside a Mac) + `key`, with Maj when `shift`. `key` is a lower-case letter or « , ». */
export interface Shortcut {
  key: string;
  shift?: boolean;
}

/** What the commands need to know of the app, at one moment. */
export interface CommandContext {
  hasProject: boolean;
  /** The demonstration piece (never saved). */
  demo: boolean;
  hasTracks: boolean;
  hasChords: boolean;
  /** An import (or an opening) is under way. */
  busy: boolean;
  /** The « Nouveau projet » window is open. */
  opening: boolean;
  /** Another window of the app is in the way (a dialog, the alert, the settings, a save's progress). */
  blocked: boolean;
  /** The focus is in a text field: « Annuler » there undoes the typing (Mac menu bar). */
  textField: boolean;
  history: HistoryStatus;
  /** The Mac app. */
  desktop: boolean;
  /** The Mac app can hand a chart link to iReal Pro. */
  canOpenIReal: boolean;
  /** The Mac app keeps a list of recent projects. */
  hasRecent: boolean;
  /** The Mac app can be asked to quit. */
  canQuit: boolean;
}

/** What a command answers when it could not do its work: a sentence the menu shows under its entry. */
export type CommandOutcome = { error: string } | void;

export interface Command {
  id: CommandId;
  label: (ctx: CommandContext) => string;
  shortcut?: Shortcut;
  /** Offered at all here (the platform); default yes. A command not offered is left out of every menu. */
  offered?: (ctx: CommandContext) => boolean;
  enabled: (ctx: CommandContext) => boolean;
  run: (ctx: CommandContext) => void | Promise<CommandOutcome>;
}

// ---------------------------------------------------------------- the rules

/** Free to act on the open piece: no window in the way, nothing being imported. */
const free = (c: CommandContext) => !c.blocked && !c.opening && !c.busy;
/** A new piece may be started (the opening screen itself does not stand in the way). */
const canStart = (c: CommandContext) => !c.blocked && !c.busy;
const onPiece = (c: CommandContext) => c.hasProject && free(c);
const withChords = (c: CommandContext) => onPiece(c) && c.hasChords;

/** The page of the chart for iReal Pro, as a file (`export/ireal.ts`), or null without chords. */
function irealFile(): { blob: Blob; name: string; url: string } | null {
  const chart = chartForExport(appStore.getState());
  if (!chart) return null;
  const out = exportToIRealPro(chart);
  return { blob: new Blob([out.html], { type: 'text/html;charset=utf-8' }), name: out.fileName, url: out.url };
}

/** « Fichier iReal Pro… »: the browser (or the Mac app) saves the little page that holds the chart's link. */
function downloadIRealFile(): void {
  const file = irealFile();
  if (!file) return;
  const href = URL.createObjectURL(file.blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = file.name;
  a.hidden = true;
  a.dataset.export = 'ireal';
  document.body.append(a);
  a.click();
  a.remove();
  // Not at once: the download starts after the click.
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

async function openInIReal(): Promise<CommandOutcome> {
  const bridge = getDesktopBridge();
  const file = irealFile();
  if (!bridge?.openInIRealPro || !file) return;
  try {
    const result = await bridge.openInIRealPro(file.url);
    if (!result.ok) return { error: t('export.irealOpenFailed') };
  } catch {
    return { error: t('export.irealOpenFailed') };
  }
}

/** Undo or redo: the typing in a text field (Mac menu bar), else the piece. */
function history(which: 'undo' | 'redo', ctx: CommandContext): void {
  if (ctx.textField) {
    // The browser's own undo of the typing (a menu bar entry has no other way to reach it).
    document.execCommand(which);
    return;
  }
  if (which === 'undo') undo();
  else redo();
}

export const COMMANDS: Record<CommandId, Command> = {
  undo: {
    id: 'undo',
    label: (c) => (!c.textField && c.history.undoLabel) || t('history.undo'),
    shortcut: { key: 'z' },
    enabled: (c) => c.textField || (onPiece(c) && c.history.canUndo),
    run: (c) => history('undo', c),
  },
  redo: {
    id: 'redo',
    label: (c) => (!c.textField && c.history.redoLabel) || t('history.redo'),
    shortcut: { key: 'z', shift: true },
    enabled: (c) => c.textField || (onPiece(c) && c.history.canRedo),
    run: (c) => history('redo', c),
  },
  newFromLink: {
    id: 'newFromLink',
    label: () => t('menu.newFromLink'),
    enabled: canStart,
    run: () => requestNewProject('link'),
  },
  newFromFile: {
    id: 'newFromFile',
    label: () => t('menu.newFromFile'),
    enabled: canStart,
    run: () => requestNewProject('file'),
  },
  open: {
    id: 'open',
    label: () => t('menu.open'),
    shortcut: { key: 'o' },
    enabled: canStart,
    // The system's picker first (the user's gesture); the alert about changes not saved once a file is chosen.
    run: () => chooseProjectFile(),
  },
  save: {
    id: 'save',
    label: () => t('menu.save'),
    shortcut: { key: 's' },
    enabled: (c) => onPiece(c) && !c.demo,
    run: () => void saveProject(),
  },
  saveAs: {
    id: 'saveAs',
    label: () => t('menu.saveAs'),
    shortcut: { key: 's', shift: true },
    enabled: (c) => onPiece(c) && !c.demo,
    run: () => void saveProjectAs(),
  },
  exportAudio: {
    id: 'exportAudio',
    label: () => t('menu.exportAudio'),
    enabled: (c) => onPiece(c) && c.hasTracks,
    run: () => openExportAudio(),
  },
  irealFile: {
    id: 'irealFile',
    label: () => t('menu.irealFile'),
    enabled: withChords,
    run: () => downloadIRealFile(),
  },
  irealOpen: {
    id: 'irealOpen',
    label: () => t('menu.irealOpen'),
    offered: (c) => c.canOpenIReal,
    enabled: withChords,
    run: () => openInIReal(),
  },
  pdf: {
    id: 'pdf',
    label: () => t('menu.pdf'),
    // The print window writes the PDF too (« Enregistrer en PDF… »).
    enabled: withChords,
    run: () => openPrint(),
  },
  exportLogic: {
    id: 'exportLogic',
    label: () => t('menu.exportLogic'),
    // The tracks in audio and the MIDI file (tempo, signatures, keys, chords as markers): it needs tracks, not chords.
    enabled: (c) => onPiece(c) && c.hasTracks,
    run: () => openExportLogic(),
  },
  print: {
    id: 'print',
    label: () => t('menu.print'),
    shortcut: { key: 'p' },
    enabled: withChords,
    run: () => openPrint(),
  },
  settings: {
    id: 'settings',
    label: () => t('menu.settings'),
    shortcut: { key: ',' },
    enabled: canStart,
    run: () => openSettings(),
  },
  quit: {
    id: 'quit',
    label: () => t('menu.quit'),
    shortcut: { key: 'q' },
    offered: (c) => c.canQuit,
    enabled: () => true,
    run: () => void getDesktopBridge()?.quitApp?.(),
  },
};

// ---------------------------------------------------------------- the menu Fabtice

export type SubmenuId = 'new' | 'recent' | 'export' | 'ireal';

export type MenuNode =
  | { kind: 'command'; id: CommandId }
  | { kind: 'separator' }
  | { kind: 'submenu'; id: SubmenuId; label: MessageKey; children: MenuNode[]; offered?: (ctx: CommandContext) => boolean }
  /** The recent projects of the Mac app, read when their submenu opens. */
  | { kind: 'recent' };

const cmd = (id: CommandId): MenuNode => ({ kind: 'command', id });
const line: MenuNode = { kind: 'separator' };

/** The menu under the logo (C6), in its order. One line per entry. */
export const FABTICE_MENU: MenuNode[] = [
  cmd('undo'),
  cmd('redo'),
  line,
  { kind: 'submenu', id: 'new', label: 'menu.newProject', children: [cmd('newFromLink'), cmd('newFromFile')] },
  cmd('open'),
  { kind: 'submenu', id: 'recent', label: 'menu.recent', children: [{ kind: 'recent' }], offered: (c) => c.hasRecent },
  line,
  cmd('save'),
  cmd('saveAs'),
  {
    kind: 'submenu',
    id: 'export',
    label: 'menu.export',
    children: [cmd('exportAudio'), { kind: 'submenu', id: 'ireal', label: 'menu.ireal', children: [cmd('irealFile'), cmd('irealOpen')] }, cmd('pdf'), cmd('exportLogic')],
  },
  cmd('print'),
  line,
  cmd('settings'),
  cmd('quit'),
];

/** The entries offered here, separators kept only between two groups. */
export function offeredNodes(nodes: readonly MenuNode[], ctx: CommandContext): MenuNode[] {
  const out: MenuNode[] = [];
  for (const n of nodes) {
    if (n.kind === 'command' && COMMANDS[n.id].offered && !COMMANDS[n.id].offered!(ctx)) continue;
    if (n.kind === 'submenu' && n.offered && !n.offered(ctx)) continue;
    if (n.kind === 'separator' && (out.length === 0 || out[out.length - 1]!.kind === 'separator')) continue;
    out.push(n);
  }
  while (out.at(-1)?.kind === 'separator') out.pop();
  return out;
}

/** A submenu can be opened when one of its entries can run (the recent projects: when a project may be opened). */
export function nodeEnabled(node: MenuNode, ctx: CommandContext): boolean {
  switch (node.kind) {
    case 'command':
      return COMMANDS[node.id].enabled(ctx);
    case 'submenu':
      return offeredNodes(node.children, ctx).some((n) => nodeEnabled(n, ctx));
    case 'recent':
      return canStart(ctx);
    default:
      return false;
  }
}

/** Where a submenu is, as the path of submenu ids from the top (« export », « ireal »). */
export function pathOf(id: CommandId, nodes: readonly MenuNode[] = FABTICE_MENU, at: SubmenuId[] = []): SubmenuId[] | null {
  for (const n of nodes) {
    if (n.kind === 'command' && n.id === id) return at;
    if (n.kind === 'submenu') {
      const found = pathOf(id, n.children, [...at, n.id]);
      if (found) return found;
    }
  }
  return null;
}

// ---------------------------------------------------------------- shortcuts as text

/** « cmd + Z », « Maj + cmd + Z »; « Ctrl + Z » outside a Mac. */
export function shortcutText(shortcut: Shortcut, mac: boolean): string {
  const key = shortcut.key === ',' ? ',' : shortcut.key.toUpperCase();
  const mod = mac ? t('menu.key.cmd') : t('menu.key.ctrl');
  return [shortcut.shift ? t('menu.key.shift') : null, mod, key].filter(Boolean).join(' + ');
}

/** The Electron accelerator of a shortcut (Mac menu bar): « CommandOrControl+Shift+Z ». */
export function shortcutAccelerator(shortcut: Shortcut): string {
  return ['CommandOrControl', shortcut.shift ? 'Shift' : null, shortcut.key === ',' ? ',' : shortcut.key.toUpperCase()].filter(Boolean).join('+');
}

// ---------------------------------------------------------------- the context, live

/** A window of the app stands in front of the piece (not the « Nouveau projet » window: `opening`), the start-up message included. */
function windowInTheWay(s: AppState): boolean {
  return otherWindowOpen(s) || standardsMessageOpen();
}

/** The context now. */
export function commandContext(): CommandContext {
  const s = appStore.getState();
  const bridge = getDesktopBridge();
  const active = typeof document === 'undefined' ? null : document.activeElement;
  return {
    hasProject: s.project !== null,
    demo: s.project?.source.kind === 'demo',
    hasTracks: s.tracks.length > 0,
    hasChords: selectHasChords(s),
    busy: s.ui.import.kind === 'busy',
    opening: s.ui.newPieceOpen,
    blocked: windowInTheWay(s),
    textField: isTextField(active),
    history: historyStatus(),
    desktop: bridge !== null,
    canOpenIReal: typeof bridge?.openInIRealPro === 'function',
    hasRecent: typeof bridge?.recentProjects === 'function' && typeof bridge.openRecentProject === 'function',
    canQuit: typeof bridge?.quitApp === 'function',
  };
}

/** One command as a menu shows it. */
export interface CommandState {
  label: string;
  enabled: boolean;
  offered: boolean;
}
export type CommandStates = Record<CommandId, CommandState>;

export function commandStates(ctx: CommandContext = commandContext()): CommandStates {
  const out = {} as CommandStates;
  for (const id of COMMAND_IDS) {
    const c = COMMANDS[id];
    out[id] = { label: c.label(ctx), enabled: c.enabled(ctx), offered: c.offered ? c.offered(ctx) : true };
  }
  return out;
}

/**
 * Follows everything the context reads (the store, the history, the alert, the save's progress, the standards
 * window, the focus). Returns the stop function.
 */
export function subscribeCommands(listener: () => void): () => void {
  const offs = [appStore.subscribe(listener), subscribeHistory(listener), leaveDialog.subscribe(listener), saveActivity.subscribe(listener), standardsStore.subscribe(listener)];
  if (typeof document !== 'undefined') {
    document.addEventListener('focusin', listener);
    document.addEventListener('focusout', listener);
  }
  return () => {
    for (const off of offs) off();
    if (typeof document !== 'undefined') {
      document.removeEventListener('focusin', listener);
      document.removeEventListener('focusout', listener);
    }
  };
}

let cached: { key: string; ctx: CommandContext } | null = null;

function contextSnapshot(): CommandContext {
  const ctx = commandContext();
  const key = JSON.stringify(ctx);
  if (cached && cached.key === key) return cached.ctx;
  cached = { key, ctx };
  return ctx;
}

/** React hook: the context, redrawn only when it changes. */
export function useCommandContext(): CommandContext {
  return useSyncExternalStore(subscribeCommands, contextSnapshot, contextSnapshot);
}

// ---------------------------------------------------------------- running

/** Told when a command could not do its work (the menu shows the sentence under the entry). */
type FailureListener = (id: CommandId, error: string) => void;
const failureListeners = new Set<FailureListener>();

export function onCommandFailure(listener: FailureListener): () => void {
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

/**
 * Runs a command if it can run now (a command greyed out does nothing, wherever it is asked from). Resolves once
 * its action has answered.
 */
export async function runCommand(id: CommandId, ctx: CommandContext = commandContext()): Promise<boolean> {
  const c = COMMANDS[id];
  if ((c.offered && !c.offered(ctx)) || !c.enabled(ctx)) return false;
  const outcome = await c.run(ctx);
  if (outcome && 'error' in outcome) {
    for (const l of failureListeners) l(id, outcome.error);
    return false;
  }
  return true;
}

/** « Projets récents ▸ »: a project of the Mac app's list (it then opens like one from the Finder, alert first). */
export async function openRecent(token: string): Promise<void> {
  if (!canStart(commandContext())) return;
  await getDesktopBridge()?.openRecentProject?.(token);
}

/** Whether shortcuts read cmd (a Mac) or Ctrl. */
export function shortcutsUseCmd(): boolean {
  return isMacPlatform();
}
