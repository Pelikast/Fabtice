'use strict';

// Printing the chart from the Mac app: what the page may ask for is checked, the
// save panel is the French one with the piece's name, the PDF is written where
// the panel says (one PDF page per sheet: the CSS page size, no margin), the
// printers the system lists are passed on, and printing goes to the printer
// chosen (silent, with its copies) or, failing that, through the system's dialog.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parsePrintRequest, paperFor, pdfName, pdfSaveOptions, printPage, listPrinters, savePagePdf } = require('../../src/printing');

test('only the two orientations, the two papers, a printer name, a number of copies and a short title are accepted', () => {
  assert.deepEqual(parsePrintRequest({ orientation: 'portrait', title: 'Blues' }), { ok: true, landscape: false, title: 'Blues', paper: null, printer: null, copies: 1 });
  assert.deepEqual(parsePrintRequest({ orientation: 'landscape' }), { ok: true, landscape: true, title: '', paper: null, printer: null, copies: 1 });
  assert.deepEqual(parsePrintRequest({ orientation: 'landscape', paper: 'Letter', printer: 'HP_LaserJet', copies: 3 }), { ok: true, landscape: true, title: '', paper: 'Letter', printer: 'HP_LaserJet', copies: 3 });
  assert.deepEqual(parsePrintRequest({ orientation: 'portrait', paper: 'A4', printer: null, copies: 2 }), { ok: true, landscape: false, title: '', paper: 'A4', printer: null, copies: 2 });
  for (const bad of [null, undefined, 'landscape', 42, {}, { orientation: 'paysage' }, { orientation: 'Portrait' }, { orientation: 'portrait', title: 7 }, { orientation: 'portrait', title: 'x'.repeat(301) }, { orientation: 'portrait', paper: 'A3' }, { orientation: 'portrait', paper: 4 }, { orientation: 'portrait', printer: 7 }, { orientation: 'portrait', printer: 'x'.repeat(257) }]) {
    assert.equal(parsePrintRequest(bad).ok, false, JSON.stringify(bad));
  }
  // Odd copies are one copy, not an error and never a large number of sheets.
  for (const copies of [0, -1, 1.5, 100, 1e9, '3', null, NaN]) assert.equal(parsePrintRequest({ orientation: 'portrait', copies }).copies, 1, String(copies));
  assert.equal(parsePrintRequest({ orientation: 'portrait', copies: 99 }).copies, 99);
  assert.equal(parsePrintRequest({ orientation: 'portrait', printer: '' }).printer, null, 'an empty name is no printer');
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

const request = (more = {}) => ({ landscape: false, paper: null, printer: null, copies: 1, ...more });

test('no printer chosen: the system print dialog opens (not silent), with the paper, the orientation and no margin', async () => {
  let seen = null;
  const contents = { print: (options, done) => { seen = options; done(true, ''); } };
  assert.deepEqual(await printPage(contents, request({ landscape: true, paper: 'Letter' }), 'fr'), { ok: true });
  assert.equal(seen.landscape, true);
  assert.equal(seen.silent, false);
  assert.equal(seen.printBackground, false);
  assert.equal(seen.pageSize, 'Letter');
  assert.deepEqual(seen.margins, { marginType: 'none' });
  assert.equal(seen.deviceName, undefined);
  // The paper of the region when the page did not say.
  await printPage(contents, request(), 'en-US');
  assert.equal(seen.pageSize, 'Letter');
  await printPage(contents, request(), 'fr-FR');
  assert.equal(seen.pageSize, 'A4');
  assert.deepEqual(await printPage({ print: (_o, done) => done(false, 'Print job canceled') }, request(), 'fr'), { ok: false, reason: 'cancelled' });
  assert.deepEqual(await printPage({ print: (_o, done) => done(false, 'Invalid printer settings') }, request(), 'fr'), { ok: false, reason: 'failed' });
  assert.deepEqual(await printPage({ print: () => { throw new Error('x'); } }, request(), 'fr'), { ok: false, reason: 'failed' });
});

test('the printers the system lists are passed on, the default first; none when it cannot say', async () => {
  const listed = [
    { name: 'Canon_A', displayName: 'Canon A', isDefault: false, status: 0, description: '', options: {} },
    { name: 'HP_B', displayName: '', isDefault: true },
    { name: '', displayName: 'broken' },
    null,
  ];
  assert.deepEqual(await listPrinters({ getPrintersAsync: async () => listed }), {
    ok: true,
    printers: [
      { name: 'HP_B', displayName: 'HP_B', isDefault: true },
      { name: 'Canon_A', displayName: 'Canon A', isDefault: false },
    ],
  });
  assert.deepEqual(await listPrinters({ getPrintersAsync: async () => [] }), { ok: true, printers: [] });
  assert.deepEqual(await listPrinters({ getPrintersAsync: async () => { throw new Error('no cups'); } }), { ok: false });
  assert.deepEqual(await listPrinters({}), { ok: false });
  assert.deepEqual(await listPrinters({ getPrintersAsync: async () => 'nope' }), { ok: false });
});

test('a printer chosen and listed gets the job silently with its copies; the system dialog is the way out when it fails or is not listed', async () => {
  const calls = [];
  const contents = (outcome) => ({
    getPrintersAsync: async () => [{ name: 'HP_B', displayName: 'HP B', isDefault: true }],
    print: (options, done) => {
      calls.push(options);
      const [ok, reason] = outcome(options);
      done(ok, reason);
    },
  });
  // Listed, the job goes through: one call, silent, to that printer, three copies.
  assert.deepEqual(await printPage(contents(() => [true, '']), request({ printer: 'HP_B', copies: 3 }), 'fr'), { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].silent, true);
  assert.equal(calls[0].deviceName, 'HP_B');
  assert.equal(calls[0].copies, 3);
  assert.equal(calls[0].pageSize, 'A4');
  // The printer refuses: the system's dialog opens afterwards.
  calls.length = 0;
  assert.deepEqual(await printPage(contents((o) => (o.silent ? [false, 'Printer unavailable'] : [true, ''])), request({ printer: 'HP_B' }), 'fr'), { ok: true });
  assert.deepEqual(calls.map((c) => c.silent), [true, false]);
  assert.equal(calls[1].deviceName, undefined);
  // The person cancels (a silent job has no dialog, but the system may still report it): nothing more is asked of them.
  calls.length = 0;
  assert.deepEqual(await printPage(contents(() => [false, 'Print job canceled']), request({ printer: 'HP_B' }), 'fr'), { ok: false, reason: 'cancelled' });
  assert.equal(calls.length, 1);
  // A name the system no longer lists (a printer unplugged since): the system's dialog, never a silent job to nowhere.
  calls.length = 0;
  assert.deepEqual(await printPage(contents(() => [true, '']), request({ printer: 'Gone' }), 'fr'), { ok: true });
  assert.deepEqual(calls.map((c) => [c.silent, c.deviceName]), [[false, undefined]]);
  // The list cannot be read: the same.
  calls.length = 0;
  const blind = { getPrintersAsync: async () => { throw new Error('x'); }, print: (o, done) => { calls.push(o); done(true, ''); } };
  assert.deepEqual(await printPage(blind, request({ printer: 'HP_B' }), 'fr'), { ok: true });
  assert.deepEqual(calls.map((c) => c.silent), [false]);
});

test('the PDF is written where the panel says, in the orientation asked, and nothing is written when the panel is closed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-print-'));
  const asked = [];
  const pdfOptions = [];
  const contents = { printToPDF: async (o) => { pdfOptions.push(o); return Buffer.from('%PDF-1.7 test'); } };
  const dialogTo = (filePath) => ({ showSaveDialog: async (_w, o) => { asked.push(o); return { canceled: false, filePath }; } });
  const request = { landscape: true, title: 'Blues du dimanche', paper: null, printer: null, copies: 1 };

  const target = path.join(dir, 'grille');
  const done = await savePagePdf({ dialog: dialogTo(target), window: null, contents, request, folder: dir, locale: 'fr' });
  assert.deepEqual(done, { ok: true });
  assert.equal(asked[0].defaultPath, path.join(dir, 'Blues du dimanche.pdf'));
  assert.equal(pdfOptions[0].landscape, true);
  assert.equal(pdfOptions[0].pageSize, 'A4');
  assert.equal(pdfOptions[0].printBackground, false);
  assert.equal(pdfOptions[0].preferCSSPageSize, true, 'the sheets are the pages: their own size, one PDF page each');
  assert.deepEqual(pdfOptions[0].margins, { top: 0, bottom: 0, left: 0, right: 0 });
  assert.equal(fs.readFileSync(`${target}.pdf`, 'latin1'), '%PDF-1.7 test', 'a missing extension is added');

  const cancelled = await savePagePdf({ dialog: { showSaveDialog: async () => ({ canceled: true }) }, window: null, contents, request, folder: dir, locale: 'fr' });
  assert.deepEqual(cancelled, { ok: false, reason: 'cancelled' });
  assert.equal(pdfOptions.length, 1, 'no PDF made for a closed panel');

  const failing = await savePagePdf({ dialog: dialogTo(path.join(dir, 'x.pdf')), window: null, contents: { printToPDF: async () => { throw new Error('no'); } }, request, folder: dir, locale: 'fr' });
  assert.deepEqual(failing, { ok: false, reason: 'failed' });
  const unwritable = await savePagePdf({ dialog: dialogTo(path.join(dir, 'absent', 'x.pdf')), window: null, contents, request, folder: dir, locale: 'en-US' });
  assert.deepEqual(unwritable, { ok: false, reason: 'failed' });
  assert.equal(pdfOptions.at(-1).pageSize, 'Letter');
  // The paper the page asked for wins over the region's.
  await savePagePdf({ dialog: dialogTo(path.join(dir, 'y.pdf')), window: null, contents, request: { ...request, paper: 'A4' }, folder: dir, locale: 'en-US' });
  assert.equal(pdfOptions.at(-1).pageSize, 'A4');
});
