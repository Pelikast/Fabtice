'use strict';

// After a publication: does the real update chain work, as an installed app will walk it? (C16, C17)
//
//   1. the version file at its real address (…/releases/latest/download/fabtice-version.json), fetched and read
//      with the app's own code (src/update-net.js: closed list of hosts, every redirect checked; then
//      src/update-version.js): it must give the number just published;
//   2. the address of each chip's .zip in that file: its redirects followed with the same code, every hop checked
//      against the same list, until the storage host answers; the body is not downloaded (cancelled at once).
//
// GitHub may take a few seconds to serve a new release as « latest »: a few attempts, spaced. A host outside the
// list is not a matter of seconds: it stops at once. `fetchImpl` is the network (injected by the tests), resolved
// at call time.

const { VERSION_FILE_URL, fetchVersionFile, getFollowing } = require('../src/update-net');
const { readVersionFile } = require('../src/update-version');

const ATTEMPTS = 6;
const DELAY_MS = 10_000;
const CALL_TIMEOUT_MS = 30_000;
const ZIP_ACCEPT = 'application/zip, application/octet-stream;q=0.9, */*;q=0.5'; // what the app's download asks
const NO_TEST_ORIGIN = {}; // never the app's local test server: the real addresses only

const defaultFetch = (...args) => globalThis.fetch(...args);
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Where the redirects of `url` leave the list, or null (the app's own follower, body cancelled). */
async function refusedHost(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const { response } = await getFollowing(url, { fetchImpl, env: NO_TEST_ORIGIN, signal: controller.signal, accept: ZIP_ACCEPT });
    await response.body?.cancel().catch(() => {});
    return null;
  } catch (e) {
    return e && e.code === 'host-not-allowed' ? e.detail || '?' : null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One walk of the chain. `{ ok: true, hosts }` or `{ ok: false, final, host?, message }` (`final`: no use trying
 * again; `host`: the host outside the list).
 */
async function checkOnce(version, fetchImpl) {
  const got = await fetchVersionFile({ fetchImpl, env: NO_TEST_ORIGIN, timeoutMs: CALL_TIMEOUT_MS });
  if (!got.ok) {
    if (got.error === 'host-not-allowed') {
      const host = await refusedHost(VERSION_FILE_URL, fetchImpl);
      return { ok: false, final: true, host: host || '?', message: `${VERSION_FILE_URL} redirige vers l’hôte « ${host || '?'} », hors de la liste des hôtes permis` };
    }
    return { ok: false, final: false, message: `${VERSION_FILE_URL} ne se lit pas (${got.error}${got.status ? ` ${got.status}` : ''})` };
  }
  const read = readVersionFile(got.text);
  if (!read.ok) return { ok: false, final: false, message: `le fichier de version lu à ${VERSION_FILE_URL} est illisible pour l’app (${read.reason})` };
  if (read.info.version !== version) return { ok: false, final: false, message: `${VERSION_FILE_URL} donne la version ${read.info.version}, pas ${version}` };
  const hosts = {};
  for (const [arch, d] of Object.entries(read.info.downloads)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
    try {
      const { response, url } = await getFollowing(d.url, { fetchImpl, env: NO_TEST_ORIGIN, signal: controller.signal, accept: ZIP_ACCEPT });
      await response.body?.cancel().catch(() => {});
      hosts[arch] = new URL(url).hostname;
    } catch (e) {
      if (e && e.code === 'host-not-allowed') return { ok: false, final: true, host: e.detail || '?', message: `${d.url} redirige vers l’hôte « ${e.detail || '?'} », hors de la liste des hôtes permis` };
      return { ok: false, final: false, message: `${d.url} ne se télécharge pas (${controller.signal.aborted ? 'timeout' : (e && e.message) || e})` };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: true, hosts };
}

/**
 * The whole check, with its attempts. Resolves the last walk's result; never throws.
 * @param {{ version: string, fetchImpl?: typeof fetch, attempts?: number, delayMs?: number, sleep?: (ms: number) => Promise<void>, log?: (line: string) => void }} options
 */
async function checkUpdateChain({ version, fetchImpl = defaultFetch, attempts = ATTEMPTS, delayMs = DELAY_MS, sleep = defaultSleep, log = () => {} }) {
  let last = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      last = await checkOnce(version, fetchImpl);
    } catch (e) {
      last = { ok: false, final: false, message: `erreur inattendue : ${(e && e.message) || e}` };
    }
    if (last.ok) return last;
    log(`  essai ${i}/${attempts} : ${last.message}`);
    if (last.final) break;
    if (i < attempts) await sleep(delayMs);
  }
  return last;
}

module.exports = { checkUpdateChain, ATTEMPTS, DELAY_MS };
