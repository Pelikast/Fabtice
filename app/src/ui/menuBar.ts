// The Mac menu bar, from the page's side (C6). The bar (`desktop/src/menu.js`)
// holds the same commands as the menu Fabtice, at the places macOS users
// expect; the page is the one that knows whether each can run:
//
//   page -> main   `reportMenuState`: every command, its label (« Annuler :
//                  volume de la piste ») and whether it can run, at each change
//                  (only when something changed);
//   main -> page   a click on an entry (or its shortcut, when the system lets
//                  the bar have it): the DOM event `MENU_COMMAND_EVENT`, sent
//                  with a user gesture so that a file picker may open. The page
//                  runs it through the same table (`runCommand`): an entry the
//                  page has greyed out does nothing even if the bar was late.
//
// A key the page already took (`ui/commandKeys.ts`) is never run a second
// time: a bar command that names the same command, reached by its shortcut,
// within `SAME_KEY_MS` of the key, is dropped.

import { MENU_COMMAND_EVENT, getDesktopBridge, type DesktopBridge, type MenuCommandDetail } from '../platform/desktopBridge';
import { lastKeyCommand } from './commandKeys';
import { COMMAND_IDS, commandContext, commandStates, runCommand, subscribeCommands, type CommandId } from './commands';

/** A bar command reached by the same shortcut this soon after the page's own key is the same press. */
export const SAME_KEY_MS = 600;

const isCommand = (id: unknown): id is CommandId => typeof id === 'string' && (COMMAND_IDS as readonly string[]).includes(id);

/** What the bar is told: label and state of every command offered here. */
export function menuBarState(): { commands: Record<string, { label: string; enabled: boolean }> } {
  const states = commandStates(commandContext());
  const commands: Record<string, { label: string; enabled: boolean }> = {};
  for (const id of COMMAND_IDS) {
    const s = states[id];
    commands[id] = { label: s.label, enabled: s.offered && s.enabled };
  }
  return { commands };
}

/** Runs a command the bar sent, unless it is the key the page has just handled. */
export function runMenuBarCommand(detail: Partial<MenuCommandDetail>, now = Date.now()): boolean {
  if (!isCommand(detail.id)) return false;
  const last = lastKeyCommand();
  if (detail.accelerator && last && last.id === detail.id && now - last.at < SAME_KEY_MS) return false;
  void runCommand(detail.id);
  return true;
}

/** Mac app: keeps the bar in step with the page, and runs what it sends. Returns the stop function. */
export function installMenuBar(bridge: DesktopBridge | null = getDesktopBridge(), win: Window = window): () => void {
  if (!bridge?.reportMenuState) return () => {};
  let last = '';
  let scheduled = false;
  const report = () => {
    scheduled = false;
    const state = menuBarState();
    const key = JSON.stringify(state);
    if (key === last) return;
    last = key;
    void bridge.reportMenuState!(state).catch(() => {
      // told again at the next change
      last = '';
    });
  };
  // Several stores change together (an import ending): one report.
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(report);
  };
  const off = subscribeCommands(schedule);
  const onCommand = (e: Event) => runMenuBarCommand(((e as CustomEvent).detail ?? {}) as Partial<MenuCommandDetail>);
  win.addEventListener(MENU_COMMAND_EVENT, onCommand);
  report();
  return () => {
    off();
    win.removeEventListener(MENU_COMMAND_EVENT, onCommand);
  };
}
