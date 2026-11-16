'use strict';

// The menu bar (C6): the page's commands at the usual places, greyed out until
// the page says they can run, its labels (« Annuler : … »), shortcuts shown
// but never registered outside macOS, clicks sent back to the page.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMenuBar, parseMenuState, commandScript, MENU_COMMANDS, ACCELERATORS } = require('../../src/menu');

/** Labels of a menu, « (off) » for an entry greyed out, « - » for a line. */
const summary = (items) => items.map((i) => (i.type === 'separator' ? '-' : `${i.label || i.role}${i.enabled === false ? ' (off)' : ''}`));
const menu = (template, label) => template.find((m) => m.label === label).submenu;
const find = (items, id) => {
  for (const i of items) {
    if (i.id === id) return i;
    if (Array.isArray(i.submenu)) {
      const found = find(i.submenu, id);
      if (found) return found;
    }
  }
  return null;
};
const all = (on) => ({ commands: Object.fromEntries(MENU_COMMANDS.map((id) => [id, { label: `L ${id}`, enabled: on }])) });

test('macOS: the commands of the page at the usual places, greyed out until the page speaks', () => {
  const bar = createMenuBar({ platform: 'darwin', openDiagnostic() {}, sendCommand() {} });
  const t = bar.template();
  assert.deepEqual(t.map((m) => m.label), ['Fabtice', 'Fichier', 'Édition', 'Présentation', 'Fenêtre', 'Aide']);
  assert.deepEqual(summary(menu(t, 'Fabtice')), ['À propos de Fabtice', '-', 'Réglages… (off)', '-', 'Services', '-', 'Masquer Fabtice', 'Masquer les autres', 'Tout afficher', '-', 'Quitter Fabtice']);
  assert.deepEqual(summary(menu(t, 'Fichier')), [
    'Nouveau projet (off)',
    'Ouvrir… (off)',
    'Ouvrir un projet récent',
    '-',
    'Enregistrer (off)',
    'Enregistrer sous… (off)',
    'Exporter (off)',
    '-',
    'Imprimer… (off)',
  ]);
  assert.deepEqual(summary(find(t, 'newProject').submenu), ['À partir d’un lien YouTube (off)', 'À partir d’un fichier audio (off)']);
  assert.deepEqual(summary(find(t, 'export').submenu), ['Audio… (off)', 'iReal Pro (off)', 'PDF… (off)']);
  assert.deepEqual(summary(find(t, 'ireal').submenu), ['Fichier iReal Pro… (off)', 'Ouvrir dans iReal Pro (off)']);
  assert.deepEqual(summary(menu(t, 'Édition')), ['Annuler (off)', 'Rétablir (off)', '-', 'Couper', 'Copier', 'Coller', 'Tout sélectionner']);
  assert.deepEqual(summary(menu(t, 'Aide')), ['Diagnostic…']);
  // The shortcuts are shown (and macOS lets the page hear the keys first).
  assert.equal(find(t, 'save').accelerator, 'CommandOrControl+S');
  assert.equal(find(t, 'redo').accelerator, 'Shift+CommandOrControl+Z');
  assert.equal(find(t, 'settings').accelerator, 'CommandOrControl+,');
  assert.equal(find(t, 'save').registerAccelerator, undefined);
});

test('the page reports: entries follow, labels too; the bar is built again only when something changed', () => {
  const applied = [];
  const bar = createMenuBar({ platform: 'darwin', openDiagnostic() {}, sendCommand() {}, apply: (t) => applied.push(t) });
  const state = all(false);
  state.commands.undo = { label: 'Annuler : volume de la piste', enabled: true };
  state.commands.save = { label: 'Enregistrer', enabled: true };
  state.commands.irealFile = { label: 'Fichier iReal Pro…', enabled: true };
  assert.equal(bar.update(state), true);
  assert.equal(applied.length, 1);
  const t = applied[0];
  assert.deepEqual(summary(menu(t, 'Édition')).slice(0, 2), ['Annuler : volume de la piste', 'L redo (off)']);
  assert.equal(find(t, 'save').enabled, true);
  assert.equal(find(t, 'saveAs').enabled, false);
  // A submenu with one entry that can run can be opened; the others stay greyed out.
  assert.equal(find(t, 'export').enabled, true);
  assert.equal(find(t, 'ireal').enabled, true);
  assert.equal(find(t, 'newProject').enabled, false);
  assert.equal(bar.update(JSON.parse(JSON.stringify(state))), true);
  assert.equal(applied.length, 1, 'same state: not built again');
  bar.reset();
  assert.equal(applied.length, 2);
  assert.equal(find(applied[1], 'save').enabled, false, 'the page gone: greyed out again');
});

test('what the page sends is checked: unknown ids dropped, labels on one line and short', () => {
  assert.equal(parseMenuState(null), null);
  assert.equal(parseMenuState({}), null);
  const parsed = parseMenuState({ commands: { save: { label: 'Enre\ngistrer', enabled: 'yes' }, evil: { label: 'x', enabled: true }, undo: { label: 'a'.repeat(500), enabled: true } } });
  assert.deepEqual(Object.keys(parsed.commands).sort(), ['save', 'undo']);
  assert.deepEqual(parsed.commands.save, { label: 'Enre gistrer', enabled: false });
  assert.equal(parsed.commands.undo.label.length, 200);
  assert.deepEqual(parseMenuState({ commands: { open: { label: '', enabled: true } } }).commands.open, { label: 'Ouvrir…', enabled: true });
});

test('outside macOS: the same commands, shortcuts shown but not registered (the page takes the keys)', () => {
  const bar = createMenuBar({ platform: 'linux', openDiagnostic() {}, sendCommand() {} });
  const t = bar.template();
  assert.deepEqual(summary(menu(t, 'Fabtice')), ['Réglages… (off)', '-', 'Quitter Fabtice']);
  assert.deepEqual(summary(menu(t, 'Fichier')), ['Nouveau projet (off)', 'Ouvrir… (off)', '-', 'Enregistrer (off)', 'Enregistrer sous… (off)', 'Exporter (off)', '-', 'Imprimer… (off)']);
  assert.deepEqual(summary(menu(t, 'Fenêtre')), ['Réduire', 'Fermer']);
  for (const id of Object.keys(ACCELERATORS)) {
    const item = find(t, id);
    assert.equal(item.accelerator, ACCELERATORS[id]);
    assert.equal(item.registerAccelerator, false, id);
  }
});

test('a click goes back to the page, saying whether the shortcut did it', () => {
  const sent = [];
  const bar = createMenuBar({ platform: 'darwin', openDiagnostic() {}, sendCommand: (id, acc) => sent.push([id, acc]) });
  bar.update(all(true));
  const t = bar.template();
  find(t, 'undo').click(null, null, { triggeredByAccelerator: false });
  find(t, 'print').click(null, null, { triggeredByAccelerator: true });
  find(t, 'irealOpen').click(null, null, undefined);
  assert.deepEqual(sent, [['undo', false], ['print', true], ['irealOpen', false]]);
});

test('the script handed to the page names a known command only', () => {
  assert.equal(commandScript('save', false), `window.dispatchEvent(new CustomEvent('fabtice-menu-command', { detail: {"id":"save","accelerator":false} }))`);
  assert.match(commandScript('undo', true), /"accelerator":true/);
  assert.equal(commandScript("save'); alert(1); ('", false), null);
  assert.equal(commandScript('reload', false), null);
});
