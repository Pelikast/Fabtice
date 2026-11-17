// The menu Fabtice, for the browser checks: opens it from the logo and goes
// down a path of entries by their labels, in the form the page is in (a
// drop-down at the mouse on a computer, the sheet at a touch on a phone).
//
//   await menuCommand(page, 'Exporter', 'Audio…');
//   await menuCommand(page, 'Nouveau projet', 'À partir d’un fichier audio');
//   await menuOpenTo(page, 'Exporter', 'iReal Pro');  // opens the submenus and leaves them open
//   const st = await menuEntry(page, 'Exporter', 'iReal Pro', 'Fichier iReal Pro…'); // { enabled, label }
//
// A label is the entry's text exactly (« Annuler : volume de la piste »); a
// trailing `*` matches the start only (« Annuler* »). An entry greyed out
// throws: a check that wants to see it greyed out uses `menuEntry`.

// Phone, or a screen too short for the drop-down: the sheet (as FabticeMenu.tsx decides).
const PHONE = '(max-width: 760px), (max-height: 500px)';

const isPhone = (page) => page.evaluate((q) => window.matchMedia(q).matches, PHONE);
/** A touch where the page has a touch screen (`hasTouch`), a click elsewhere. */
async function press(page, locator) {
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await locator.tap();
  else await locator.click();
}

/** The entry labelled `label` in the menus open now (the deepest list first on a phone). */
function entry(page, phone, label) {
  const scope = phone ? '.feuille-menu-liste' : '.menu-fabtice';
  const prefix = label.endsWith('*');
  const escaped = (prefix ? label.slice(0, -1) : label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const text = new RegExp(`^\\s*${escaped}${prefix ? '' : '\\s*$'}`);
  return page
    .locator(`${scope} [role="menuitem"]`)
    .filter({ has: page.locator('.menu-texte', { hasText: text }) })
    .first();
}

/** Opens the menu Fabtice (if it is not open). */
export async function openMenu(page) {
  const phone = await isPhone(page);
  const button = page.locator('button.marque');
  if ((await button.getAttribute('aria-expanded')) !== 'true') {
    await press(page, button);
  }
  await page.locator(phone ? '.feuille-menu' : '#menu-fabtice').waitFor({ timeout: 5000 });
  return phone;
}

/** Closes the menu Fabtice, if open (Escape, as many times as there are open levels). */
export async function closeMenu(page) {
  for (let i = 0; i < 4 && (await page.locator('button.marque[aria-expanded="true"]').count()); i++) await page.keyboard.press('Escape');
}

/** Opens the menu, then each submenu of `labels` in turn; resolves with whether the page is a phone. */
async function descend(page, labels) {
  const phone = await openMenu(page);
  for (const label of labels) {
    const item = entry(page, phone, label);
    await item.waitFor({ timeout: 5000 });
    if ((await item.getAttribute('aria-disabled')) === 'true') throw new Error(`menu: « ${label} » is greyed out`);
    await press(page, item);
  }
  return phone;
}

/** Opens each submenu of `path` but the last entry, and returns the last entry (a locator) without clicking it. */
async function reach(page, labels) {
  const phone = await descend(page, labels.slice(0, -1));
  const last = entry(page, phone, labels[labels.length - 1]);
  await last.waitFor({ timeout: 5000 });
  return { phone, last };
}

/** Opens the menu and each of the submenus of `labels` (all of them submenus), and leaves them open (for a screenshot). */
export async function menuOpenTo(page, ...labels) {
  return descend(page, labels);
}

/** Opens the menu, goes down `labels` and chooses the last one (click or touch). */
export async function menuCommand(page, ...labels) {
  const { last } = await reach(page, labels);
  if ((await last.getAttribute('aria-disabled')) === 'true') throw new Error(`menu: « ${labels.join(' ▸ ')} » is greyed out`);
  await press(page, last);
}

/** Opens the menu down to the last of `labels` and says what it shows; the menu is closed again. */
export async function menuEntry(page, ...labels) {
  const { last } = await reach(page, labels);
  const out = { enabled: (await last.getAttribute('aria-disabled')) !== 'true', label: (await last.locator('.menu-texte').innerText()).trim() };
  await closeMenu(page);
  return out;
}
