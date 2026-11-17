// The bar menu of the ruler of « Pistes », for the browser checks: a right click on a computer, a long press
// (a finger held on the « Mesures » row) on a phone. Used by `meter.mjs` and `captures-meter.mjs`.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Where, in the page, the « Mesures » row of the ruler shows bar `bar` (index): the middle of the bar. */
export async function barPoint(page, bar) {
  await sleep(250); // the ruler follows the store a frame later
  return page.evaluate((b) => {
    const f = document.querySelector('.frise');
    const r = document.querySelector('.frise-regle').getBoundingClientRect();
    const fr = f.getBoundingClientRect();
    const s = window.__fabtice.store.getState();
    const bar = window.__fabtice.lot4.tempoMap.barStartTime;
    const t = bar(s.tempoMap, b) + 0.5 * (bar(s.tempoMap, b + 1) - bar(s.tempoMap, b));
    return { x: fr.left + (t - Number(f.dataset.t0)) * Number(f.dataset.pps), y: r.bottom - 13, left: fr.left, right: fr.right };
  }, bar);
}

/**
 * Opens the bar menu at `bar`. `cdp` is a CDP session of the page on a phone (a long press is a touch held:
 * `Input.dispatchTouchEvent`), null on a computer.
 */
export async function openBarMenu(page, bar, cdp = null) {
  const p = await barPoint(page, bar);
  if (p.x < p.left + 2 || p.x > p.right - 2) throw new Error(`bar ${bar} is not in view (x = ${p.x})`);
  if (cdp) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
    await sleep(900);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.click(p.x, p.y, { button: 'right' });
  }
  await page.waitForSelector('[data-testid="menu-tempo"]', { timeout: 5000 });
}
