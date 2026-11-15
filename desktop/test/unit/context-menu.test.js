'use strict';

// The right-click menu: French entries, the editing ones only, each enabled
// according to what is possible where the click happened; nothing elsewhere.

const test = require('node:test');
const assert = require('node:assert/strict');
const { contextMenuTemplate } = require('../../src/context-menu');

const flags = (over = {}) => ({ canUndo: false, canRedo: false, canCut: false, canCopy: false, canPaste: false, canDelete: false, canSelectAll: true, ...over });
const calls = [];
const actions = {
  cut: () => calls.push('cut'),
  copy: () => calls.push('copy'),
  paste: () => calls.push('paste'),
  selectAll: () => calls.push('selectAll'),
};
const summary = (items) => items.map((i) => (i.type === 'separator' ? '-' : `${i.label}${i.enabled ? '' : ' (off)'}`));

test('in a text field: Couper, Copier, Coller, Tout sélectionner, in French', () => {
  const items = contextMenuTemplate({ isEditable: true, selectionText: '', editFlags: flags({ canPaste: true }) }, actions);
  assert.deepEqual(items.map((i) => i.label), ['Couper', 'Copier', 'Coller', undefined, 'Tout sélectionner']);
  assert.equal(items[3].type, 'separator');
});

test('in an empty text field with something on the clipboard: only Coller (and Tout sélectionner) can be used', () => {
  const items = contextMenuTemplate({ isEditable: true, selectionText: '', editFlags: flags({ canPaste: true }) }, actions);
  assert.deepEqual(summary(items), ['Couper (off)', 'Copier (off)', 'Coller', '-', 'Tout sélectionner']);
});

test('in a text field with a selection and nothing to paste: Couper and Copier can be used, Coller cannot', () => {
  const items = contextMenuTemplate({ isEditable: true, selectionText: 'lien', editFlags: flags({ canCut: true, canCopy: true }) }, actions);
  assert.deepEqual(summary(items), ['Couper', 'Copier', 'Coller (off)', '-', 'Tout sélectionner']);
});

test('in a field with nothing to select: Tout sélectionner is off', () => {
  const items = contextMenuTemplate({ isEditable: true, selectionText: '', editFlags: flags({ canSelectAll: false }) }, actions);
  assert.equal(items.at(-1).label, 'Tout sélectionner');
  assert.equal(items.at(-1).enabled, false);
});

test('on selected text that is not a field: Copier alone', () => {
  const items = contextMenuTemplate({ isEditable: false, selectionText: 'Blues du dimanche', editFlags: flags({ canCopy: true }) }, actions);
  assert.deepEqual(summary(items), ['Copier']);
});

test('anywhere else: no menu at all', () => {
  assert.deepEqual(contextMenuTemplate({ isEditable: false, selectionText: '', editFlags: flags() }, actions), []);
  assert.deepEqual(contextMenuTemplate({}, actions), []);
});

test('no developer entry, no entry that is not an editing one, and every entry does what it says', () => {
  const items = contextMenuTemplate({ isEditable: true, editFlags: flags({ canCut: true, canCopy: true, canPaste: true }) }, actions);
  const labels = items.filter((i) => i.type !== 'separator').map((i) => i.label);
  assert.deepEqual(labels, ['Couper', 'Copier', 'Coller', 'Tout sélectionner']);
  assert.ok(!labels.some((l) => /inspect|d[ée]veloppeur|recharger|devtools/i.test(l)));
  calls.length = 0;
  for (const item of items) if (item.click) item.click();
  assert.deepEqual(calls, ['cut', 'copy', 'paste', 'selectAll']);
});
