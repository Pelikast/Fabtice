// Getting the analysis tools onto the device: download from their pinned
// public location, check the SHA-256, keep them (`./store.ts`).
//
//   - Real progress: bytes received over all the files still to download.
//   - Resumable: a download is written to the store in pieces of about 2 MiB;
//     if the network drops (or the page is closed) the next attempt asks the
//     server for the rest (`Range`) and carries on. If the server ignores the
//     range, the file starts again from its first byte.
//   - Checked: a complete file whose SHA-256 is not the expected one is
//     refused (never used, never kept) and fetched again from the start;
//     after `MAX_ATTEMPTS` failures the analysis stops with `download-failed`.
//   - A file already kept is used as it is after a new SHA-256 check (a
//     damaged copy is dropped and fetched again).

import { AnalysisError, type DownloadProgress } from '../types';
import type { ModelSpec } from '../models';
import type { ModelStore } from './store';

export const MAX_ATTEMPTS = 3;
const PART_BYTES = 2 * 1024 * 1024;

export interface DownloadEnv {
  store: ModelStore;
  fetchFn?: typeof fetch;
  /** Waiting between two attempts (replaceable in tests). */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** SHA-256 of a buffer, lowercase hex (replaceable in tests). */
  sha256?: (data: ArrayBuffer) => Promise<string>;
  signal?: AbortSignal;
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AnalysisError('cancelled'));
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AnalysisError('cancelled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Failures of the integrity check are not worth resuming: the file starts again. */
class IntegrityError extends Error {}

/** Never lets a failing store (full disk, blocked storage) stop an analysis. */
async function quietly(work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch {
    // The file is then simply kept in memory for this run.
  }
}

function isAbort(e: unknown, signal?: AbortSignal): boolean {
  return !!signal?.aborted || (e instanceof AnalysisError && e.code === 'cancelled') || (e instanceof DOMException && e.name === 'AbortError');
}

/** The first byte of a `Content-Range: bytes 100-199/200` header, or null. */
function rangeStart(header: string | null): number | null {
  const m = header ? /^bytes (\d+)-/.exec(header.trim()) : null;
  return m ? Number(m[1]) : null;
}

/**
 * One attempt: resumes from the stored parts, reads the body, stores new
 * parts, returns the complete verified buffer.
 */
async function attempt(spec: ModelSpec, env: DownloadEnv, onBytes: (received: number) => void): Promise<ArrayBuffer> {
  const { store, signal } = env;
  const fetchFn = env.fetchFn ?? fetch;
  const hash = env.sha256 ?? sha256Hex;
  // The file is assembled in ONE buffer of its final size: the pieces kept for a resume are copied in and
  // let go, the pieces received are written into it as they come (a large tool, 353 MB, is never held twice).
  const whole = new Uint8Array(spec.bytes);
  let have = 0;
  let partIndex = 0;
  try {
    const kept = await store.readParts(spec.id);
    for (let i = 0; i < kept.length; i++) {
      const p = kept[i]!;
      if (have + p.byteLength > spec.bytes) {
        have = -1;
        break;
      }
      whole.set(new Uint8Array(p), have);
      have += p.byteLength;
      partIndex++;
      (kept as (ArrayBuffer | null)[])[i] = null;
    }
  } catch {
    have = 0;
    partIndex = 0;
  }
  if (have < 0) {
    await quietly(() => store.clearParts(spec.id));
    have = 0;
    partIndex = 0;
  }
  let received = have;
  onBytes(received);

  if (have < spec.bytes) {
    const res = await fetchFn(spec.url, { signal, headers: have > 0 ? { Range: `bytes=${have}-` } : undefined });
    if (res.status === 206 && have > 0 && rangeStart(res.headers.get('Content-Range')) === have) {
      // resuming
    } else if (res.status === 200) {
      // The whole file, whatever was asked.
      if (have > 0) {
        await quietly(() => store.clearParts(spec.id));
        have = 0;
        partIndex = 0;
        received = 0;
        onBytes(0);
      }
    } else {
      await res.body?.cancel().catch(() => {});
      throw new Error(`HTTP ${res.status}`);
    }
    if (!res.body) throw new Error('no body');
    const reader = res.body.getReader();
    let pendingFrom = received;
    const flush = async () => {
      const bytes = received - pendingFrom;
      if (!bytes) return;
      const buf = whole.slice(pendingFrom, received).buffer as ArrayBuffer;
      pendingFrom = received;
      const index = partIndex++;
      await quietly(() => store.putPart(spec.id, index, buf));
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (received + value.byteLength > spec.bytes) throw new IntegrityError('more bytes than expected');
        whole.set(value, received);
        received += value.byteLength;
        onBytes(received);
        if (received - pendingFrom >= PART_BYTES) await flush();
      }
    } catch (e) {
      // What was received is kept, so the next attempt resumes after it.
      if (!(e instanceof IntegrityError)) await flush().catch(() => {});
      await reader.cancel().catch(() => {});
      throw e;
    }
    await flush();
  }

  if (received !== spec.bytes) throw new Error(`incomplete: ${received} of ${spec.bytes} bytes`);
  if ((await hash(whole.buffer)) !== spec.sha256) throw new IntegrityError(`unexpected SHA-256 for ${spec.id}`);
  return whole.buffer;
}

/**
 * Downloads one file and stores it. Resolves with its bytes. Rejects with
 * `AnalysisError('download-failed')` after `MAX_ATTEMPTS`, or `cancelled`.
 */
export async function downloadModel(spec: ModelSpec, env: DownloadEnv, onBytes: (received: number) => void): Promise<ArrayBuffer> {
  const { store, signal } = env;
  const sleep = env.sleep ?? abortableSleep;
  let lastError: unknown = null;
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    if (signal?.aborted) throw new AnalysisError('cancelled');
    let started = -1;
    let latest = 0;
    try {
      const data = await attempt(spec, env, (r) => {
        if (started < 0) started = r;
        latest = r;
        onBytes(r);
      });
      await quietly(() => store.putFile({ id: spec.id, bytes: spec.bytes, sha256: spec.sha256, data }));
      await quietly(() => store.clearParts(spec.id));
      return data;
    } catch (e) {
      if (isAbort(e, signal)) throw new AnalysisError('cancelled');
      lastError = e;
      // A damaged file is never kept, and a resume that got nowhere (a server
      // that cannot do ranges, a stale part) starts again clean.
      if (e instanceof IntegrityError || (started > 0 && latest === started)) await quietly(() => store.clearParts(spec.id));
      if (n < MAX_ATTEMPTS) {
        try {
          await sleep(800 * n, signal);
        } catch {
          throw new AnalysisError('cancelled');
        }
      }
    }
  }
  throw new AnalysisError('download-failed', lastError instanceof Error ? lastError.message : String(lastError));
}

export interface EnsureOptions extends DownloadEnv {
  /** Called with the totals before the first byte, and as bytes arrive. */
  onProgress?: (p: DownloadProgress) => void;
}

/** What still has to be downloaded for these files (those not kept, or kept damaged: unknown until loaded). */
export async function missingModels(specs: readonly ModelSpec[], store: ModelStore): Promise<ModelSpec[]> {
  const missing: ModelSpec[] = [];
  for (const s of specs) {
    let ok = false;
    try {
      ok = await store.hasFile(s.id, s.bytes, s.sha256);
    } catch {
      ok = false;
    }
    if (!ok) missing.push(s);
  }
  return missing;
}

/**
 * Makes sure every file is on the device and returns their bytes by id. Files
 * already kept are read back and checked; the others are downloaded.
 */
export async function ensureModels(specs: readonly ModelSpec[], opts: EnsureOptions): Promise<Map<string, ArrayBuffer>> {
  const { store, signal } = opts;
  const hash = opts.sha256 ?? sha256Hex;
  const out = new Map<string, ArrayBuffer>();
  const missing = new Set((await missingModels(specs, store)).map((s) => s.id));
  const totalOf = () => specs.filter((s) => missing.has(s.id)).reduce((n, s) => n + s.bytes, 0);
  let doneBytes = 0;
  for (const spec of specs) {
    if (signal?.aborted) throw new AnalysisError('cancelled');
    if (!missing.has(spec.id)) {
      // Kept: read it back and check it again; a damaged copy is dropped and fetched anew.
      let kept: ArrayBuffer | null = null;
      try {
        const f = await store.getFile(spec.id);
        if (f && f.bytes === spec.bytes && (await hash(f.data)) === spec.sha256) kept = f.data;
      } catch {
        kept = null;
      }
      if (kept) {
        out.set(spec.id, kept);
        continue;
      }
      await quietly(() => store.deleteFile(spec.id));
      missing.add(spec.id); // late discovery: this file now counts in the download
    }
    const data = await downloadModel(spec, opts, (received) =>
      opts.onProgress?.({ modelId: spec.id, loaded: doneBytes + received, total: totalOf() }),
    );
    doneBytes += spec.bytes;
    out.set(spec.id, data);
  }
  return out;
}
