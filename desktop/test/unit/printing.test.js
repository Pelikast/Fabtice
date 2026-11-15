'use strict';

// Printing the chart from the Mac app: what the page may ask for is checked, the
// save panel is the French one with the piece's name, the PDF is written where
// the panel says, and the system's print dialog gets the orientation.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parsePrintRequest, paperFor, pdfName, pdfSaveOptions, printPage, savePagePdf } = require('../../src/printing');

test('only the two orientations and a short title are accepted', () => {
  assert.deepEqual(parsePrintRequest({ orientation: 'portrait', title: 'Blues' }), { ok: true, landscape: false, title: 'Blues' });
  assert.deepEqual(parsePrintRequest({ orientation: 'landscape' }), { ok: true, landscape: true, title: '' });
  for (const bad of [null, undefined, 'landscape', 42, {}, { orientation: 'paysage' }, { orientation: 'Portrait' }, { orientation: 'portrait', title: 7 }, { orientation: 'portrait', title: 'x'.repeat(301) }]) {
    assert.equal(parsePrintRequest(bad).ok, false, JSON.stringify(bad));
  }
});

test('US Letter where the region uses it, A4 elsewhere', () => {
  assert.equal(paperFor('en-US'), 'Letter');
  assert.equal(paperFor('fr-CA'), 'Letter');
  assert.equal(paperFor('fr'), 'A4');
  assert.equal(paperFor('fr-FR'), 'A4');
  assert.equal(paperFor('en-GB'), 'A4');
  assert.equal(paperFor(''), 'A4');
  assert.equal(paperFor(undefined), 'A4');
});

test('the PDF is named after the piece, cleaned, with its accents; « Grille » when there is no title', () => {
  assert.equal(pdfName('Blues du dimanche'), 'Blues du dimanche.pdf');
  assert.equal(pdfName('Été à Paris – Take 2'), 'Été à Paris – Take 2.pdf');
  assert.equal(pdfName('../../etc/passwd'), 'passwd.pdf');
  assert.equal(pdfName('A/B:C?.pdf'), 'B C.pdf');
  assert.equal(pdfName(''), 'Grille.pdf');
  assert.equal(pdfName('   '), 'Grille.pdf');
});

test('the save panel is in French, starts in the given folder and offers PDF', () => {
  const o = pdfSaveOptions('Blues du dimanche', '/Users/x/Downloads');
  assert.equal(o.title, 'Enregistrer la grille en PDF');
  assert.equal(o.buttonLabel, 'Enregistrer');
  assert.equal(o.defaultPath, path.join('/Users/x/Downloads', 'Blues du dimanche.pdf'));
  assert.deepEqual(o.filters, [{ name: 'Document PDF', extensions: ['pdf'] }]);
});

test('the system print dialog is asked for with the orientation, no silent printing, no background', async () => {
  let seen = null;
  const contents = { print: (options, done) => { seen = options; done(true, ''); } };
  assert.deepEqual(await printPage(contents, { landscape: true }), { ok: true });
  assert.equal(seen.landscape, true);
  assert.equal(seen.silent, false);
  assert.equal(seen.printBackground, false);
  assert.deepEqual(await printPage({ print: (_o, done) => done(false, 'Print job canceled') }, { landscape: false }), { ok: false, reason: 'cancelled' });
  assert.deepEqual(await printPage({ print: (_o, done) => done(false, 'Invalid printer settings') }, { landscape: false }), { ok: false, reason: 'failed' });
  assert.deepEqual(await printPage({ print: () => { throw new Error('x'); } }, { landscape: false }), { ok: false, reason: 'failed' });
});

test('the PDF is written where the panel says, in the orientation asked, and nothing is written when the panel is closed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-print-'));
  const asked = [];
  const pdfOptions = [];
  const contents = { printToPDF: async (o) => { pdfOptions.push(o); return Buffer.from('%PDF-1.7 test'); } };
  const dialogTo = (filePath) => ({ showSaveDialog: async (_w, o) => { asked.push(o); return { canceled: false, filePath }; } });
  const request = { landscape: true, title: 'Blues du dimanche' };

  const target = path.join(dir, 'grille');
  const done = await savePagePdf({ dialog: dialogTo(target), window: null, contents, request, folder: dir, locale: 'fr' });
  assert.deepEqual(done, { ok: true });
  assert.equal(asked[0].defaultPath, path.join(dir, 'Blues du dimanche.pdf'));
  assert.equal(pdfOptions[0].landscape, true);
  assert.equal(pdfOptions[0].pageSize, 'A4');
  assert.equal(pdfOptions[0].printBackground, false);
  assert.equal(fs.readFileSync(`${target}.pdf`, 'latin1'), '%PDF-1.7 test', 'a missing extension is added');

  const cancelled = await savePagePdf({ dialog: { showSaveDialog: async () => ({ canceled: true }) }, window: null, contents, request, folder: dir, locale: 'fr' });
  assert.deepEqual(cancelled, { ok: false, reason: 'cancelled' });
  assert.equal(pdfOptions.length, 1, 'no PDF made for a closed panel');

  const failing = await savePagePdf({ dialog: dialogTo(path.join(dir, 'x.pdf')), window: null, contents: { printToPDF: async () => { throw new Error('no'); } }, request, folder: dir, locale: 'fr' });
  assert.deepEqual(failing, { ok: false, reason: 'failed' });
  const unwritable = await savePagePdf({ dialog: dialogTo(path.join(dir, 'absent', 'x.pdf')), window: null, contents, request, folder: dir, locale: 'en-US' });
  assert.deepEqual(unwritable, { ok: false, reason: 'failed' });
  assert.equal(pdfOptions.at(-1).pageSize, 'Letter');
});
