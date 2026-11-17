#!/usr/bin/env node
'use strict';

// A fake `gh` for test/unit/publish-release.test.js: only the calls ci/publish-release.js makes, on a state
// kept in the JSON file $FAKE_GH_STATE ({ releases, calls, nextId, corrupt, failUpload }). Uploaded files are
// copied next to it. Publishing a draft creates its tag in the bare repository $FAKE_GH_BARE, as GitHub does.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const stateFile = process.env.FAKE_GH_STATE;
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const args = process.argv.slice(2);
state.calls.push(args);
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
const fail = (message) => {
  save();
  process.stderr.write(`${message}\n`);
  process.exit(1);
};
const out = (data) => {
  save();
  process.stdout.write(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
  process.exit(0);
};
const view = (r) => ({ ...r, assets: r.assets.map(({ file, ...a }) => a) });
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args[0] === 'api') {
  const method = opt('-X') || 'GET';
  const endpoint = args.slice(1).find((a, i, all) => !a.startsWith('-') && !['-X', '-H', '--input'].includes(all[i - 1]));
  const m = /^repos\/[^/]+\/[^/]+\/releases(?:\/(latest|assets\/\d+|\d+))?(\?.*)?$/.exec(endpoint);
  if (!m) fail(`fake gh: unknown endpoint ${endpoint}`);
  const sub = m[1];
  if (!sub && method === 'GET') out(state.releases.map(view));
  if (!sub && method === 'POST') {
    const body = JSON.parse(fs.readFileSync(opt('--input'), 'utf8'));
    const id = state.nextId++;
    const release = { id, ...body, html_url: `https://github.com/x/y/releases/tag/untagged-${id}`, assets: [] };
    state.releases.unshift(release);
    out(view(release));
  }
  if (sub === 'latest') {
    const latest = state.releases.find((r) => !r.draft && !r.prerelease);
    if (!latest) fail('HTTP 404: Not Found');
    out(view(latest));
  }
  if (sub && sub.startsWith('assets/')) {
    const id = Number(sub.slice(7));
    const asset = state.releases.flatMap((r) => r.assets).find((a) => a.id === id);
    if (!asset) fail('HTTP 404: Not Found');
    let data = fs.readFileSync(asset.file);
    if (state.corrupt === asset.name) data = Buffer.concat([data, Buffer.from('x')]);
    out(data);
  }
  const release = state.releases.find((r) => r.id === Number(sub));
  if (!release) fail('HTTP 404: Not Found');
  if (method === 'GET') out(view(release));
  if (method === 'DELETE') {
    state.releases = state.releases.filter((r) => r !== release);
    out('');
  }
  if (method === 'PATCH') {
    const body = JSON.parse(fs.readFileSync(opt('--input'), 'utf8'));
    if (release.draft && body.draft === false) {
      execFileSync('git', ['--git-dir', process.env.FAKE_GH_BARE, 'update-ref', `refs/tags/${release.tag_name}`, release.target_commitish]);
      release.html_url = `https://github.com/x/y/releases/tag/${release.tag_name}`;
    }
    Object.assign(release, body);
    out(view(release));
  }
}

if (args[0] === 'release' && args[1] === 'upload') {
  const tag = args[2];
  const release = state.releases.find((r) => r.tag_name === tag);
  if (!release) fail(`release not found`);
  if (state.failUpload) fail('upload failed: connection reset');
  const files = args.slice(3).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--repo');
  for (const f of files) {
    const name = path.basename(f);
    const copy = path.join(path.dirname(stateFile), `asset-${state.nextId}-${name}`);
    fs.copyFileSync(f, copy);
    release.assets.push({ id: state.nextId++, name, size: fs.statSync(copy).size, state: 'uploaded', file: copy });
  }
  out('');
}

fail(`fake gh: unknown command ${args.join(' ')}`);
