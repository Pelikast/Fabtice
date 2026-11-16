// The menu Fabtice, for the browser checks: opens it from the logo and goes
// down a path of entries by their labels, in the form the page is in (a
// drop-down at the mouse on a computer, the sheet at a touch on a phone).
//
//   await menuCommand(page, 'Exporter', 'Audio…');
//   await menuCommand(page, 'Nouveau projet', 'À partir d’un fichier audio');
//   const st = await menuEntry(page, 'Exporter', 'iReal Pro', 'Fichier iReal Pro…'); // { enabled, label }
//
// A label is the entry's text exactly (« Annuler : volume de la piste »); a
// trailing `*` matches the start only (« Annuler* »). An entry greyed out
// throws: a check that wants to see it greyed out uses `menuEntry`.

const PHONE = '(max-width: 760px)';

const isPhone = (page) => page.evaluate((q) => window.matchMedia(q).matches, PHONE);

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
    if (phone) await button.tap();
    else await button.click();
  }
  await page.locator(phone ? '.feuille-menu' : '#menu-fabtice').waitFor({ timeout: 5000 });
  return phone;
}

/** Closes the menu Fabtice, if open (Escape, as many times as there are open levels). */
export async function closeMenu(page) {
  for (let i = 0; i < 4 && (await page.locator('button.marque[aria-expanded="true"]').count()); i++) await page.keyboard.press('Escape');
}

/** Opens each submenu of `path` but the last entry, and returns the last entry (a locator) without clicking it. */
async function reach(page, labels) {
  const phone = await openMenu(page);
  for (const label of labels.slice(0, -1)) {
    const item = entry(page, phone, label);
    await item.waitFor({ timeout: 5000 });
    if ((await item.getAttribute('aria-disabled')) === 'true') throw new Error(`menu: « ${label} » is greyed out`);
    if (phone) await item.tap();
    else await item.click();
  }
  const last = entry(page, phone, labels[labels.length - 1]);
  await last.waitFor({ timeout: 5000 });
  return { phone, last };
}

/** Opens the menu, goes down `labels` and chooses the last one (click or touch). */
export async function menuCommand(page, ...labels) {
  const { phone, last } = await reach(page, labels);
  if ((await last.getAttribute('aria-disabled')) === 'true') throw new Error(`menu: « ${labels.join(' ▸ ')} » is greyed out`);
  if (phone) await last.tap();
  else await last.click();
}

/** Opens the menu down to the last of `labels` and says what it shows; the menu is closed again. */
export async function menuEntry(page, ...labels) {
  const { last } = await reach(page, labels);
  const out = { enabled: (await last.getAttribute('aria-disabled')) !== 'true', label: (await last.locator('.menu-texte').innerText()).trim() };
  await closeMenu(page);
  return out;
}
