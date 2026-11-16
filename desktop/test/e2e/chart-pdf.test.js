'use strict';

// « Imprimer la grille » inside the Mac app, end to end. `window.print()` does not
// work in Electron, so the window's two actions go through the main process:
//   - « Enregistrer en PDF » asks where to save (the system's save panel, French,
//     named after the piece), makes the PDF with `printToPDF` in the paper and the
//     orientation chosen and writes it: a real file lands on disk, valid header,
//     the paper's size, and EXACTLY THE PAGES OF THE PREVIEW (the same number, the
//     same text on each: the preview and the paper are the same sheets);
//   - « Imprimer » prints to the printer chosen in the window, with its copies, when
//     the system lists printers; with no printer listed (or when the printer does
//     not take the job) the system's own print dialog opens, as before.
// Nothing opens or prints for real: like the audio and iReal Pro tests, the main
// process gives the save panel an answer (`dialog.showSaveDialog` is read at call
// time, after the app's own code has built the panel's options, which the test
// reads back), and `webContents.print` and `getPrintersAsync` are stood in for.
//
// The PDF is read here (app/tests/pdf-read.mjs): no poppler is needed, and where it
// is installed it is only a cross-check (FABTICE_NO_POPPLER=1 leaves it out).
// Build the interface first: npm --prefix ../app run build:desktop
//   xvfb-run -a npm run test:e2e

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { launchInterface, pieceReady, assertClean } = require('./helpers');

const has = (cmd) => {
  if (process.env.FABTICE_NO_POPPLER) return false;
  try {
    execFileSync(cmd, ['-v'], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return e.code !== 'ENOENT';
  }
};
const POPPLER = has('pdfinfo');

const DIALOG = '[data-testid="impression"]';
// Paper in points, as a PDF says it.
const PT = { a4: [595, 842], lettre: [612, 792] };

test('the sheets of the print window are saved as a PDF from the app, page for page; « Imprimer » goes to the chosen printer or opens the system dialog', async () => {
  const { readPdf, sameCharacters, differences } = await import(pathToFileURL(path.join(__dirname, '..', '..', '..', 'app', 'tests', 'pdf-read.mjs')).href);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-pdf-'));
  const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-pdf-dl-'));
  // `?demo`: the synthetic piece, analysed, with chords and sections (25 bars).
  const { app, page, problems } = await launchInterface({ FABTICE_E2E_QUERY: '?demo', LANG: process.env.LANG || 'C.UTF-8', LC_ALL: process.env.LC_ALL || 'C.UTF-8' }, userData);
  try {
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 60000 });
    await pieceReady(page);
    await page.evaluate(() => window.__fabtice.actions.setViewMode('grille'));
    await page.waitForSelector('[data-testid="imprimer-grille"]', { timeout: 30000 });

    // The seam: the save panel answers with a file in the temporary folder, and what it was asked is kept;
    // the printers are the test's, and a print is recorded, never made.
    await app.evaluate(({ dialog, BrowserWindow }, dir) => {
      globalThis.__saves = [];
      dialog.showSaveDialog = async (_window, options) => {
        const target = `${dir}/${globalThis.__saves.length + 1}-${options.defaultPath.split('/').pop()}`;
        globalThis.__saves.push({ options, target });
        return { canceled: false, filePath: target };
      };
      globalThis.__prints = [];
      globalThis.__printers = [];
      globalThis.__printOutcome = () => [true, ''];
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.print = (options, done) => {
          globalThis.__prints.push(options);
          const [ok, reason] = globalThis.__printOutcome(options);
          done(ok, reason);
        };
        w.webContents.getPrintersAsync = async () => globalThis.__printers;
      }
    }, saveDir);

    const openWindow = async () => {
      await page.click('[data-testid="imprimer-grille"]');
      await page.waitForSelector(DIALOG);
      await page.waitForTimeout(250);
    };
    const choose = async (id) => {
      await page.click(`${DIALOG} [data-choix="${id}"]`);
      await page.waitForTimeout(120);
    };
    // FABTICE_E2E_SHOTS=<folder> keeps screenshots of the window in the app (for the reports; nothing is asserted on them).
    const shot = async (name) => {
      if (!process.env.FABTICE_E2E_SHOTS) return;
      fs.mkdirSync(process.env.FABTICE_E2E_SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.FABTICE_E2E_SHOTS, `impression-app-mac-${name}.png`) });
    };
    const sheets = () => page.$$eval('.pp-papier', (els) => els.map((e) => e.textContent));
    const setBars = (bars) =>
      page.evaluate((n) => {
        const store = window.__fabtice.store;
        store.setState({ project: { ...store.getState().project, duration: n * (240 / 110) - 0.2 } });
      }, bars);

    /** « Enregistrer en PDF » with the window as it is; returns the file. */
    async function savePdf() {
      const before = await app.evaluate(() => globalThis.__saves.length);
      await page.click('[data-testid="impression-pdf"]');
      await page.waitForSelector('[data-testid="impression-ok"]', { timeout: 30000 });
      const saves = await app.evaluate(() => globalThis.__saves);
      assert.equal(saves.length, before + 1, 'the save panel was asked once');
      const save = saves[saves.length - 1];
      // The panel: French, the piece's name, PDF.
      assert.equal(save.options.title, 'Enregistrer la grille en PDF');
      assert.equal(save.options.buttonLabel, 'Enregistrer');
      assert.equal(path.basename(save.options.defaultPath), 'Blues du dimanche.pdf');
      assert.deepEqual(save.options.filters, [{ name: 'Document PDF', extensions: ['pdf'] }]);
      return save.target;
    }

    /** The file is a real PDF with the pages of the preview: same count, the paper's size, the same text on each. */
    async function assertSheets(file, label, expected) {
      assert.ok(fs.existsSync(file), `${label}: the file is on disk`);
      const bytes = fs.readFileSync(file);
      assert.equal(bytes.toString('latin1', 0, 5), '%PDF-', `${label}: a PDF header`);
      assert.ok(bytes.toString('latin1', bytes.length - 64).includes('%%EOF'), `${label}: complete (ends with %%EOF)`);
      assert.ok(bytes.length > 5000, `${label}: not empty (${bytes.length} bytes)`);
      const preview = await sheets();
      const pdf = readPdf(bytes);
      assert.equal(preview.length, expected.pages, `${label}: the preview has ${expected.pages} page(s)`);
      assert.equal(pdf.length, preview.length, `${label}: the PDF has the pages of the preview (${preview.length}), not ${pdf.length}`);
      const [w, h] = expected.orientation === 'paysage' ? [PT[expected.paper][1], PT[expected.paper][0]] : PT[expected.paper];
      pdf.forEach((p, i) => {
        assert.ok(Math.abs(p.size[0] - w) <= 1 && Math.abs(p.size[1] - h) <= 1, `${label}: page ${i + 1} is ${p.size} not ${w} × ${h}`);
        assert.ok(sameCharacters(preview[i], p.text), `${label}: page ${i + 1} has the text of its preview (${differences(preview[i], p.text)})`);
      });
      if (POPPLER) assert.equal(Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [file], { encoding: 'utf8' }))[1]), pdf.length, `${label}: poppler counts the same pages`);
      // The accidentals are drawn with a stroke, which a PDF writes twice.
      const all = pdf.map((p) => p.text).join(' ').replace(/\s+/g, '').replace(/([♭♯])\1+/g, '$1');
      for (const needle of expected.words || []) assert.ok(all.includes(needle.replace(/\s+/g, '')), `${label}: « ${needle} » is on the pages`);
      assert.ok(!/Exporter|Réglages|Imprimer|Orientation|Tapezunaccord/.test(all), `${label}: nothing of the app on the pages`);
      return pdf;
    }

    // 1. A4 upright, then Letter on its side: a real PDF each time, the pages of the preview.
    await openWindow();
    assert.equal(await page.textContent('[data-testid="impression-pdf"]'), 'Enregistrer en PDF');
    assert.equal(await page.textContent('[data-testid="impression-imprimer"]'), 'Imprimer');
    assert.ok(!(await page.textContent(DIALOG)).includes('navigateur'), 'in the app, the sentence about the browser is not shown');
    await choose('a4');
    await choose('portrait');
    await shot('une-page');
    const words = ['Blues du dimanche', 'Tonalité de A♭', '4/4', 'tempo 110', 'pour instrument en Ut', 'Fm7', 'B♭m7', 'E♭7'];
    await assertSheets(await savePdf(), 'A4 upright', { paper: 'a4', orientation: 'portrait', pages: 1, words });
    await choose('lettre');
    await choose('paysage');
    await assertSheets(await savePdf(), 'Letter on its side', { paper: 'lettre', orientation: 'paysage', pages: 1, words });
    // The window stays as it was after saving (the sheets are the window's own: nothing to give back).
    assert.deepEqual(
      await page.evaluate(() => ({ mode: window.__fabtice.store.getState().view.mode, rule: !!document.querySelector('style[data-impression="page"]'), dialog: !!document.querySelector('[data-testid="impression"]') })),
      { mode: 'grille', rule: true, dialog: true },
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector(DIALOG, { state: 'detached' });
    assert.deepEqual(await page.evaluate(() => ({ rule: !!document.querySelector('style[data-impression="page"]'), mark: document.documentElement.dataset.imprime ?? null })), { rule: false, mark: null }, 'closing the window takes the page rule away');

    // 2. A piece that fills several pages, then fitted to one, then at a reduced scale.
    await setBars(104);
    await page.waitForTimeout(300);
    await openWindow();
    await choose('a4');
    await choose('portrait');
    await shot('plusieurs-pages');
    await assertSheets(await savePdf(), '104 bars, A4 upright', { paper: 'a4', orientation: 'portrait', pages: 3 });
    await page.click('[data-testid="impression-une-page"]');
    await page.waitForTimeout(200);
    await assertSheets(await savePdf(), '104 bars fitted to one page', { paper: 'a4', orientation: 'portrait', pages: 1 });
    await page.click('[data-testid="impression-une-page"]');
    await choose('paysage');
    await page.selectOption('[data-testid="impression-echelle"]', '60');
    await page.waitForTimeout(200);
    await shot('paysage');
    await assertSheets(await savePdf(), '104 bars, A4 on its side at 60 %', { paper: 'a4', orientation: 'paysage', pages: 2 });
    await page.selectOption('[data-testid="impression-echelle"]', '100');
    await choose('portrait');
    await page.keyboard.press('Escape');
    await page.waitForSelector(DIALOG, { state: 'detached' });
    await setBars(25);

    // 3. « Imprimer » with no printer listed: the system's dialog (not silent), with the paper, the orientation and no margin.
    await openWindow();
    assert.equal(await page.locator('[data-testid="impression-imprimante"]').count(), 0, 'no printer listed: no choice of printer');
    await choose('lettre');
    await choose('paysage');
    await page.click('[data-testid="impression-imprimer"]');
    await page.waitForSelector(DIALOG, { state: 'detached', timeout: 10000 });
    let prints = await app.evaluate(() => globalThis.__prints);
    assert.equal(prints.length, 1, 'the system print dialog was asked for once');
    assert.equal(prints[0].silent, false, 'with its dialog (not silent)');
    assert.equal(prints[0].landscape, true, 'in landscape');
    assert.equal(prints[0].pageSize, 'Letter', 'on Letter');
    assert.deepEqual(prints[0].margins, { marginType: 'none' }, 'no margin of its own (the sheets have theirs)');
    assert.equal(prints[0].deviceName, undefined);

    // 4. With printers listed: the printer and the copies are chosen in the window, and the job goes there silently.
    await app.evaluate(() => {
      globalThis.__prints.length = 0;
      globalThis.__printers = [
        { name: 'Canon_Studio', displayName: 'Canon Studio', isDefault: false },
        { name: 'HP_Salon', displayName: 'HP Salon', isDefault: true },
      ];
    });
    await openWindow();
    const options = await page.$$eval('[data-testid="impression-imprimante"] select option', (els) => els.map((e) => [e.value, e.textContent]));
    assert.deepEqual(options, [['HP_Salon', 'HP Salon (par défaut)'], ['Canon_Studio', 'Canon Studio']], 'the default printer comes first');
    await shot('imprimantes');
    await page.selectOption('[data-testid="impression-imprimante"] select', 'Canon_Studio');
    await page.fill('[data-testid="impression-copies"]', '3');
    await choose('a4');
    await choose('portrait');
    await page.click('[data-testid="impression-imprimer"]');
    await page.waitForSelector(DIALOG, { state: 'detached', timeout: 10000 });
    prints = await app.evaluate(() => globalThis.__prints);
    assert.equal(prints.length, 1);
    assert.equal(prints[0].silent, true, 'to the printer chosen, with no second window');
    assert.equal(prints[0].deviceName, 'Canon_Studio');
    assert.equal(prints[0].copies, 3);
    assert.equal(prints[0].pageSize, 'A4');
    assert.equal(prints[0].landscape, false);
    // The printer is remembered; the copies start again at one.
    await openWindow();
    assert.equal(await page.inputValue('[data-testid="impression-imprimante"] select'), 'Canon_Studio', 'the last printer is remembered');
    assert.equal(await page.inputValue('[data-testid="impression-copies"]'), '1', 'one copy by default');
    // The page said what it wants; the main process checks it: an unlisted name is not printed to.
    const odd = await page.evaluate(async () => [
      await window.fabtice.printChart({ orientation: 'portrait', printer: 'Gone', copies: 2 }),
      await window.fabtice.printChart({ orientation: 'portrait', printer: 'HP_Salon', copies: 1e9 }),
    ]);
    assert.deepEqual(odd, [{ ok: true }, { ok: true }]);
    prints = await app.evaluate(() => globalThis.__prints.slice(1));
    assert.deepEqual(prints.map((p) => [p.silent, p.deviceName ?? null, p.copies ?? null]), [[false, null, null], [true, 'HP_Salon', 1]], 'an unlisted printer opens the system dialog; absurd copies are one copy');

    // 5. The printer does not take the job: the system's dialog opens after it.
    await app.evaluate(() => {
      globalThis.__prints.length = 0;
      globalThis.__printOutcome = (options) => (options.silent ? [false, 'Printer unavailable'] : [true, '']);
    });
    await page.click('[data-testid="impression-imprimer"]');
    await page.waitForSelector(DIALOG, { state: 'detached', timeout: 10000 });
    prints = await app.evaluate(() => globalThis.__prints);
    assert.deepEqual(prints.map((p) => p.silent), [true, false], 'the silent job failed: the system dialog follows');
    // The person cancels the system's dialog: the window stays, with nothing said.
    await app.evaluate(() => {
      globalThis.__prints.length = 0;
      globalThis.__printers = [];
      globalThis.__printOutcome = () => [false, 'Print job canceled'];
    });
    await openWindow();
    await page.click('[data-testid="impression-imprimer"]');
    await page.waitForTimeout(800);
    assert.equal(await page.locator(DIALOG).count(), 1, 'cancelled: the window stays');
    assert.equal(await page.locator(`${DIALOG} [role="alert"]`).count(), 0, 'cancelled: no error said');
    assert.equal(await page.locator('[data-testid="impression-imprimer"]').isEnabled(), true, 'the window is usable again');
    // Another failure is said.
    await app.evaluate(() => {
      globalThis.__printOutcome = () => [false, 'Invalid printer settings'];
    });
    await page.click('[data-testid="impression-imprimer"]');
    await page.waitForSelector(`${DIALOG} [role="alert"]`, { timeout: 5000 });

    // 6. A closed save panel writes nothing and says nothing.
    const written = fs.readdirSync(saveDir).length;
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({ canceled: true });
    });
    await page.click('[data-testid="impression-pdf"]');
    await page.waitForTimeout(800);
    assert.equal(fs.readdirSync(saveDir).length, written, 'nothing written');
    assert.equal(await page.locator('[data-testid="impression-ok"]').count(), 0, 'no « enregistré »');
    assert.equal(await page.locator('[data-testid="impression-pdf"]').isEnabled(), true, 'the window is usable again');
    await page.keyboard.press('Escape');
    await page.waitForSelector(DIALOG, { state: 'detached' });

    // 7. The bridge refuses what it does not know.
    const refused = await page.evaluate(async () => [
      await window.fabtice.saveChartPdf({ orientation: 'sideways', title: 'x' }),
      await window.fabtice.printChart({ orientation: 7 }),
      await window.fabtice.printChart({ orientation: 'portrait', paper: 'A3' }),
      await window.fabtice.saveChartPdf({ orientation: 'portrait', paper: 'Tabloid', title: 'x' }),
      await window.fabtice.printChart({ orientation: 'portrait', printer: 42 }),
    ]);
    assert.deepEqual(refused, Array(5).fill({ ok: false, reason: 'failed' }));
    // The list of printers answers with data, never rejects.
    const listed = await page.evaluate(() => window.fabtice.listPrinters());
    assert.deepEqual(listed, { ok: true, printers: [] });

    await assertClean(page, problems, 'chart pdf');
  } finally {
    await app.close();
  }
});
