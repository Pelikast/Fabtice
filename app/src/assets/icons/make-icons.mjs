// Makes the icons of the web app (installed version, lot 4) from the brand as
// it is: the « F » of « Fabtice » in Fraunces, ink, and its italic « t » in
// ember, on paper (DESIGN.md: the name of the app, 560, the « t » in italic
// ember). Drawn by Chromium with the app's own fonts, saved as PNG next to
// this script. Run again only if the brand changes:
//   node src/assets/icons/make-icons.mjs

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fonts = path.resolve(here, '../fonts');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR || '/opt/node-tools/');
const { chromium } = require('playwright');

const font = (file) => `data:font/woff2;base64,${fs.readFileSync(path.join(fonts, file)).toString('base64')}`;

/** `inset`: share of the side the monogram may use (maskable icons keep to the central 80 % safe zone). */
function page(size, inset) {
  return `<!doctype html><html><head><style>
@font-face { font-family: Fraunces; src: url(${font('fraunces-latin-full-normal.woff2')}) format('woff2'); font-weight: 100 900; font-style: normal; }
@font-face { font-family: Fraunces; src: url(${font('fraunces-latin-full-italic.woff2')}) format('woff2'); font-weight: 100 900; font-style: italic; }
html, body { margin: 0; width: ${size}px; height: ${size}px; background: #f4ecdf; }
.m { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-family: Fraunces; font-weight: 560; font-variation-settings: 'opsz' 144, 'SOFT' 50; color: #2b1f17;
  font-size: ${Math.round(size * 0.62 * inset)}px; letter-spacing: -0.02em; line-height: 1; padding-bottom: ${Math.round(size * 0.04)}px; }
.m i { color: #c4502a; font-style: italic; }
</style></head><body><div class="m">F<i>t</i></div></body></html>`;
}

const icons = [
  { name: 'icon-192.png', size: 192, inset: 1 },
  { name: 'icon-512.png', size: 512, inset: 1 },
  { name: 'icon-maskable-512.png', size: 512, inset: 0.78 },
  { name: 'apple-touch-icon.png', size: 180, inset: 0.92 },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
for (const icon of icons) {
  const p = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
  await p.setContent(page(icon.size, icon.inset));
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(here, icon.name), omitBackground: false });
  await p.close();
  console.log(icon.name);
}
await browser.close();
