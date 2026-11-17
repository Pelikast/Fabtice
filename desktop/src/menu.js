'use strict';

// The French menu bar (C6). It holds the same commands as the page's menu
// Fabtice (`app/src/ui/commands.ts`), at the places macOS users expect:
//
//   Fabtice       À propos de Fabtice, Réglages… (cmd + ,), Services, Masquer…, Quitter Fabtice
//   Fichier       Nouveau projet ▸, Ouvrir… (cmd + O), Ouvrir un projet récent, Enregistrer (cmd + S),
//                 Enregistrer sous… (Maj + cmd + S), Exporter ▸, Imprimer… (cmd + P)
//   Édition       Annuler, Rétablir, Couper, Copier, Coller, Tout sélectionner
//   Présentation, Fenêtre, Aide (Diagnostic…)
//
// The page knows whether each command can run: it reports its labels and
// states at each change (`fabtice:menu-state`, `update`), and the bar is built
// again with them (an entry greyed out in the app is greyed out here). Before
// the page has said anything, its commands are greyed out. A click on one of
// them goes back to the page (`sendCommand`), which runs it through the same
// table; « Annuler » there undoes the piece, or the typing when a text field
// has the focus.
//
// Shortcuts: the page handles its own (`app/src/ui/commandKeys.ts`) and takes
// them (`preventDefault`); the bar only shows them. On macOS the page hears a
// key first and the bar only gets the keys the page left (Annuler in a text
// field); elsewhere the bar's shortcuts are shown and not registered
// (`registerAccelerator: false`). Should a system still deliver both, the page
// drops a bar command that follows its own key at once (`app/src/ui/menuBar.ts`).
//
// Adding an entry of the page: its id in `MENU_COMMANDS`, a default label in
// `LABELS` (and its shortcut in `ACCELERATORS`), then `command('id')` where it
// goes in `template`.

const MENU_COMMANDS = [
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
  'exportAbleton',
  'print',
  'settings',
  'quit',
];

/** Labels until the page reports its own (the same words). */
const LABELS = {
  undo: 'Annuler',
  redo: 'Rétablir',
  newFromLink: 'À partir d’un lien YouTube',
  newFromFile: 'À partir d’un fichier audio',
  open: 'Ouvrir…',
  save: 'Enregistrer',
  saveAs: 'Enregistrer sous…',
  exportAudio: 'Audio…',
  irealFile: 'Fichier iReal Pro…',
  irealOpen: 'Ouvrir dans iReal Pro',
  pdf: 'PDF…',
  exportLogic: 'Dossier pour Logic Pro…',
  exportAbleton: 'Projet Ableton Live…',
  print: 'Imprimer…',
  settings: 'Réglages…',
  quit: 'Quitter Fabtice',
};

const ACCELERATORS = {
  undo: 'CommandOrControl+Z',
  redo: 'Shift+CommandOrControl+Z',
  open: 'CommandOrControl+O',
  save: 'CommandOrControl+S',
  saveAs: 'Shift+CommandOrControl+S',
  print: 'CommandOrControl+P',
  settings: 'CommandOrControl+,',
};

const MAX_LABEL = 200;

/** The state the page sent, checked: known ids only, short one-line labels. Null when it is not one. */
function parseMenuState(value) {
  if (!value || typeof value !== 'object' || !value.commands || typeof value.commands !== 'object') return null;
  const commands = {};
  for (const id of MENU_COMMANDS) {
    const c = value.commands[id];
    if (!c || typeof c !== 'object') continue;
    const label = typeof c.label === 'string' ? c.label.replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX_LABEL) : '';
    commands[id] = { label: label || LABELS[id], enabled: c.enabled === true };
  }
  return { commands };
}

/**
 * @param {{ platform?: string, openDiagnostic: () => void, sendCommand: (id: string, accelerator: boolean) => void }} options
 */
function createMenuBar(options) {
  const platform = options.platform || process.platform;
  const mac = platform === 'darwin';
  /** @type {{ commands: Record<string, { label: string, enabled: boolean }> } | null} */
  let state = null;

  function command(id) {
    const s = state && state.commands[id];
    const item = {
      id,
      label: (s && s.label) || LABELS[id],
      enabled: Boolean(s && s.enabled),
      click: (_item, _window, event) => options.sendCommand(id, Boolean(event && event.triggeredByAccelerator)),
    };
    if (ACCELERATORS[id]) {
      item.accelerator = ACCELERATORS[id];
      // Shown, not registered: the page takes the key (registerAccelerator is ignored on macOS, see above).
      if (!mac) item.registerAccelerator = false;
    }
    return item;
  }

  /** A submenu of page commands, greyed out when none of them can run. */
  function submenu(id, label, items) {
    return { id, label, enabled: items.some((i) => i.enabled !== false && i.type !== 'separator'), submenu: items };
  }

  function fileMenu() {
    const items = [
      submenu('newProject', 'Nouveau projet', [command('newFromLink'), command('newFromFile')]),
      command('open'),
    ];
    // macOS keeps this list itself (app.addRecentDocument, projects.js); a choice comes back as `open-file`.
    if (mac) items.push({ role: 'recentDocuments', label: 'Ouvrir un projet récent', submenu: [{ role: 'clearRecentDocuments', label: 'Effacer le menu' }] });
    items.push(
      { type: 'separator' },
      command('save'),
      command('saveAs'),
      submenu('export', 'Exporter', [command('exportAudio'), submenu('ireal', 'iReal Pro', [command('irealFile'), command('irealOpen')]), command('pdf'), command('exportLogic'), command('exportAbleton')]),
      { type: 'separator' },
      command('print'),
    );
    return { label: 'Fichier', submenu: items };
  }

  function template() {
    const app = mac
      ? {
          label: 'Fabtice',
          submenu: [
            { role: 'about', label: 'À propos de Fabtice' },
            { type: 'separator' },
            command('settings'),
            { type: 'separator' },
            { role: 'services', label: 'Services' },
            { type: 'separator' },
            { role: 'hide', label: 'Masquer Fabtice' },
            { role: 'hideOthers', label: 'Masquer les autres' },
            { role: 'unhide', label: 'Tout afficher' },
            { type: 'separator' },
            // The page's « Quitter » asks the same thing (`fabtice:quit`); both go through the close guard.
            { role: 'quit', label: 'Quitter Fabtice' },
          ],
        }
      : // Outside macOS the first menu has no app role: keep the same entries usable.
        { label: 'Fabtice', submenu: [command('settings'), { type: 'separator' }, { role: 'quit', label: 'Quitter Fabtice' }] };
    return [
      app,
      fileMenu(),
      {
        label: 'Édition',
        submenu: [
          command('undo'),
          command('redo'),
          { type: 'separator' },
          { role: 'cut', label: 'Couper' },
          { role: 'copy', label: 'Copier' },
          { role: 'paste', label: 'Coller' },
          { role: 'selectAll', label: 'Tout sélectionner' },
        ],
      },
      {
        label: 'Présentation',
        submenu: [
          { role: 'resetZoom', label: 'Taille réelle' },
          { role: 'zoomIn', label: 'Agrandir' },
          { role: 'zoomOut', label: 'Réduire' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: 'Plein écran' },
        ],
      },
      mac
        ? {
            label: 'Fenêtre',
            submenu: [
              { role: 'minimize', label: 'Placer dans le Dock' },
              { role: 'zoom', label: 'Agrandir la fenêtre' },
              { type: 'separator' },
              { role: 'front', label: 'Tout ramener au premier plan' },
            ],
          }
        : { label: 'Fenêtre', submenu: [{ role: 'minimize', label: 'Réduire' }, { role: 'close', label: 'Fermer' }] },
      {
        label: 'Aide',
        role: 'help',
        submenu: [{ id: 'diagnostic', label: 'Diagnostic…', click: () => options.openDiagnostic() }],
      },
    ];
  }

  /**
   * The page's new state: the bar is built again when it changed. Returns whether it was taken.
   * @param {unknown} value
   */
  function update(value) {
    const next = parseMenuState(value);
    if (!next) return false;
    if (state && JSON.stringify(state) === JSON.stringify(next)) return true;
    state = next;
    if (options.apply) options.apply(template());
    return true;
  }

  /** The page is gone (the window closed, a reload): its commands are greyed out until it reports again. */
  function reset() {
    state = null;
    if (options.apply) options.apply(template());
  }

  return { template, update, reset, state: () => state };
}

/** The script that hands a bar command to the page (a DOM event, run with a user gesture so a file picker may open). */
function commandScript(id, accelerator) {
  if (!MENU_COMMANDS.includes(id)) return null;
  const detail = JSON.stringify({ id, accelerator: accelerator === true });
  return `window.dispatchEvent(new CustomEvent('fabtice-menu-command', { detail: ${detail} }))`;
}

/**
 * Builds the bar and keeps it in step with the page.
 * @param {{ openDiagnostic: () => void, window: () => any }} options
 */
function buildMenu({ openDiagnostic, window }) {
  const { Menu } = require('electron');
  const apply = (template) => Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  const bar = createMenuBar({
    openDiagnostic,
    apply,
    sendCommand: (id, accelerator) => {
      const w = window();
      const script = commandScript(id, accelerator);
      if (!w || w.isDestroyed() || !script) return;
      w.webContents.executeJavaScript(script, true).catch(() => {});
    },
  });
  apply(bar.template());
  return bar;
}

module.exports = { buildMenu, createMenuBar, parseMenuState, commandScript, MENU_COMMANDS, LABELS, ACCELERATORS };
