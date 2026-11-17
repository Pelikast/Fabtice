#!/usr/bin/env node
'use strict';

// Where GitHub redirects a release asset today, hop by hop, and whether the update's host list (src/update-net.js)
// allows each hop. Run by the build on the GitHub Macs (they have all of the internet); reported, not required
// (it reads the old desktop-dev page; the publication itself checks the real chain of the new version). A hop
// refused by the list is written « HÔTE HORS LISTE », with a warning of GitHub Actions, so that it shows before a
// publication.
//   node ci/release-host.js

const { checkUrl, VERSION_FILE_URL } = require('../src/update-net');

const ADDRESSES = ['https://github.com/pelikast/fabtice/releases/download/desktop-dev/Fabtice-mac-intel.dmg', VERSION_FILE_URL];

/** The hosts of `start`'s redirects that the list refuses. */
async function follow(start) {
  const refused = [];
  let url = start;
  for (let hop = 0; hop < 6; hop++) {
    const r = await fetch(url, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': 'Fabtice' } });
    const location = r.headers.get('location');
    const next = location ? new URL(location, url) : null;
    const allowed = next ? checkUrl(next.href).ok : true;
    console.log(`${r.status} ${new URL(url).hostname}${next ? ` -> ${next.hostname} (allowed: ${allowed})${allowed ? '' : '  HÔTE HORS LISTE'}` : ''}`);
    if (!next) break;
    if (!allowed) refused.push(next.hostname);
    url = next.href;
  }
  return refused;
}

(async () => {
  const refused = new Set();
  for (const a of ADDRESSES) {
    console.log(`# ${a}`);
    for (const host of await follow(a).catch((e) => (console.log(`error: ${e.message}`), []))) refused.add(host);
  }
  for (const host of refused) {
    console.log(`HÔTE HORS LISTE : GitHub redirige vers « ${host} », que la mise à jour de l’app refuse. Ajouter cet hôte à ALLOWED_HOSTS dans desktop/src/update-net.js AVANT de publier une version.`);
    console.log(`::warning title=HÔTE HORS LISTE::GitHub redirige vers ${host}, absent de ALLOWED_HOSTS (desktop/src/update-net.js) : à ajouter avant de publier.`);
  }
  if (!refused.size) console.log('Tous les sauts sont dans la liste des hôtes permis.');
})();
