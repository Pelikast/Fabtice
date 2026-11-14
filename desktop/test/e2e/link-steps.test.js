'use strict';

// A link import tells the truth about what it is doing.
//
// It used to sit at « Téléchargement du son… 0 % » for a minute or two on a slow
// Mac: the percentage was announced before yt-dlp had even started. Now the
// dialog goes through honest steps (looking up, preparing the download, then a
// real percentage, or the amount received when the size is unknown, then
// decoding) and never shows a figure it does not have. The stub yt-dlp can start
// slowly (FABTICE_STUB_START_DELAY_MS) and print the progress of a download
// whose size is unknown (FABTICE_STUB_PROGRESS=unknown).
//
// It also checks the diagnostic window's « Copier le rapport du dernier import ».
//
// Build the interface first: npm --prefix ../app run build:desktop

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, launchInterface: launch, pieceReady, assertClean, openDiagnostic } = require('./helpers');

const STUB = path.join(ROOT, 'test', 'fixtures', 'stub-yt-dlp.js');
const LINK = 'https://youtu.be/dQw4w9WgXcQ';

const userDataDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-steps-'));

async function importLink(page) {
  await page.locator('.accueil input[type="url"]').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.accueil input[type="url"]').fill(LINK);
  await page.getByRole('button', { name: 'Importer' }).click();
  await pieceReady(page);
}

test('slow start, known size: preparation first (no figure), then real percentages, then decoding', async () => {
  const userData = userDataDir();
  const { app, page, problems } = await launch(
    { FABTICE_YTDLP_PATH: STUB, FABTICE_STUB_MODE: 'dash', FABTICE_STUB_START_DELAY_MS: '2500', FABTICE_STUB_PROGRESS_GAP_MS: '250' },
    userData,
  );
  try {
    const started = Date.now();
    await importLink(page);
    const seen = await page.evaluate(() => window.__seenFull);
    console.log(`steps seen (${((Date.now() - started) / 1000).toFixed(1)} s): ${JSON.stringify(seen)}`);

    const index = (re) => seen.findIndex((s) => re.test(s));
    const lookup = index(/^Recherche du morceau/);
    const prepare = index(/^Préparation du téléchargement/);
    const download = index(/^Téléchargement du son/);
    const decode = index(/^Préparation du son/);
    assert.ok(lookup >= 0, 'looking up is shown');
    assert.ok(prepare > lookup, 'then the preparation of the download');
    assert.ok(download > prepare, 'then the download, only after the preparation');
    assert.ok(decode > download, 'then the decoding');

    // Everything before a real progress line carries no figure at all.
    for (const s of seen.slice(0, download)) assert.ok(!s.includes('%'), `no figure before the first real progress line: « ${s} »`);
    // The preparation is not a frozen « 0 % »: the first percentage shown is the one yt-dlp printed (0.0 %), after it.
    assert.match(seen[download], /Téléchargement du son…\s*0 %/);
    const percents = seen.filter((s) => /^Téléchargement du son/.test(s)).map((s) => Number(/(\d+) %/.exec(s)[1]));
    assert.deepEqual(percents, [...percents].sort((a, b) => a - b), `percentages only go up: ${percents}`);
    assert.equal(percents.at(-1), 100);
    // While preparing, the sentence about « une à deux minutes » is not shown yet (it is not ten seconds).
    assert.ok(!seen.some((s) => s.includes('une à deux minutes')));
    await assertClean(page, problems, 'slow start');
  } finally {
    await app.close();
  }
});

test('unknown size: the amount received, never a percentage while downloading', async () => {
  const userData = userDataDir();
  const { app, page, problems } = await launch(
    { FABTICE_YTDLP_PATH: STUB, FABTICE_STUB_MODE: 'dash', FABTICE_STUB_PROGRESS: 'unknown', FABTICE_STUB_PROGRESS_GAP_MS: '250' },
    userData,
  );
  try {
    await importLink(page);
    const seen = await page.evaluate(() => window.__seenFull);
    console.log(`steps seen: ${JSON.stringify(seen)}`);
    const downloading = seen.filter((s) => /^Téléchargement du son/.test(s));
    assert.ok(downloading.length >= 2, `amounts shown: ${JSON.stringify(downloading)}`);
    for (const s of downloading.slice(0, -1)) {
      assert.match(s, /reçus$/, s);
      assert.ok(!s.includes('%'), s);
    }
    for (const s of seen.filter((x) => /^(Recherche|Préparation du téléchargement)/.test(x))) assert.ok(!s.includes('%'), s);
    await assertClean(page, problems, 'unknown size');
  } finally {
    await app.close();
  }
});

test('the diagnostic window copies the report of the last import made from the interface', async () => {
  const userData = userDataDir();
  const env = { FABTICE_YTDLP_PATH: STUB, FABTICE_STUB_MODE: 'dash', FABTICE_STUB_START_DELAY_MS: '600', FABTICE_STUB_PROGRESS_GAP_MS: '50' };
  let first;
  {
    const { app, page } = await launch(env, userData);
    try {
      // Nothing imported yet: the button says so, plainly.
      const diagnostic = await openDiagnostic(app);
      await diagnostic.getByRole('button', { name: 'Copier le rapport du dernier import' }).click();
      await diagnostic.waitForFunction(() => document.querySelector('#report-status').textContent.length > 0);
      assert.match(await diagnostic.locator('#report-status').innerText(), /Aucun import n’a encore été fait depuis l’interface/);
      await diagnostic.close();

      await importLink(page);
      const second = await openDiagnostic(app);
      await second.getByRole('button', { name: 'Copier le rapport du dernier import' }).click();
      await second.waitForFunction(() => /Rapport copié/.test(document.querySelector('#report-status').textContent));
      const shown = await second.locator('#report-text').innerText();
      const clipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
      assert.equal(clipboard.trimEnd(), shown.trimEnd(), 'what is shown is what was copied');
      assert.match(clipboard, /^Rapport du dernier import fait depuis l’interface/);
      assert.match(clipboard, /Résultat : réussi/);
      assert.match(clipboard, /Recherche du morceau/);
      assert.match(clipboard, /démarrage de yt-dlp \(premier message après\) : [\d,]+ s/);
      assert.match(clipboard, /temps avant la première ligne de progression : [\d,]+ s/);
      assert.match(clipboard, /téléchargement proprement dit : .* soit [\d,]+ Mo\/s/);
      assert.ok(!clipboard.includes(os.homedir()), 'the home folder is replaced');
      first = clipboard;
    } finally {
      await app.close();
    }
  }
  // After a restart the last report is still there (it was kept in the user-data folder).
  {
    const { app } = await launch(env, userData);
    try {
      const diagnostic = await openDiagnostic(app);
      await diagnostic.getByRole('button', { name: 'Copier le rapport du dernier import' }).click();
      await diagnostic.waitForFunction(() => /Rapport copié/.test(document.querySelector('#report-status').textContent));
      assert.equal((await diagnostic.locator('#report-text').innerText()).trimEnd(), first.trimEnd());
    } finally {
      await app.close();
    }
  }
});
