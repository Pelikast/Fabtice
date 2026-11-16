// How the browser checks open « Réglages » (C7), in the form the page is in (computer or phone).
// Everything that needs the window goes through here, so that the way in is written once.
//
// The way in is the menu under the Fabtice logo, « Réglages… » (a drop-down on a computer, the sheet on a
// phone; see lib/menu.mjs). On a phone the window opens on the list of the seven tabs.

import { menuCommand } from './menu.mjs';

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

/** True when the page was opened with touch (`hasTouch`): the checks then touch instead of click. */
export const isTouch = (page) => page.evaluate(() => 'ontouchstart' in window && navigator.maxTouchPoints > 0);

/** Presses a control as the form of the page does: a touch on a phone, a click on a computer. */
export async function press(page, selector) {
  if (await isTouch(page)) await page.tap(selector);
  else await page.click(selector);
}

/** Opens the window (on the tab last seen, or on the list of the tabs on a phone), without choosing a tab. */
export async function openSettings(page) {
  if (await page.locator('[data-testid="reglages"]').count()) return;
  await menuCommand(page, 'Réglages…');
  await page.waitForSelector('[data-testid="reglages"]');
}

/**
 * Opens « Réglages » on `tab` (`general`, `instruments`, `tempo`, `chords`, `metronome`, `display`, `advanced`):
 * the tab is clicked on a computer, the row of the list is touched on a phone. Resolves with the body of the tab.
 */
export async function openSettingsTab(page, tab) {
  await openSettings(page);
  if (await isPhone(page)) {
    // The list of the seven, unless a link already led to a tab.
    if (await page.locator(`[data-testid="reglages"] .reglages-ligne[data-tab="${tab}"]`).count()) await press(page, `.reglages-ligne[data-tab="${tab}"]`);
    else if ((await page.locator('[data-testid="reglages-panneau"]').getAttribute('data-onglet')) !== tab) {
      await press(page, '[data-testid="reglages-retour"]');
      await press(page, `.reglages-ligne[data-tab="${tab}"]`);
    }
  } else {
    await press(page, `[role="tab"][data-tab="${tab}"]`);
  }
  await page.waitForSelector(`[data-testid="reglages-panneau"][data-onglet="${tab}"]`);
  return page.locator('[data-testid="reglages-panneau"]');
}

/** Closes the window by its cross. */
export async function closeSettings(page) {
  await press(page, '[data-testid="reglages-fermer"]');
  await page.waitForSelector('[data-testid="reglages"]', { state: 'detached' });
}
