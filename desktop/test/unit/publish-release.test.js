'use strict';

// The publication of a numbered version (C17), ci/publish-release.js: the number checked in both package.json
// and in the changelog; « already published » means nothing is done; the notes are the version file's; the
// order draft → five files → checked → published; a failure deletes the draft. `gh` is a fake on the PATH
// (test/unit/fake-gh.js), the remote a local bare repository.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { checkVersion, preparationVerdict, newestPublished, publishedState, releaseNotes, checkUploaded } = require('../../ci/publish-release');

const DESKTOP = path.join(__dirname, '..', '..');
const ROOT = path.join(DESKTOP, '..');
const SCRIPT = path.join(DESKTOP, 'ci', 'publish-release.js');
const VERSION = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8')).version;
const TAG = `v${VERSION}`;

test('this repository: both package.json carry the same number, named by the first section of CHANGELOG.md', () => {
  const r = checkVersion({
    appPackage: JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'package.json'), 'utf8')),
    desktopPackage: JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8')),
    changelog: fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'),
  });
  assert.deepEqual(r.problems, []);
  assert.equal(r.version, VERSION);
});

test('the number: three numbers, the same in both, named by the first « ## » title of the changelog', () => {
  const ok = (a, d, c) => checkVersion({ appPackage: { version: a }, desktopPackage: { version: d }, changelog: c });
  const log = '# Nouveautés\n\nIntro.\n\n## Version 1.0.1 — 1er décembre 2026\n\n- Une chose.\n\n## Version 1.0.0\n';
  assert.equal(ok('1.0.1', '1.0.1', log).version, '1.0.1');
  assert.equal(ok('1.0.1', '1.0.1', '## Version 1.0.1\n').version, '1.0.1');
  assert.equal(ok('1.0.1', '1.0.1', '## Version 1.0.1 (correctifs)\n').version, '1.0.1');
  const fails = (a, d, c, re) => {
    const r = ok(a, d, c);
    assert.equal(r.version, null);
    assert.match(r.problems.join('\n'), re);
  };
  fails('1.0.1', '1.0.0', log, /ne portent pas le même numéro/);
  fails('1.0', '1.0', '## Version 1.0\n', /n’est pas un numéro/);
  fails('v1.0.1', 'v1.0.1', log, /n’est pas un numéro/);
  fails('1.0.1', '1.0.1', '# Nouveautés\n', /aucune section/);
  fails('1.0.2', '1.0.2', log, /ne nomme pas la version 1\.0\.2/);
  fails('1.0.1', '1.0.1', '## Version 1.0.10\n', /ne nomme pas/);
  fails('1.0.1', '1.0.1', '## Version 1.0.1.2\n', /ne nomme pas/);
  fails('1.0.1', '1.0.1', '## Version du 16 novembre 2026\n', /ne nomme pas/);
  fails('1.0.1', '1.0.1', '### Version 1.0.1\n## Version 1.0.0\n', /ne nomme pas/);
});

test('notes « en préparation »: a real publication stops, a dry run warns loudly', () => {
  const ready = '# Nouveautés\n\n## Version 1.0.1\n\n- Une chose.\n\n## Version 1.0.0 (en préparation autrefois)\n';
  assert.equal(preparationVerdict(ready, false), null, 'only the first section counts');
  assert.equal(preparationVerdict('# Rien\n', false), null);
  for (const log of ['## Version 1.0.1\n\nEn préparation.\n', '## Version 1.0.1 (en préparation)\n\n- Une chose.\n', '## Version 1.0.1\r\n\r\n- EN PRÉPARATION\r\n']) {
    const real = preparationVerdict(log, false);
    assert.equal(real.stop, true, log);
    assert.match(real.message, /^ERREUR : .*En préparation/);
    const dry = preparationVerdict(log, true);
    assert.equal(dry.stop, false);
    assert.match(dry.message, /^ATTENTION !!! .*s’arrêterait/);
  }
});

test('already published: a published release means nothing to do; a tag alone or a draft must be looked at', () => {
  const lines = 'abc123\trefs/tags/v1.0.1\n';
  assert.deepEqual(publishedState('v1.0.1', '', []), { state: 'new' });
  assert.deepEqual(publishedState('v1.0.1', '', [{ tag_name: 'desktop-dev', draft: false, id: 1 }, { tag_name: 'v1.0.0', draft: false, id: 2 }]), { state: 'new' });
  assert.equal(publishedState('v1.0.1', 'abc\trefs/tags/v1.0.10\n', []).state, 'new');
  assert.equal(publishedState('v1.0.1', '', [{ tag_name: 'v1.0.1', draft: false, id: 3 }]).state, 'published');
  assert.equal(publishedState('v1.0.1', lines, [{ tag_name: 'v1.0.1', draft: false, id: 3 }]).state, 'published');
  assert.equal(publishedState('v1.0.1', '', [{ tag_name: 'v1.0.1', draft: true, id: 3 }]).state, 'draft');
  // The tag without a published release of this number: stop, and say what to look at.
  const alone = publishedState('v1.0.1', lines, [{ tag_name: 'v1.0.0', draft: false, id: 2 }]);
  assert.equal(alone.state, 'tag-only');
  assert.match(alone.reason, /l’étiquette v1\.0\.1 existe \(abc123\) mais aucune version publiée ne porte ce numéro : .*supprimer l’étiquette v1\.0\.1/);
  assert.equal(publishedState('v1.0.1', lines, []).state, 'tag-only');
  assert.match(publishedState('v1.0.1', lines, [{ tag_name: 'v1.0.1', draft: true, id: 3 }]).reason, /seulement un brouillon/);
  // Releases not read (a dry run without gh): the tag alone says « already there ».
  assert.equal(publishedState('v1.0.1', lines, null).state, 'published');
  assert.deepEqual(publishedState('v1.0.1', '', null), { state: 'new' });
});

test('the newest numbered version published: drafts and tags that are not « v a.b.c » are ignored', () => {
  assert.equal(newestPublished(null), null);
  assert.equal(newestPublished([]), null);
  assert.equal(newestPublished([{ tag_name: 'desktop-dev', draft: false }, { tag_name: 'v2.0', draft: false }, { tag_name: 'v9.9.9-beta', draft: false }]), null);
  const list = [
    { tag_name: 'v1.0.9', draft: false },
    { tag_name: 'desktop-dev', draft: false, prerelease: true },
    { tag_name: 'v1.0.10', draft: false },
    { tag_name: 'v3.0.0', draft: true },
    { tag_name: 'v1.0.2', draft: false },
  ];
  assert.deepEqual(newestPublished(list), { version: '1.0.10', tag: 'v1.0.10' }, 'compared as numbers, the draft left out');
});

test('the notes: which file to download, then the version file’s notes unchanged', () => {
  const notes = '### Lecteur\n- Une chose.';
  const text = releaseNotes({ version: '1.0.1', notes, sha: 'f'.repeat(40), repo: 'pelikast/fabtice' });
  assert.match(text, /Fabtice-mac-apple-silicon\.dmg/);
  assert.match(text, /Fabtice-mac-intel\.dmg/);
  assert.match(text, /À propos de ce Mac/);
  assert.match(text, /macOS 12 Monterey minimum/);
  assert.match(text, /Ouvrir l’app la première fois/);
  assert.ok(text.endsWith(`## Nouveautés\n\n${notes}\n`));
});

test('the draft on GitHub: exactly the five files, the same sizes, all uploaded', () => {
  const assets = ['a.dmg', 'b.dmg', 'a.zip', 'b.zip', 'fabtice-version.json'].map((name, i) => ({ name, size: 10 + i }));
  const remote = assets.map((a) => ({ name: a.name, size: a.size, state: 'uploaded' }));
  assert.deepEqual(checkUploaded({ draft: true, assets: remote }, assets), []);
  assert.match(checkUploaded({ draft: true, assets: remote.slice(1) }, assets).join(), /attendus/);
  assert.match(checkUploaded({ draft: true, assets: [...remote, { name: 'x', size: 1 }] }, assets).join(), /attendus/);
  assert.match(checkUploaded({ draft: true, assets: remote.map((a, i) => (i === 2 ? { ...a, size: 1 } : a)) }, assets).join(), /octets/);
  assert.match(checkUploaded({ draft: true, assets: remote.map((a, i) => (i === 2 ? { ...a, state: 'new' } : a)) }, assets).join(), /état/);
  assert.match(checkUploaded({ draft: false, assets: remote }, assets).join(), /brouillon/);
});

// ---------------------------------------------------------------------------------------------------------
// The whole script, with a fake gh and a local remote.

function setup({ releases = [], tagged = false, corrupt, failUpload, changelog } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabtice-publish-'));
  // Another changelog: a copy of the repository's three files that count, in a folder standing for it.
  const root = changelog === undefined ? null : path.join(dir, 'repo');
  if (root) {
    for (const sub of ['app', 'desktop']) {
      fs.mkdirSync(path.join(root, sub), { recursive: true });
      fs.writeFileSync(path.join(root, sub, 'package.json'), JSON.stringify({ version: VERSION }));
    }
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), changelog);
  }
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
  const bare = path.join(dir, 'remote.git');
  git('init', '-q', '--bare', bare);
  git('init', '-q', 'work');
  fs.writeFileSync(path.join(dir, 'work', 'f'), 'x');
  execFileSync('git', ['-C', path.join(dir, 'work'), 'add', 'f']);
  execFileSync('git', ['-C', path.join(dir, 'work'), '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'c']);
  const sha = execFileSync('git', ['-C', path.join(dir, 'work'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  execFileSync('git', ['-C', path.join(dir, 'work'), 'push', '-q', bare, 'HEAD:refs/heads/main']);
  if (tagged) execFileSync('git', ['--git-dir', bare, 'update-ref', `refs/tags/${TAG}`, sha]);
  const assets = path.join(dir, 'assets');
  fs.mkdirSync(assets);
  for (const name of ['Fabtice-mac-apple-silicon.dmg', 'Fabtice-mac-intel.dmg', 'Fabtice-mac-apple-silicon.zip', 'Fabtice-mac-intel.zip']) fs.writeFileSync(path.join(assets, name), Buffer.concat([Buffer.from(`content of ${name}`), Buffer.alloc(1100 * 1024)])); // an archive is 1 MB at least for the app's reader
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\nexec "${process.execPath}" "${path.join(__dirname, 'fake-gh.js')}" "$@"\n`, { mode: 0o755 });
  const ghDir = path.join(dir, 'gh');
  fs.mkdirSync(ghDir);
  const stateFile = path.join(ghDir, 'state.json');
  fs.writeFileSync(stateFile, JSON.stringify({ releases, calls: [], nextId: 100, corrupt, failUpload }));
  const runScriptWith = (more) => (...extra) => {
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FAKE_GH_STATE: stateFile, FAKE_GH_BARE: bare, FABTICE_RELEASE_REMOTE: bare, GITHUB_SHA: sha, GITHUB_REPOSITORY: 'pelikast/fabtice' };
    delete env.FABTICE_GH;
    delete env.FABTICE_RELEASE_ROOT;
    delete env.GITHUB_REF; // the unit tests also run in GitHub Actions, on any branch
    if (root) env.FABTICE_RELEASE_ROOT = root;
    Object.assign(env, more);
    const r = spawnSync(process.execPath, [SCRIPT, 'publish', '--assets', assets, '--out', path.join(dir, 'out'), ...extra], { env, encoding: 'utf8' });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  const runScript = Object.assign(runScriptWith({}), { withEnv: runScriptWith });
  const state = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const tagOf = () => execFileSync('git', ['ls-remote', '--tags', bare], { encoding: 'utf8' }).trim();
  return { dir, sha, runScript, state, tagOf, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const writes = (calls) => calls.filter((c) => (c[0] === 'api' && c.includes('-X')) || c[0] === 'release');

test('dry run: reads only, prints the commands, writes nothing on GitHub', (t) => {
  const s = setup({ releases: [{ id: 1, tag_name: 'desktop-dev', draft: false, prerelease: true, assets: [] }] });
  t.after(s.cleanup);
  const r = s.runScript('--dry-run');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ESSAI À BLANC/);
  assert.match(r.out, new RegExp(`La version ${TAG} n’existe pas encore`));
  assert.match(r.out, /gh api -X POST repos\/pelikast\/fabtice\/releases --input/);
  assert.match(r.out, /gh release upload/);
  assert.match(r.out, /gh api -X PATCH/);
  for (const name of ['Fabtice-mac-apple-silicon.dmg', 'Fabtice-mac-intel.dmg', 'Fabtice-mac-apple-silicon.zip', 'Fabtice-mac-intel.zip', 'fabtice-version.json']) assert.match(r.out, new RegExp(`${name.replace(/\./g, '\\.')} +\\d+ octets +sha256 [0-9a-f]{64}`));
  assert.deepEqual(writes(s.state().calls), []);
  assert.equal(s.tagOf(), '');
  const data = JSON.parse(fs.readFileSync(path.join(s.dir, 'out', 'fabtice-version.json'), 'utf8'));
  assert.equal(data.version, VERSION);
  assert.ok(data.downloads.arm64.url.endsWith(`/releases/download/${TAG}/Fabtice-mac-apple-silicon.zip`));
  const notes = fs.readFileSync(path.join(s.dir, 'out', 'notes.md'), 'utf8');
  assert.ok(notes.endsWith(`## Nouveautés\n\n${data.notes}\n`), 'the same notes as the version file');
  const create = JSON.parse(fs.readFileSync(path.join(s.dir, 'out', 'create.json'), 'utf8'));
  assert.deepEqual({ ...create, body: undefined }, { tag_name: TAG, target_commitish: s.sha, name: `Fabtice ${VERSION}`, body: undefined, draft: true, prerelease: false });
});

test('dry run without gh: the tag is still checked by git', (t) => {
  const s = setup({ tagged: true });
  t.after(s.cleanup);
  const env = { ...process.env, FABTICE_GH: path.join(s.dir, 'no-gh-here'), FABTICE_RELEASE_REMOTE: path.join(s.dir, 'remote.git'), GITHUB_SHA: s.sha, GITHUB_REF: 'refs/heads/v1' };
  const r = spawnSync(process.execPath, [SCRIPT, 'publish', '--assets', path.join(s.dir, 'assets'), '--dry-run', '--out', path.join(s.dir, 'out')], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /indisponible ici/);
  assert.match(r.stdout, /RIEN À PUBLIER : l’étiquette/);
});

test('already published: nothing is published or changed, success', (t) => {
  for (const opts of [{ releases: [{ id: 5, tag_name: TAG, draft: false, prerelease: false, html_url: 'https://x', assets: [] }] }, { tagged: true, releases: [{ id: 5, tag_name: TAG, draft: false, prerelease: false, html_url: 'https://x', assets: [] }] }]) {
    const s = setup(opts);
    t.after(s.cleanup);
    for (const extra of [[], ['--dry-run']]) {
      const r = s.runScript(...extra);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /RIEN À PUBLIER/);
    }
    assert.deepEqual(writes(s.state().calls), []);
  }
});

test('a number lower than the newest published one: nothing done, failure; the same number already published stays green', (t) => {
  const [a, b, c] = VERSION.split('.').map(Number);
  const higher = `v${a}.${b}.${c + 1}`;
  const s = setup({ releases: [{ id: 2, tag_name: higher, draft: false, prerelease: false, assets: [] }, { id: 1, tag_name: 'desktop-dev', draft: false, prerelease: true, assets: [] }] });
  t.after(s.cleanup);
  for (const extra of [[], ['--dry-run']]) {
    const r = s.runScript(...extra);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, new RegExp(`ERREUR : le numéro ${VERSION.replace(/\./g, '\\.')} est plus petit que celui de la dernière version publiée, ${higher.replace(/\./g, '\\.')}`));
  }
  assert.deepEqual(writes(s.state().calls), []);
  // A draft of a higher number, or a tag that is not a number, does not count.
  const t2 = setup({ releases: [{ id: 3, tag_name: higher, draft: true, prerelease: false, assets: [] }, { id: 4, tag_name: 'v99', draft: false, prerelease: false, assets: [] }] });
  t.after(t2.cleanup);
  const dry = t2.runScript('--dry-run');
  assert.equal(dry.code, 0, dry.out);
  // The same number, published: nothing to do, green (as before).
  const same = setup({ releases: [{ id: 5, tag_name: TAG, draft: false, prerelease: false, assets: [] }] });
  t.after(same.cleanup);
  assert.equal(same.runScript().code, 0);
});

test('the tag of this number without a published release: nothing done, failure that says what to look at', (t) => {
  const s = setup({ tagged: true, releases: [{ id: 1, tag_name: 'desktop-dev', draft: false, prerelease: true, assets: [] }] });
  t.after(s.cleanup);
  for (const extra of [[], ['--dry-run']]) {
    const r = s.runScript(...extra);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, new RegExp(`ERREUR : l’étiquette ${TAG.replace(/\./g, '\\.')} existe .* mais aucune version publiée ne porte ce numéro`));
    assert.doesNotMatch(r.out, /RIEN À PUBLIER/);
  }
  assert.deepEqual(writes(s.state().calls), []);
});

test('a draft of this number left by a stopped run: nothing done, failure that says to delete it by hand', (t) => {
  const s = setup({ releases: [{ id: 7, tag_name: TAG, draft: true, prerelease: false, assets: [] }] });
  t.after(s.cleanup);
  const r = s.runScript();
  assert.equal(r.code, 1);
  assert.match(r.out, /brouillon .* le supprimer à la main/);
  assert.deepEqual(writes(s.state().calls), []);
});

test('publication: draft, five files, read back, then published and latest, with the tag on the commit', (t) => {
  const s = setup({ releases: [{ id: 1, tag_name: 'desktop-dev', draft: false, prerelease: true, assets: [] }] });
  t.after(s.cleanup);
  const r = s.runScript();
  assert.equal(r.code, 0, r.out);
  const st = s.state();
  const order = writes(st.calls).map((c) => (c[0] === 'release' ? 'upload' : `${c[2]}`));
  assert.deepEqual(order, ['POST', 'upload', 'PATCH']);
  const downloads = st.calls.filter((c) => c.includes('Accept: application/octet-stream'));
  assert.equal(downloads.length, 3, 'the two zips and the version file read back');
  const release = st.releases.find((x) => x.tag_name === TAG);
  assert.equal(release.draft, false);
  assert.equal(release.prerelease, false);
  assert.equal(release.make_latest, 'true');
  assert.equal(release.name, `Fabtice ${VERSION}`);
  assert.deepEqual(release.assets.map((a) => a.name).sort(), ['Fabtice-mac-apple-silicon.dmg', 'Fabtice-mac-apple-silicon.zip', 'Fabtice-mac-intel.dmg', 'Fabtice-mac-intel.zip', 'fabtice-version.json']);
  assert.equal(s.tagOf(), `${s.sha}\trefs/tags/${TAG}`);
  assert.match(r.out, /PUBLIÉE/);
  assert.match(r.out, /est la dernière version/);
  // The prerelease of before is not touched.
  assert.deepEqual(st.releases.find((x) => x.tag_name === 'desktop-dev'), { id: 1, tag_name: 'desktop-dev', draft: false, prerelease: true, assets: [] });

  // A second push without a new number: nothing.
  const again = s.runScript();
  assert.equal(again.code, 0, again.out);
  assert.match(again.out, /RIEN À PUBLIER/);
  assert.equal(writes(s.state().calls).length, 3);
});

test('a file read back different, or an upload that fails: the draft is deleted, no tag, failure', (t) => {
  for (const opts of [{ corrupt: 'Fabtice-mac-intel.zip' }, { corrupt: 'fabtice-version.json' }, { failUpload: true }]) {
    const s = setup(opts);
    t.after(s.cleanup);
    const r = s.runScript();
    assert.equal(r.code, 1, r.out);
    const st = s.state();
    assert.ok(!st.calls.some((c) => c.includes('PATCH')), 'never published');
    assert.ok(st.calls.some((c) => c.includes('DELETE')), 'draft deleted');
    assert.deepEqual(st.releases, []);
    assert.equal(s.tagOf(), '');
    assert.match(r.out, /Brouillon 100 supprimé/);
  }
});

test('notes « en préparation »: the real publication stops before any gh command; the dry run goes on, warning', (t) => {
  const s = setup({ changelog: `# Nouveautés\n\n## Version ${VERSION}\n\nEn préparation.\n` });
  t.after(s.cleanup);
  const r = s.runScript();
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /ERREUR : la première section de CHANGELOG\.md dit encore « En préparation »/);
  assert.deepEqual(s.state().calls, [], 'not one gh command');
  assert.equal(s.tagOf(), '');
  const dry = s.runScript('--dry-run');
  assert.equal(dry.code, 0, dry.out);
  assert.equal(dry.out.match(/ATTENTION !!! /g).length, 2, 'said at the start and at the end');
  assert.match(dry.out, /ESSAI À BLANC TERMINÉ/);
  assert.deepEqual(writes(s.state().calls), []);
});

test('in GitHub Actions, a real publication outside main is refused before anything is read', (t) => {
  const s = setup();
  t.after(s.cleanup);
  const r = s.runScript.withEnv({ GITHUB_REF: 'refs/heads/v1' })();
  assert.equal(r.code, 1);
  assert.match(r.out, /refusée hors de main/);
  assert.deepEqual(s.state().calls, []);
  const dry = s.runScript.withEnv({ GITHUB_REF: 'refs/heads/v1' })('--dry-run');
  assert.equal(dry.code, 0, dry.out);
  assert.deepEqual(writes(s.state().calls), []);
});
