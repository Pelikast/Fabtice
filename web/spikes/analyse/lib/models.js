// Model registry and download with integrity check (browser only).
// Weights are fetched from public Hugging Face repositories at a pinned revision, checked
// against their SHA-256 and kept in the Cache Storage for later visits.

const HF = 'https://huggingface.co/';
const BEAT_REPO = 'nilsbc/beat-this-onnx/resolve/0d66b58ee1b3b42ec5e82334949626295f3ed82b/';
const CREMA_REPO = 'thebluescreen/crema-chords-onnx/resolve/302ae89e3ed7753fc8da9cb08274aff446d8fe47/';

export const MODELS = {
  logmel: {
    name: 'Beat This! front end (log-mel)', url: HF + BEAT_REPO + 'logmel.onnx', bytes: 4468830,
    sha256: 'f5afa499f5a42b05ea89a214561170cd4b76f92d67d3227f7c9833e8d79bbb43', licence: 'MIT',
  },
  small0: {
    name: 'Beat This! small0', url: HF + BEAT_REPO + 'beat_this_small0.onnx', bytes: 10555642,
    sha256: '53fda6e96afae7f44d898fa5f020272eda967a92839306bf7a3d0898fb8a0d9a', licence: 'MIT',
  },
  final0: {
    name: 'Beat This! final0', url: HF + BEAT_REPO + 'beat_this_final0.onnx', bytes: 83162700,
    sha256: 'a7e2c68b27f9db6a73416017f784ea8551a01373f4955a98db018827760c4a14', licence: 'MIT',
  },
  crema: {
    name: 'CREMA chords', url: HF + CREMA_REPO + 'crema_chords.onnx', bytes: 2728454,
    sha256: '3222e641f23f668caabb48498d8d4db258216753af8d1da2753da002eb786c1e', licence: 'BSD-2-Clause',
  },
};

const CACHE = 'fabtice-analyse-models-v1';

async function sha256Hex(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function download(url, bytes, onProgress) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(Math.min(1, got / bytes));
  }
  if (got !== bytes) throw new Error(`taille inattendue (${got} au lieu de ${bytes} octets)`);
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out.buffer;
}

// Returns { buffer, fromCache, ms }.
export async function loadModel(key, onProgress = () => {}) {
  const spec = MODELS[key];
  const t0 = performance.now();
  let cache = null;
  try { cache = await caches.open(CACHE); } catch { /* storage unavailable */ }
  if (cache) {
    const hit = await cache.match(spec.url);
    if (hit) {
      const buf = await hit.arrayBuffer();
      if ((await sha256Hex(buf)) === spec.sha256) return { buffer: buf, fromCache: true, ms: performance.now() - t0 };
      await cache.delete(spec.url);
    }
  }
  const buf = await download(spec.url, spec.bytes, onProgress);
  const h = await sha256Hex(buf);
  if (h !== spec.sha256) throw new Error(`empreinte SHA-256 inattendue pour ${spec.name}`);
  if (cache) {
    try { await cache.put(spec.url, new Response(buf.slice(0))); } catch { /* quota */ }
  }
  return { buffer: buf, fromCache: false, ms: performance.now() - t0 };
}
