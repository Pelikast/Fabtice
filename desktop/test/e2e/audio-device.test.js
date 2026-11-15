'use strict';

// The audio output inside the Mac app (owner's report of 15 November: the
// Mac's sound stuck after Fabtice had been open a long time). No real sound
// here (Linux, no audio device: Chromium's fake output runs the context), and
// no real sleep: the test makes Electron's powerMonitor emit its events.
//   - the Mac goes to sleep while playing: the page pauses and CLOSES its
//     audio context (the output goes back to the system); play opens it again;
//   - the same while idle; the wake is forwarded too;
//   - the audio journal gathers the page's events and the main process's,
//     shows up in Aide → Diagnostic… with « Copier le journal audio », and is
//     written to the user-data folder (it must survive a restart of the Mac).
// Build the interface first: npm --prefix ../app run build:desktop
//   xvfb-run -a npm run test:e2e

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchInterface, pieceReady, openDiagnostic } = require('./helpers');

const device = (page) => page.evaluate(() => ({ ...window.__fabtice.engine.deviceState(), state: window.__fabtice.engine.getState() }));

test('sleep and wake give the audio output back; the audio journal reaches the diagnostic window and the disk', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-e2e-audio-'));
  const { app, page } = await launchInterface({ FABTICE_E2E_QUERY: '?demo' }, userData);
  try {
    await page.waitForFunction(() => window.__fabtice && window.__fabtice.store.getState().transport.engine === 'ready', null, { timeout: 60000 });
    await pieceReady(page);
    assert.equal(await page.evaluate(() => typeof window.fabtice.onPower), 'function');

    // Playing, then the Mac goes to sleep: paused where it was, the context closed.
    await page.locator('button.jouer').click();
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'playing', null, { timeout: 30000 });
    await page.waitForTimeout(500);
    await app.evaluate(({ powerMonitor }) => powerMonitor.emit('suspend'));
    await page.waitForFunction(() => !window.__fabtice.engine.deviceState().held, null, { timeout: 10000 });
    const slept = await device(page);
    assert.equal(slept.state, 'ready');
    assert.equal(slept.context, 'none');
    const at = await page.evaluate(() => window.__fabtice.engine.getPosition());
    assert.ok(at > 0.3, `position kept (${at})`);

    // Wake: nothing starts by itself. Play opens a new context and goes on from there.
    await app.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'));
    await page.waitForTimeout(300);
    assert.equal((await device(page)).state, 'ready');
    await page.locator('button.jouer').click();
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'playing' && window.__fabtice.engine.deviceState().held, null, { timeout: 30000 });
    const resumedAt = await page.evaluate(() => window.__fabtice.engine.getPosition());
    assert.ok(Math.abs(resumedAt - at) < 1, `resumed near ${at} (${resumedAt})`);
    await page.locator('button.jouer').click();
    await page.waitForFunction(() => window.__fabtice.engine.getState() === 'ready', null, { timeout: 10000 });

    // Idle, the screen locked: released too.
    await app.evaluate(({ powerMonitor }) => powerMonitor.emit('lock-screen'));
    await page.waitForFunction(() => !window.__fabtice.engine.deviceState().held, null, { timeout: 10000 });

    // The journal: in the diagnostic window, from both sides, and copied.
    const diag = await openDiagnostic(app);
    await diag.waitForFunction(() => /Le Mac se met en veille/.test(document.getElementById('audio-journal-text').textContent), null, { timeout: 15000 });
    const text = await diag.locator('#audio-journal-text').innerText();
    assert.match(text, /=== Fabtice — journal audio ===/);
    assert.match(text, /\[système\] Fabtice démarre/);
    assert.match(text, /\[système\] Le Mac sort de veille/);
    assert.match(text, /\[interface\] Sortie audio ouverte : contexte à 48000 Hz/);
    assert.match(text, /\[interface\] Sortie audio rendue au système \(mise en veille, la lecture a été mise en pause\)/);
    assert.match(text, /\[interface\] Sortie audio rendue au système \(écran verrouillé\)/);
    assert.match(text, /Dernière lecture réussie : \d{4}-\d\d-\d\d/);
    assert.doesNotMatch(text, new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await app.evaluate(({ clipboard }) => clipboard.writeText(''));
    await diag.locator('#copy-audio-journal').click();
    await diag.waitForFunction(() => /copié/.test(document.getElementById('audio-journal-status').textContent), null, { timeout: 10000 });
    assert.match(await app.evaluate(({ clipboard }) => clipboard.readText()), /=== Fabtice — journal audio ===/);
    // « Copier le diagnostic » carries it too.
    assert.match(await diag.locator('#diag-text').innerText(), /--- Journal audio ---\n=== Fabtice — journal audio ===/);

    // Kept on disk, for after a restart.
    const file = path.join(userData, 'audio-journal.json');
    const deadline = Date.now() + 10000;
    while (!fs.existsSync(file) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    const kept = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(kept.entries.some((e) => e.event === 'sleep'));
    assert.ok(kept.entries.some((e) => e.source === 'page' && e.event === 'release'));
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
