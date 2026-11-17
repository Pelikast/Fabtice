// The captures of the update (C16) for `npm run captures` (stage 6): on a computer, the Mac app's message at
// opening, its progress, a failure, the place where it cannot work and the section of Réglages → Général; on a
// phone (the web app only), the message « Une nouvelle version de Fabtice est prête » and the section. Named
// `<form>-maj-…`.
//
// It is not run on its own: `tests/captures.mjs` calls it for each form, giving what its own sections use:
//
//   import { updateCaptures } from './captures-maj.mjs';
//   ...
//   ['mise à jour', (form) => updateCaptures(form, { browser, openPage, snap, contextOptions, press })],

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A scripted Mac app with the update's methods; `window.__maj.emit(patch)` plays the main process. */
function installUpdateBridge() {
  const none = () => () => {};
  const listeners = new Set();
  const maj = {
    state: { current: '1.0.0', phase: 'idle', origin: null, seq: 0, available: null, blocked: null, progress: null, error: null, room: null },
    emit(patch) {
      maj.state = { ...maj.state, ...patch };
      for (const l of listeners) l(maj.state);
    },
  };
  window.__maj = maj;
  window.fabtice = {
    systemInfo: async () => null,
    ytdlpStatus: async () => ({ source: 'managed', path: '/x/yt-dlp', installed: true, attempts: [] }),
    ytdlpCheck: async () => ({ skipped: true, reason: 'test', attempts: [] }),
    ytdlpInstall: async () => ({ ok: true, meta: {}, attempts: [] }),
    extract: async () => ({ ok: false, code: 'link-failed' }),
    copyText: async () => true,
    onYtdlpProgress: none,
    onExtractProgress: none,
    updateStatus: async () => maj.state,
    checkForUpdate: async () => maj.state,
    startUpdate: async () => ({ ok: true }),
    cancelUpdate: async () => true,
    openUpdatePage: async () => true,
    onUpdateState: (cb) => (listeners.add(cb), () => listeners.delete(cb)),
  };
}

const AVAILABLE = {
  phase: 'available',
  origin: 'launch',
  available: {
    version: '1.0.1',
    publishedAt: '2026-12-01T10:00:00Z',
    size: 121_400_000,
    notes: [
      '### Plus simple',
      '- **Mise à jour en un bouton** : l’app se met à jour toute seule et se rouvre dans la nouvelle version.',
      '- Les accords des standards sont mieux reconnus.',
      '',
      '### Corrigé',
      '- La grille ne s’écrit plus plus petit dans certaines mesures à deux accords.',
      '- Le son du Mac n’est plus bloqué après une longue pause.',
      '- L’export pour Logic Pro garde les signatures rythmiques.',
    ].join('\n'),
  },
};

export async function updateCaptures(form, { browser, openPage, snap, contextOptions }) {
  if (!form.phone) {
    const context = await browser.newContext(contextOptions(form));
    await context.addInitScript(installUpdateBridge);
    const page = await openPage(context, '?debug');
    const emit = (patch) => page.evaluate((p) => window.__maj.emit(p), patch);
    await emit({ ...AVAILABLE, seq: 1 });
    await page.waitForSelector('[data-testid="maj-message"][data-etat="available"]');
    await snap(page, form, 'maj-message');
    await emit({ phase: 'downloading', progress: { fraction: 0.42, received: 51_000_000, total: 121_400_000 } });
    await snap(page, form, 'maj-progres');
    await emit({ phase: 'available', progress: null, error: { code: 'damaged', during: 'update' } });
    await snap(page, form, 'maj-erreur');
    await emit({ error: null, blocked: { code: 'translocated' } });
    await snap(page, form, 'maj-emplacement');
    await emit({ blocked: null, phase: 'up-to-date', origin: 'menu', seq: 2, available: null });
    await page.waitForSelector('[data-testid="maj-message"][data-etat="up-to-date"]');
    await snap(page, form, 'maj-a-jour');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__fabtice.actions.openSettings('general'));
    await page.waitForSelector('[data-testid="maj-section"]');
    await emit({ ...AVAILABLE, origin: 'page', seq: 3 });
    await page.locator('[data-testid="maj-section"]').scrollIntoViewIfNeeded();
    await snap(page, form, 'maj-reglages');
    await emit({ phase: 'downloading', progress: { fraction: 0.63, received: 76_500_000, total: 121_400_000 } });
    await sleep(200);
    await snap(page, form, 'maj-reglages-progres');
    await context.close();
  }
  // The web app (both forms; the phone only has this one): a new version of the site waiting.
  {
    const context = await browser.newContext(contextOptions(form));
    const page = await openPage(context, '?debug');
    await page.evaluate(() => {
      const h = window.__fabticeUpdate;
      h.store.setState({ mode: 'web', web: { phase: 'ready', error: null } });
      h.want('launch');
    });
    await page.waitForSelector('[data-testid="maj-message"][data-etat="web-ready"]');
    await snap(page, form, 'maj-web-message');
    await page.evaluate(() => window.__fabticeUpdate.closeUpdateMessage());
    await page.evaluate(() => window.__fabtice.actions.openSettings('general'));
    await page.waitForSelector('[data-testid="maj-section"]');
    await page.locator('[data-testid="maj-section"]').scrollIntoViewIfNeeded();
    await snap(page, form, 'maj-web-reglages');
    await context.close();
  }
}
