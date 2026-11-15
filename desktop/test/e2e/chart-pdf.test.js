'use strict';

// « Imprimer la grille » inside the Mac app, end to end. `window.print()` does not
// work in Electron, so the dialog's two actions go through the main process:
//   - « Enregistrer en PDF… » asks where to save (the system's save panel, French,
//     named after the piece), makes the PDF with `printToPDF` in the orientation
//     chosen and writes it; a real file lands on disk: valid header, the page count
//     and the page size of each orientation, the chart's text in it;
//   - « Imprimer… » opens the system's print dialog with the orientation.
// Nothing opens for real: like the audio and iReal Pro tests, the main process gives
// the save panel an answer (`dialog.showSaveDialog` is read at call time, after the
// app's own code has built the panel's options, which the test reads back), and
// `webContents.print` records what it was asked.
//
// Reads the files with `pdfinfo` and `pdftotext` (poppler) when they are installed.
// Build the interface first: npm --prefix ../app run build:desktop
//   xvfb-run -a npm run test:e2e

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { launchInterface, pieceReady, assertClean } = require('./helpers');

// The files are read with poppler where it is installed (here, the Linux
// machines); the Macs of the build have none: page count and page size are then
// read from the PDF itself (Chromium writes its page objects in the clear), and
// the checks on the text are left to the machines that can read it.
const has = (cmd) => {
  if (process.env.FABTICE_NO_POPPLER) return false;
  try {
    execFileSync(cmd, ['-v'], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return e.code !== 'ENOENT';
  }
};
const POPPLER = has('pdfinfo') && has('pdftotext');
const info = (file) => execFileSync('pdfinfo', [file], { encoding: 'utf8' });
const raw = (file) => fs.readFileSync(file).toString('latin1');
/** The page objects of the file, as text (`/Type /Page`, never `/Pages`). */
const pageObjects = (file) => raw(file).split(/\bendobj\b/).filter((o) => /\/Type\s*\/Page(?![s\w])/.test(o));
const pagesOf = (file) => (POPPLER ? Number(/Pages:\s+(\d+)/.exec(info(file))[1]) : pageObjects(file).length);
const sizeOf = (file) => {
  if (POPPLER) {
    const m = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(info(file));
    return [Math.round(Number(m[1])), Math.round(Number(m[2]))];
  }
  const page = pageObjects(file)[0] || raw(file);
  const box = /\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(page) || /\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(raw(file));
  const size = [Math.round(Number(box[3]) - Number(box[1])), Math.round(Number(box[4]) - Number(box[2]))];
  const turned = /\/Rotate\s+(90|270)\b/.test(page);
  return turned ? [size[1], size[0]] : size;
};
/** The text of the file, or null where nothing here can read it. */
const textOf = (file) => (POPPLER ? execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }).replace(/([♭♯])\1/g, '$1') : null);

test('the chart is saved as a PDF from the app, upright and on its side; « Imprimer… » opens the system dialog with the orientation', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-pdf-'));
  const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-pdf-dl-'));
  // `?demo`: the synthetic piece, analysed, with chords and sections (25 bars).
  const { app, page, problems } = await launchInterface({ FABTICE_E2E_QUERY: '?demo', LANG: process.env.LANG || 'C.UTF-8', LC_ALL: process.env.LC_ALL || 'C.UTF-8' }, userData);
  try {
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 60000 });
    await pieceReady(page);
    await page.evaluate(() => window.__fabtice.actions.setViewMode('grille'));
    await page.waitForSelector('[data-testid="imprimer-grille"]', { timeout: 30000 });

    // The paper the app chooses: US Letter in a US region, A4 elsewhere.
    const locale = await app.evaluate(({ app: electronApp }) => electronApp.getLocale());
    const letter = /[-_](US|CA|MX|CL|CO|PH|VE)\b/i.test(locale);
    const paper = letter ? { portrait: [612, 792], landscape: [792, 612] } : { portrait: [595, 842], landscape: [842, 595] };

    // The seam: the save panel answers with a file in the temporary folder, and what it was asked is kept.
    await app.evaluate(({ dialog, BrowserWindow }, dir) => {
      globalThis.__saves = [];
      dialog.showSaveDialog = async (_window, options) => {
        const target = `${dir}/${globalThis.__saves.length + 1}-${options.defaultPath.split('/').pop()}`;
        globalThis.__saves.push({ options, target });
        return { canceled: false, filePath: target };
      };
      globalThis.__prints = [];
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.print = (options, done) => {
          globalThis.__prints.push(options);
          done(true, '');
        };
      }
    }, saveDir);

    async function saveAs(orientation) {
      const before = await app.evaluate(() => globalThis.__saves.length);
      await page.click('[data-testid="imprimer-grille"]');
      await page.waitForSelector('[data-testid="impression"]');
      await page.click(`[data-choix="${orientation === 'landscape' ? 'paysage' : 'portrait'}"]`);
      const pdfButton = await page.textContent('[data-testid="impression-pdf"]');
      assert.equal(pdfButton, 'Enregistrer en PDF…');
      assert.ok(!(await page.textContent('[data-testid="impression"]')).includes('navigateur'), 'in the app, the sentence about the browser is not shown');
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
      await page.keyboard.press('Escape');
      return save.target;
    }

    // 1. Landscape, then portrait: a real PDF each time.
    for (const orientation of ['landscape', 'portrait']) {
      const file = await saveAs(orientation);
      assert.ok(fs.existsSync(file), `${orientation}: the file is on disk`);
      const bytes = fs.readFileSync(file);
      assert.equal(bytes.toString('latin1', 0, 5), '%PDF-', `${orientation}: a PDF header`);
      assert.ok(bytes.toString('latin1', bytes.length - 64).includes('%%EOF'), `${orientation}: complete (ends with %%EOF)`);
      assert.ok(bytes.length > 5000, `${orientation}: not empty (${bytes.length} bytes)`);
      assert.deepEqual(sizeOf(file), paper[orientation], `${orientation}: page size ${sizeOf(file)}`);
      assert.equal(pagesOf(file), 1, `${orientation}: one page for 25 bars`);
      const text = textOf(file);
      if (text !== null) {
        for (const needle of ['Blues du dimanche', 'Tonalité de A♭', '4/4', 'tempo 110', 'pour instrument en Ut', 'Fm7', 'B♭m7', 'E♭7']) {
          assert.ok(text.includes(needle), `${orientation}: « ${needle} » is on the page`);
        }
        assert.ok(!/Exporter|Réglages|Imprimer|Orientation|Taper un accord/.test(text), `${orientation}: nothing of the app on the page`);
      }
      // The page is given back to the interface as it was.
      const after = await page.evaluate(() => ({ mode: window.__fabtice.store.getState().view.mode, rule: !!document.querySelector('style[data-impression="page"]'), attr: document.documentElement.dataset.impression ?? null, dialog: !!document.querySelector('[data-testid="impression"]') }));
      assert.deepEqual(after, { mode: 'grille', rule: false, attr: null, dialog: false }, `${orientation}: the interface is back as it was`);
    }

    // 2. A piece that fills several pages, then fitted to one.
    await page.evaluate(() => {
      const store = window.__fabtice.store;
      store.setState({ project: { ...store.getState().project, duration: 48 * (240 / 110) - 0.2 } });
    });
    await page.waitForTimeout(300);
    const longFile = await saveAs('portrait');
    assert.ok(pagesOf(longFile) >= 2, `48 bars as they are: ${pagesOf(longFile)} pages`);
    await page.click('[data-testid="imprimer-grille"]');
    await page.waitForSelector('[data-testid="impression"]');
    await page.click('[data-choix="une"]');
    await page.click('[data-testid="impression-pdf"]');
    await page.waitForSelector('[data-testid="impression-ok"]', { timeout: 30000 });
    const fitted = (await app.evaluate(() => globalThis.__saves)).at(-1).target;
    assert.equal(pagesOf(fitted), 1, 'fitted to one page: one page');
    const fittedText = textOf(fitted);
    if (fittedText !== null) assert.ok(/\b48\b/.test(fittedText), 'the last bar is on that page');
    await page.keyboard.press('Escape');

    // 3. « Imprimer… »: the system's print dialog, with the orientation; the page is given back.
    await page.click('[data-testid="imprimer-grille"]');
    await page.waitForSelector('[data-testid="impression"]');
    await page.click('[data-choix="paysage"]');
    await page.click('[data-testid="impression-imprimer"]');
    await page.waitForSelector('[data-testid="impression"]', { state: 'detached', timeout: 10000 });
    const prints = await app.evaluate(() => globalThis.__prints);
    assert.equal(prints.length, 1, 'the system print dialog was asked for once');
    assert.equal(prints[0].landscape, true, 'in landscape');
    assert.equal(prints[0].silent, false, 'with its dialog (not silent)');
    assert.equal((await page.evaluate(() => document.documentElement.dataset.impression ?? null)), null, 'the page is back to the screen form');

    // 4. A closed save panel writes nothing and says nothing.
    const written = fs.readdirSync(saveDir).length;
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({ canceled: true });
    });
    await page.click('[data-testid="imprimer-grille"]');
    await page.waitForSelector('[data-testid="impression"]');
    await page.click('[data-testid="impression-pdf"]');
    await page.waitForTimeout(800);
    assert.equal(fs.readdirSync(saveDir).length, written, 'nothing written');
    assert.equal(await page.locator('[data-testid="impression-ok"]').count(), 0, 'no « enregistré »');
    assert.equal(await page.locator('[data-testid="impression"] [role="alert"]').count(), 0, 'no error either');
    assert.equal(await page.locator('[data-testid="impression-pdf"]').isEnabled(), true, 'the dialog is usable again');

    // 5. The bridge refuses what it does not know.
    const refused = await page.evaluate(async () => [await window.fabtice.saveChartPdf({ orientation: 'sideways', title: 'x' }), await window.fabtice.printChart({ orientation: 7 })]);
    assert.deepEqual(refused, [{ ok: false, reason: 'failed' }, { ok: false, reason: 'failed' }]);

    await assertClean(page, problems, 'chart pdf');
  } finally {
    await app.close();
  }
});
