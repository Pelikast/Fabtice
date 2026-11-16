// How the browser checks open « Réglages » (C7), in the form the page is in (computer or phone).
// Everything that needs the window goes through here, so that the way in is written once.
//
// Today the way in is the « Réglages » button of the top bar (« ⋯ » on a phone). When the menu under the
// Fabtice logo takes over, only `openSettings` below has to change.

export const SETTINGS_TABS = ['general', 'instruments', 'tempo', 'chords', 'metronome', 'display', 'advanced'];
export const SETTINGS_LABELS = {
  general: 'Général',
  instruments: 'Instruments',
  tempo: 'Tempo et analyse',
  chords: 'Détection des accords',
  metronome: 'Métronome',
  display: 'Affichage',
  advanced: 'Avancé',
};

/** True when the page is laid out as a phone (760 px and below), as the interface itself decides. */
export const isPhone = (page) => page.evaluate(() => window.matchMedia('(max-width: 760px)').matches);

/** Opens the window (on the tab last seen, or on the list of the tabs on a phone), without choosing a tab. */
export async function openSettings(page) {
  if (await page.locator('[data-testid="reglages"]').count()) return;
  const tap = (await page.evaluate(() => 'ontouchstart' in window && navigator.maxTouchPoints > 0)) ? 'tap' : 'click';
  await page[tap]((await isPhone(page)) ? '.menu-plus' : 'button.menu:has-text("Réglages")');
  await page.waitForSelector('[data-testid="reglages"]');
}

/**
 * Opens « Réglages » on `tab` (`general`, `instruments`, `tempo`, `chords`, `metronome`, `display`, `advanced`):
 * the tab is clicked on a computer, the row of the list is touched on a phone. Resolves with the body of the tab.
 */
export async function openSettingsTab(page, tab) {
  await openSettings(page);
  const tap = (await page.evaluate(() => 'ontouchstart' in window && navigator.maxTouchPoints > 0)) ? 'tap' : 'click';
  const phone = await isPhone(page);
  if (phone) {
    // The list of the seven, unless a link already led to a tab.
    if (await page.locator(`[data-testid="reglages"] .reglages-ligne[data-tab="${tab}"]`).count()) await page[tap](`.reglages-ligne[data-tab="${tab}"]`);
    else if ((await page.locator('[data-testid="reglages-panneau"]').getAttribute('data-onglet')) !== tab) {
      await page[tap]('[data-testid="reglages-retour"]');
      await page[tap](`.reglages-ligne[data-tab="${tab}"]`);
    }
  } else {
    await page[tap](`[role="tab"][data-tab="${tab}"]`);
  }
  await page.waitForSelector(`[data-testid="reglages-panneau"][data-onglet="${tab}"]`);
  return page.locator('[data-testid="reglages-panneau"]');
}

/** Closes the window by its cross. */
export async function closeSettings(page) {
  const tap = (await page.evaluate(() => 'ontouchstart' in window && navigator.maxTouchPoints > 0)) ? 'tap' : 'click';
  await page[tap]('[data-testid="reglages-fermer"]');
  await page.waitForSelector('[data-testid="reglages"]', { state: 'detached' });
}
