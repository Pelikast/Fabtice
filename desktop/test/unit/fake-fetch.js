'use strict';

// A fake network for test/unit/publish-release.test.js, loaded with `node --require` in the script's process: it
// replaces `fetch` and answers as GitHub does for the published release of the fake `gh` (test/unit/fake-gh.js,
// state in $FAKE_GH_STATE):
//   https://github.com/pelikast/fabtice/releases/latest/download/<name>   302 to the storage host, then the file
//                                                                         of the latest release (not a draft,
//                                                                         not a prerelease);
//   https://github.com/pelikast/fabtice/releases/download/<tag>/<name>    302 to the storage host, then the file.
// The storage host is $FAKE_FETCH_HOST (default objects.githubusercontent.com); $FAKE_FETCH_ZIP_HOST, when set,
// is the one of the .zip files only. Every address asked is appended to $FAKE_GH_STATE.fetched.

const fs = require('node:fs');

const STORAGE = process.env.FAKE_FETCH_HOST || 'objects.githubusercontent.com';
const ZIP_STORAGE = process.env.FAKE_FETCH_ZIP_HOST || STORAGE;

function state() {
  return JSON.parse(fs.readFileSync(process.env.FAKE_GH_STATE, 'utf8'));
}

function note(url) {
  const s = state();
  s.fetched = [...(s.fetched || []), url];
  fs.writeFileSync(process.env.FAKE_GH_STATE, JSON.stringify(s, null, 2));
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  note(`${init.method || 'GET'} ${url.href}`);
  const s = state();
  const redirect = (host) => new Response(null, { status: 302, headers: { location: `https://${host}/store${url.pathname}` } });
  if (url.hostname === 'github.com') {
    const latest = /^\/pelikast\/fabtice\/releases\/latest\/download\/([^/]+)$/i.exec(url.pathname);
    const tagged = /^\/pelikast\/fabtice\/releases\/download\/[^/]+\/([^/]+)$/i.exec(url.pathname);
    const name = (latest || tagged || [])[1];
    if (name) return redirect(name.endsWith('.zip') ? ZIP_STORAGE : STORAGE);
    return new Response('not found', { status: 404 });
  }
  const m = /^\/store\/pelikast\/fabtice\/releases\/(?:latest\/download|download\/([^/]+))\/([^/]+)$/i.exec(url.pathname);
  if (!m) return new Response('not found', { status: 404 });
  const [, tag, name] = m;
  const release = tag ? s.releases.find((r) => r.tag_name === tag && !r.draft) : s.releases.find((r) => !r.draft && !r.prerelease);
  const asset = release && release.assets.find((a) => a.name === name);
  if (!asset) return new Response('not found', { status: 404 });
  const data = fs.readFileSync(asset.file);
  return new Response(data, { status: 200, headers: { 'content-length': String(data.length) } });
};
