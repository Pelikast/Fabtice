// Quick manual smoke run: load the page in Chromium, load the demo, play a few seconds, print diagnostics, screenshot.
import { createRequire } from 'node:module';
import { startServer } from './serve.mjs';
const { chromium } = createRequire('/opt/node-tools/')('playwright');

const { srv, url } = await startServer(0);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url + '/spikes/lecteur/');
console.log('isolated', await page.evaluate(() => crossOriginIsolated));
await page.click('#btn-demo');
await page.waitForFunction(() => window.S && S.stems.length === 7, null, { timeout: 40000 }).catch(async () => { console.log('TIMEOUT state:', await page.textContent('#loadstate'), '| log:', await page.textContent('#log'), '| engine:', await page.textContent('#engine-info')); });
console.log(await page.textContent('#loadstate'));
await page.click('#btn-play');
await page.waitForTimeout(3000);
console.log(await page.evaluate(() => buildDiagnostic()));
await page.screenshot({ path: process.argv[2] || '/tmp/claude-0/-home-user-fabtice/dd9138d6-de27-5bb3-9e96-743ffed7e45c/scratchpad/shot1.png', fullPage: true });
await browser.close();
srv.close();
