'use strict';

const { Menu } = require('electron');

// French application menu. Edit roles make copy/paste work in the link field.
function buildMenu({ openDiagnostic }) {
  const template = [
    {
      label: 'Fabtice',
      submenu: [
        { role: 'about', label: 'À propos de Fabtice' },
        { type: 'separator' },
        { role: 'services', label: 'Services' },
        { type: 'separator' },
        { role: 'hide', label: 'Masquer Fabtice' },
        { role: 'hideOthers', label: 'Masquer les autres' },
        { role: 'unhide', label: 'Tout afficher' },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter Fabtice' },
      ],
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
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
    {
      label: 'Fenêtre',
      submenu: [
        { role: 'minimize', label: 'Placer dans le Dock' },
        { role: 'zoom', label: 'Agrandir la fenêtre' },
        { type: 'separator' },
        { role: 'front', label: 'Tout ramener au premier plan' },
      ],
    },
    {
      label: 'Aide',
      role: 'help',
      submenu: [
        { id: 'diagnostic', label: 'Diagnostic…', click: () => openDiagnostic() },
      ],
    },
  ];
  // Outside macOS the first menu has no app role: keep the same entries usable.
  if (process.platform !== 'darwin') {
    template[0] = { label: 'Fabtice', submenu: [{ role: 'quit', label: 'Quitter Fabtice' }] };
    template[3] = { label: 'Fenêtre', submenu: [{ role: 'minimize', label: 'Réduire' }, { role: 'close', label: 'Fermer' }] };
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildMenu };
