'use strict';

// The right-click menu. Electron shows none by itself, so a right click did
// nothing (no way to paste a link into the import field without the keyboard).
// Every window of the app gets this one, in French, with the editing entries only:
//   - in a text field: Couper, Copier, Coller, Tout sélectionner, each enabled
//     according to what is possible there;
//   - on selected text elsewhere: Copier;
//   - anywhere else: no menu.
// No entry about the page or the developer tools.

const { Menu, BrowserWindow } = require('electron');

/**
 * The entries for what was clicked (`params` is the `context-menu` event's).
 * `actions` are the page's own editing commands (cut, copy, paste, selectAll).
 * @param {{ isEditable?: boolean, selectionText?: string, editFlags?: Record<string, boolean> }} params
 * @param {{ cut: () => void, copy: () => void, paste: () => void, selectAll: () => void }} actions
 * @returns {import('electron').MenuItemConstructorOptions[]}
 */
function contextMenuTemplate(params, actions) {
  const flags = (params && params.editFlags) || {};
  if (params && params.isEditable) {
    return [
      { id: 'cut', label: 'Couper', enabled: Boolean(flags.canCut), click: () => actions.cut() },
      { id: 'copy', label: 'Copier', enabled: Boolean(flags.canCopy), click: () => actions.copy() },
      { id: 'paste', label: 'Coller', enabled: Boolean(flags.canPaste), click: () => actions.paste() },
      { type: 'separator' },
      { id: 'selectAll', label: 'Tout sélectionner', enabled: Boolean(flags.canSelectAll), click: () => actions.selectAll() },
    ];
  }
  if (params && typeof params.selectionText === 'string' && params.selectionText.length > 0) {
    return [{ id: 'copy', label: 'Copier', enabled: true, click: () => actions.copy() }];
  }
  return [];
}

/**
 * Gives a web contents the menu. `menu.popup` is read when the menu is shown
 * (a test replaces it to see what would be shown and to press an entry).
 * @param {import('electron').WebContents} contents
 */
function installContextMenu(contents) {
  contents.on('context-menu', (_event, params) => {
    const template = contextMenuTemplate(params, {
      cut: () => contents.cut(),
      copy: () => contents.copy(),
      paste: () => contents.paste(),
      selectAll: () => contents.selectAll(),
    });
    if (template.length === 0) return;
    const menu = Menu.buildFromTemplate(template);
    const window = BrowserWindow.fromWebContents(contents);
    menu.popup(window ? { window } : undefined);
  });
}

module.exports = { contextMenuTemplate, installContextMenu };
