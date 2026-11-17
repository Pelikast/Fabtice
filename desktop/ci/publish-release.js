#!/usr/bin/env node
'use strict';

// Publishes a numbered version of the Mac app on GitHub (C17), or says exactly what it would do.
//
//   node ci/publish-release.js check
//       The number of the version: app/package.json and desktop/package.json carry the same one, three numbers
//       (« 1.0.0 »), and the first « ## » title of CHANGELOG.md names it (« ## Version 1.0.0 … »). Every run.
//
//   node ci/publish-release.js publish --assets <dir> [--dry-run] [--out <dir>]
//       <dir> holds the four files the build made: Fabtice-mac-apple-silicon.dmg, Fabtice-mac-intel.dmg,
//       Fabtice-mac-apple-silicon.zip, Fabtice-mac-intel.zip. In order:
//         1. the check above; the version V and the tag vV;
//         2. already published? the tag vV on the remote (git ls-remote) and every release of the project
//            (gh api, drafts included). The tag or a published release exists: nothing is published, nothing
//            is changed, exit 0. A draft of vV exists (a run that stopped in the middle): nothing either,
//            exit 1, because a person must look at it and delete it;
//         3. fabtice-version.json made by ci/make-version-file.js from the two zips (URLs of the tag vV), and
//            the notes of the release (which file to download, then the same notes as the version file);
//         4. a DRAFT release « Fabtice V » for the tag vV on the commit (a draft creates no tag), the five
//            files uploaded to it, checked (names, sizes, and the two zips and the version file downloaded
//            back: their SHA-256 equal to the version file's);
//         5. the draft published: not a prerelease, marked latest; GitHub creates the tag vV on the commit
//            at that moment. Then checked: the latest release is vV, the tag is on the commit.
//       Anything that fails in 4 deletes the draft (only while it is still a draft) and exits 1: no tag was
//       created, nothing is visible. A check that fails after 5 exits 1 and leaves the published version.
//       --dry-run does 1 to 3 for real (they only read, and write in a temporary folder) and prints the
//       commands of 4 and 5 instead of running them. It works on any branch.
//
// Environment: GITHUB_REPOSITORY (owner/name, default pelikast/fabtice), GITHUB_SHA (default: git rev-parse
// HEAD), GITHUB_REF (when set, a real publication needs refs/heads/main), FABTICE_GH (the gh command, default « gh »), FABTICE_RELEASE_REMOTE (the git remote, default origin).
// gh reads its token from GH_TOKEN. No dependency.

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseVersion } = require('../src/update-version');

const DESKTOP = path.join(__dirname, '..');
const ROOT = path.join(DESKTOP, '..');
const DMG = ['Fabtice-mac-apple-silicon.dmg', 'Fabtice-mac-intel.dmg'];
const ZIP = ['Fabtice-mac-apple-silicon.zip', 'Fabtice-mac-intel.zip'];
const VERSION_FILE = 'fabtice-version.json';
const ASSETS = [...DMG, ...ZIP, VERSION_FILE];

const log = (line = '') => process.stdout.write(`${line}\n`);

// ---------------------------------------------------------------------------------------------------------
// Pure parts (unit-tested)

/** The version both package.json carry, or the reasons it cannot be published. */
function checkVersion({ appPackage, desktopPackage, changelog }) {
  const problems = [];
  const app = appPackage && appPackage.version;
  const desktop = desktopPackage && desktopPackage.version;
  if (!parseVersion(desktop)) problems.push(`desktop/package.json : « ${desktop} » n’est pas un numéro de version a.b.c`);
  if (!parseVersion(app)) problems.push(`app/package.json : « ${app} » n’est pas un numéro de version a.b.c`);
  if (app !== desktop) problems.push(`app/package.json (${app}) et desktop/package.json (${desktop}) ne portent pas le même numéro`);
  const title = String(changelog || '').replace(/\r\n?/g, '\n').split('\n').find((l) => /^## /.test(l));
  if (!title) problems.push('CHANGELOG.md n’a aucune section « ## »');
  else if (parseVersion(desktop) && !new RegExp(`^## Version ${desktop.replace(/\./g, '\\.')}(?![0-9.])`).test(title)) {
    problems.push(`la première section de CHANGELOG.md (« ${title} ») ne nomme pas la version ${desktop} : elle doit commencer par « ## Version ${desktop} »`);
  }
  return { version: problems.length ? null : desktop, problems };
}

/**
 * Is this version already on GitHub?
 * @param {string} tag
 * @param {string} lsRemote  output of `git ls-remote --tags <remote> refs/tags/<tag>`
 * @param {Array<{ tag_name: string, draft: boolean, id: number, html_url?: string }>} releases
 * @returns {{ state: 'new' } | { state: 'published', reason: string } | { state: 'draft', reason: string }}
 */
function publishedState(tag, lsRemote, releases) {
  const tagLine = String(lsRemote || '').split('\n').find((l) => l.split(/\s+/)[1] === `refs/tags/${tag}`);
  const same = releases.filter((r) => r.tag_name === tag);
  const published = same.find((r) => !r.draft);
  if (published) return { state: 'published', reason: `la version ${tag} est déjà publiée (${published.html_url || `release ${published.id}`})` };
  if (tagLine) return { state: 'published', reason: `l’étiquette ${tag} existe déjà (${tagLine.split(/\s+/)[0]})` };
  const draft = same.find((r) => r.draft);
  if (draft) return { state: 'draft', reason: `un brouillon de la version ${tag} existe (release ${draft.id}), laissé par une fabrication interrompue : le supprimer à la main sur GitHub, puis relancer` };
  return { state: 'new' };
}

/** The notes of the release: which file to download, then the notes of the version file, unchanged. */
function releaseNotes({ version, notes, sha, repo }) {
  return [
    `Fabtice ${version} pour Mac.`,
    '',
    '## Quel fichier télécharger ?',
    '',
    '- **Mac à puce Apple (M1, M2, M3, M4…)** : `Fabtice-mac-apple-silicon.dmg`',
    '- **Mac Intel** : `Fabtice-mac-intel.dmg`',
    '',
    'Pour le savoir : menu Pomme (en haut à gauche) → **À propos de ce Mac**. Sur un Mac à puce Apple, la ligne « Puce » indique « Apple M… » ; sur un Mac Intel, la ligne « Processeur » indique « Intel ».',
    '',
    '- macOS 12 Monterey minimum.',
    `- Non signée par un développeur identifié : voir « Ouvrir l’app la première fois » dans [desktop/README.md](https://github.com/${repo}/blob/main/desktop/README.md).`,
    '- Les fichiers `.zip` et `fabtice-version.json` servent à la mise à jour automatique (à partir de la 1.0.0, Fabtice se met à jour d’elle-même) : inutile de les télécharger.',
    `- Commit : ${sha}`,
    '',
    '## Nouveautés',
    '',
    notes,
    '',
  ].join('\n');
}

/** The five files to publish, from the build's folder and the version file: name, path, size, SHA-256. */
function assetList(assetsDir, versionFile) {
  const missing = [...DMG, ...ZIP].filter((n) => !isFile(path.join(assetsDir, n)));
  if (missing.length) throw new Error(`fichiers absents de ${assetsDir} : ${missing.join(', ')}`);
  return ASSETS.map((name) => {
    const file = name === VERSION_FILE ? versionFile : path.join(assetsDir, name);
    const size = fs.statSync(file).size;
    if (size === 0) throw new Error(`${name} est vide`);
    return { name, file, size, sha256: sha256(file) };
  });
}

/** What the draft on GitHub must hold: the five names, the sizes; every asset fully uploaded. */
function checkUploaded(release, assets) {
  const problems = [];
  if (!release.draft) problems.push('la release n’est plus un brouillon');
  const remote = release.assets || [];
  const names = remote.map((a) => a.name).sort();
  const wanted = assets.map((a) => a.name).sort();
  if (JSON.stringify(names) !== JSON.stringify(wanted)) problems.push(`fichiers sur GitHub : ${names.join(', ') || 'aucun'} ; attendus : ${wanted.join(', ')}`);
  for (const a of assets) {
    const r = remote.find((x) => x.name === a.name);
    if (!r) continue;
    if (r.size !== a.size) problems.push(`${a.name} : ${r.size} octets sur GitHub, ${a.size} ici`);
    if (r.state && r.state !== 'uploaded') problems.push(`${a.name} : état « ${r.state} »`);
  }
  return problems;
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// ---------------------------------------------------------------------------------------------------------
// Commands

const quote = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${String(a).replace(/'/g, `'\\''`)}'`);

function run(cmd, args, { allowFail = false, stdoutFile } = {}) {
  let fd;
  if (stdoutFile) fd = fs.openSync(stdoutFile, 'w');
  const r = spawnSync(cmd, args, { encoding: stdoutFile ? undefined : 'utf8', stdio: ['ignore', fd ?? 'pipe', 'pipe'], maxBuffer: 64 << 20 });
  if (fd !== undefined) fs.closeSync(fd);
  if (r.error) {
    if (allowFail) return { ok: false, missing: r.error.code === 'ENOENT', stdout: '', stderr: r.error.message };
    throw new Error(`${cmd} : ${r.error.message}`);
  }
  const out = { ok: r.status === 0, stdout: typeof r.stdout === 'string' ? r.stdout : '', stderr: String(r.stderr || '') };
  if (!out.ok && !allowFail) throw new Error(`${[cmd, ...args].map(quote).join(' ')} a échoué (${r.status}) : ${out.stderr.trim()}`);
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function check() {
  const result = checkVersion({
    appPackage: readJson(path.join(ROOT, 'app', 'package.json')),
    desktopPackage: readJson(path.join(DESKTOP, 'package.json')),
    changelog: fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'),
  });
  for (const p of result.problems) log(`ERREUR : ${p}`);
  if (result.version) log(`Version ${result.version} : app/package.json, desktop/package.json et CHANGELOG.md concordent.`);
  return result;
}

function publish({ assetsDir, dryRun, outDir }) {
  const gh = process.env.FABTICE_GH || 'gh';
  const remote = process.env.FABTICE_RELEASE_REMOTE || 'origin';
  const repo = process.env.GITHUB_REPOSITORY || 'pelikast/fabtice';
  const sha = process.env.GITHUB_SHA || run('git', ['rev-parse', 'HEAD']).stdout.trim();
  // A second lock besides the workflow's `if:`: in GitHub Actions, only a run of main publishes for real.
  if (!dryRun && process.env.GITHUB_REF !== undefined && process.env.GITHUB_REF !== 'refs/heads/main') {
    log(`ERREUR : publication refusée hors de main (${process.env.GITHUB_REF}). Utiliser --dry-run.`);
    return 1;
  }
  const mode = dryRun ? 'ESSAI À BLANC (rien n’est écrit sur GitHub)' : 'PUBLICATION';
  log(`== ${mode} — dépôt ${repo}, commit ${sha}`);

  // 1. The number.
  const { version } = check();
  if (!version) return 1;
  const tag = `v${version}`;

  // 2. Already published?
  const ls = run('git', ['ls-remote', '--tags', remote, `refs/tags/${tag}`]);
  log(`$ git ls-remote --tags ${remote} refs/tags/${tag}\n${ls.stdout.trim() || '(aucune étiquette)'}`);
  const list = run(gh, ['api', `repos/${repo}/releases?per_page=100`], { allowFail: dryRun });
  let releases = [];
  if (list.ok) {
    releases = JSON.parse(list.stdout);
    log(`$ ${gh} api repos/${repo}/releases?per_page=100\n${releases.length} release(s) : ${releases.map((r) => `${r.tag_name}${r.draft ? ' (brouillon)' : ''}${r.prerelease ? ' (préversion)' : ''}`).join(', ') || 'aucune'}`);
    if (releases.length >= 100) log('ATTENTION : 100 releases ou plus, seule la première page est lue.');
  } else {
    log(`(essai à blanc) ${gh} indisponible ici (${list.stderr.trim().split('\n')[0]}) : seule l’étiquette est vérifiée.`);
  }
  const state = publishedState(tag, ls.stdout, releases);
  if (state.state === 'published') {
    log(`RIEN À PUBLIER : ${state.reason}. Rien n’est publié ni modifié (pas de fichier remplacé, pas d’étiquette déplacée).`);
    log(`Pour publier une nouvelle version : changer le numéro dans app/package.json et desktop/package.json, ajouter sa section en tête de CHANGELOG.md, pousser sur main.`);
    return 0;
  }
  if (state.state === 'draft') {
    log(`ERREUR : ${state.reason}. Rien n’est publié ni modifié.`);
    return 1;
  }
  log(`La version ${tag} n’existe pas encore sur GitHub.`);

  // 3. The version file, the notes, the five files.
  fs.mkdirSync(outDir, { recursive: true });
  const versionFile = path.join(outDir, VERSION_FILE);
  const make = run(process.execPath, [path.join(__dirname, 'make-version-file.js'), version, tag, path.join(assetsDir, ZIP[0]), path.join(assetsDir, ZIP[1]), path.join(ROOT, 'CHANGELOG.md'), versionFile]);
  log(make.stdout.trim());
  const data = readJson(versionFile);
  if (/en préparation/i.test(data.notes)) log('ATTENTION : les notes de CHANGELOG.md disent encore « En préparation ».');
  const notesFile = path.join(outDir, 'notes.md');
  fs.writeFileSync(notesFile, releaseNotes({ version, notes: data.notes, sha, repo }));
  log(`Notes de la release : ${notesFile} (${fs.statSync(notesFile).size} octets ; « Nouveautés » = les notes du fichier de version)`);
  const assets = assetList(assetsDir, versionFile);
  for (const a of assets) log(`  ${a.name.padEnd(32)} ${String(a.size).padStart(11)} octets  sha256 ${a.sha256}`);
  for (const [i, name] of ZIP.entries()) {
    const arch = i === 0 ? 'arm64' : 'x64';
    if (data.downloads[arch].sha256 !== assets.find((a) => a.name === name).sha256) throw new Error(`${name} : l’empreinte du fichier de version ne correspond pas`);
  }

  // 4 and 5.
  const createBody = path.join(outDir, 'create.json');
  fs.writeFileSync(createBody, JSON.stringify({ tag_name: tag, target_commitish: sha, name: `Fabtice ${version}`, body: fs.readFileSync(notesFile, 'utf8'), draft: true, prerelease: false }));
  const publishBody = path.join(outDir, 'publish.json');
  fs.writeFileSync(publishBody, JSON.stringify({ draft: false, prerelease: false, make_latest: 'true', tag_name: tag, target_commitish: sha }));

  if (dryRun) {
    log('');
    log('Commandes qui seraient lancées sur main :');
    const steps = [
      [gh, 'api', '-X', 'POST', `repos/${repo}/releases`, '--input', createBody],
      [gh, 'release', 'upload', tag, '--repo', repo, ...assets.map((a) => a.file)],
      [gh, 'api', `repos/${repo}/releases/<id>`],
      ...[...ZIP, VERSION_FILE].map((n) => [gh, 'api', '-H', 'Accept: application/octet-stream', `repos/${repo}/releases/assets/<id de ${n}>`]),
      [gh, 'api', '-X', 'PATCH', `repos/${repo}/releases/<id>`, '--input', publishBody],
      [gh, 'api', `repos/${repo}/releases/latest`],
      ['git', 'ls-remote', '--tags', remote, `refs/tags/${tag}`],
    ];
    for (const s of steps) log(`  ${s.map(quote).join(' ')}`);
    log('  (en cas d’échec avant la publication : ' + `${gh} api -X DELETE repos/${repo}/releases/<id>, seulement tant que c’est un brouillon)`);
    log(`ESSAI À BLANC TERMINÉ : la version ${tag} serait publiée.`);
    return 0;
  }

  const created = JSON.parse(run(gh, ['api', '-X', 'POST', `repos/${repo}/releases`, '--input', createBody]).stdout);
  const id = created.id;
  log(`Brouillon créé : release ${id} (${created.html_url}).`);
  let isPublished = false;
  try {
    run(gh, ['release', 'upload', tag, '--repo', repo, ...assets.map((a) => a.file)]);
    log('Cinq fichiers envoyés.');
    const draft = JSON.parse(run(gh, ['api', `repos/${repo}/releases/${id}`]).stdout);
    const problems = checkUploaded(draft, assets);
    if (problems.length) throw new Error(`brouillon incomplet : ${problems.join(' ; ')}`);
    const back = path.join(outDir, 'downloaded');
    fs.mkdirSync(back, { recursive: true });
    for (const name of [...ZIP, VERSION_FILE]) {
      const remoteAsset = draft.assets.find((a) => a.name === name);
      const file = path.join(back, name);
      run(gh, ['api', '-H', 'Accept: application/octet-stream', `repos/${repo}/releases/assets/${remoteAsset.id}`], { stdoutFile: file });
      const got = sha256(file);
      const wanted = name === VERSION_FILE ? sha256(versionFile) : data.downloads[name === ZIP[0] ? 'arm64' : 'x64'].sha256;
      if (got !== wanted) throw new Error(`${name} relu depuis GitHub : sha256 ${got}, attendu ${wanted}`);
      log(`  ${name} relu depuis GitHub : sha256 ${got} (identique)`);
    }
    const done = JSON.parse(run(gh, ['api', '-X', 'PATCH', `repos/${repo}/releases/${id}`, '--input', publishBody]).stdout);
    isPublished = !done.draft;
    if (!isPublished) throw new Error('GitHub a répondu mais la release est encore un brouillon');
    log(`PUBLIÉE : ${done.html_url}`);
  } catch (e) {
    log(`ERREUR : ${e.message}`);
    // Delete the draft, only if it is still one (a publication that answered badly must never be deleted).
    const now = run(gh, ['api', `repos/${repo}/releases/${id}`], { allowFail: true });
    let stillDraft = false;
    try {
      stillDraft = now.ok && JSON.parse(now.stdout).draft === true;
    } catch {
      stillDraft = false;
    }
    if (stillDraft) {
      const del = run(gh, ['api', '-X', 'DELETE', `repos/${repo}/releases/${id}`], { allowFail: true });
      log(del.ok ? `Brouillon ${id} supprimé : rien n’a été publié, aucune étiquette créée.` : `ATTENTION : le brouillon ${id} n’a pas pu être supprimé (${del.stderr.trim()}) : le supprimer à la main sur GitHub.`);
    } else {
      log(`ATTENTION : la release ${id} n’est plus un brouillon (ou ne se lit plus) : elle n’est pas supprimée. Vérifier à la main sur GitHub.`);
    }
    const tagNow = run('git', ['ls-remote', '--tags', remote, `refs/tags/${tag}`], { allowFail: true });
    if (tagNow.stdout.trim()) log(`Étiquette ${tag} présente : ${tagNow.stdout.trim()} (laissée telle quelle).`);
    return 1;
  }

  // After the publication: checks only (the version stays published).
  const problems = [];
  const latest = run(gh, ['api', `repos/${repo}/releases/latest`], { allowFail: true });
  const latestTag = latest.ok ? JSON.parse(latest.stdout).tag_name : null;
  if (latestTag !== tag) problems.push(`la dernière version selon GitHub est ${latestTag}, pas ${tag}`);
  const tagNow = run('git', ['ls-remote', '--tags', remote, `refs/tags/${tag}`], { allowFail: true }).stdout.trim().split(/\s+/)[0];
  if (tagNow !== sha) problems.push(`l’étiquette ${tag} est sur ${tagNow || 'rien'}, pas sur ${sha}`);
  for (const p of problems) log(`ATTENTION après publication : ${p}`);
  if (problems.length) return 1;
  log(`Vérifié : ${tag} est la dernière version, son étiquette est sur ${sha}.`);
  return 0;
}

function main(argv) {
  const [command, ...rest] = argv;
  const opt = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  try {
    if (command === 'check') return check().version ? 0 : 1;
    if (command === 'publish' && opt('--assets')) {
      return publish({
        assetsDir: path.resolve(opt('--assets')),
        dryRun: rest.includes('--dry-run'),
        outDir: path.resolve(opt('--out') || fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'fabtice-release-'))),
      });
    }
    process.stderr.write('usage: publish-release.js check | publish --assets <dir> [--dry-run] [--out <dir>]\n');
    return 2;
  } catch (e) {
    log(`ERREUR : ${e.message}`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { checkVersion, publishedState, releaseNotes, assetList, checkUploaded, main, ASSETS };
