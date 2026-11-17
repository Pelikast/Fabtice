#!/usr/bin/env node
'use strict';

// Where GitHub redirects a release asset today, hop by hop, and whether the update's host list (src/update-net.js)
// allows each hop. Run by the build on the GitHub Macs (they have all of the internet); reported, not required.
//   node ci/release-host.js

const { checkUrl, VERSION_FILE_URL } = require('../src/update-net');

const ADDRESSES = ['https://github.com/pelikast/fabtice/releases/download/desktop-dev/Fabtice-mac-intel.dmg', VERSION_FILE_URL];

async function follow(start) {
  let url = start;
  for (let hop = 0; hop < 6; hop++) {
    const r = await fetch(url, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': 'Fabtice' } });
    const location = r.headers.get('location');
    const next = location ? new URL(location, url) : null;
    console.log(`${r.status} ${new URL(url).hostname}${next ? ` -> ${next.hostname} (allowed: ${checkUrl(next.href).ok})` : ''}`);
    if (!next) return;
    url = next.href;
  }
}

(async () => {
  for (const a of ADDRESSES) {
    console.log(`# ${a}`);
    await follow(a).catch((e) => console.log(`error: ${e.message}`));
  }
})();
