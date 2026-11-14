// Download of the analysis tools: progress, integrity, resuming, retries,
// cancellation, what is kept. A scripted `fetch` stands in for the hub.

import { describe, expect, it } from 'vitest';
import type { ModelSpec } from '../models';
import { AnalysisError, type DownloadProgress } from '../types';
import { MAX_ATTEMPTS, downloadModel, ensureModels, missingModels, sha256Hex } from './download';
import { MemoryModelStore } from './store';

const enc = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255);

async function spec(id: string, bytes: Uint8Array): Promise<ModelSpec> {
  return {
    id,
    name: id,
    role: 'test',
    url: `https://example.test/${id}.onnx`,
    host: 'Example',
    licence: 'MIT',
    bytes: bytes.length,
    sha256: await sha256Hex(bytes.buffer.slice(0) as ArrayBuffer),
  };
}

interface Plan {
  /** Called for every request; returns the response. */
  (call: number, init: RequestInit | undefined, content: Uint8Array): Response | Promise<Response>;
}

/** Streams `bytes` in pieces of `piece`, then optionally fails. */
function stream(bytes: Uint8Array, { piece = 1000, failAfter = Infinity }: { piece?: number; failAfter?: number } = {}): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= bytes.length) return controller.close();
      if (sent >= failAfter) return controller.error(new TypeError('network error'));
      const end = Math.min(bytes.length, sent + piece, failAfter);
      controller.enqueue(bytes.slice(sent, end));
      sent = end;
    },
  });
}

/** A hub that serves `content`, with Range support, counting requests. */
function hub(content: Uint8Array, plan?: Plan) {
  const calls: { url: string; range: string | null }[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(url), range: headers.get('Range') });
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    if (plan) return plan(calls.length, init, content);
    return ok(content, headers);
  }) as typeof fetch;
  return { fetchFn, calls };
}

function ok(content: Uint8Array, headers: Headers, opts: { failAfter?: number; ignoreRange?: boolean } = {}): Response {
  const range = headers.get('Range');
  const m = range ? /^bytes=(\d+)-$/.exec(range) : null;
  if (m && !opts.ignoreRange) {
    const start = Number(m[1]);
    return new Response(stream(content.slice(start), { failAfter: opts.failAfter }), {
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${content.length - 1}/${content.length}` },
    });
  }
  return new Response(stream(content, { failAfter: opts.failAfter }), { status: 200 });
}

const noWait = async () => {};

describe('downloadModel', () => {
  it('downloads, checks, keeps and reports progress', async () => {
    const content = enc(5000, 1);
    const s = await spec('a', content);
    const store = new MemoryModelStore();
    const { fetchFn, calls } = hub(content);
    const seen: number[] = [];
    const data = await downloadModel(s, { store, fetchFn, sleep: noWait }, (r) => seen.push(r));
    expect(new Uint8Array(data)).toEqual(content);
    expect(calls.length).toBe(1);
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(5000);
    expect(seen.every((v, i) => i === 0 || v >= seen[i - 1]!)).toBe(true);
    expect(await store.hasFile('a', 5000, s.sha256)).toBe(true);
    expect(await store.readParts('a')).toEqual([]);
  });

  it('refuses a damaged file and fetches it again from the start', async () => {
    const content = enc(3000, 2);
    const s = await spec('a', content);
    const store = new MemoryModelStore();
    const damaged = content.slice();
    damaged[1500]! ^= 1;
    const { fetchFn, calls } = hub(content, (n, _init, c) => ok(n === 1 ? damaged : c, new Headers()));
    const data = await downloadModel(s, { store, fetchFn, sleep: noWait }, () => {});
    expect(new Uint8Array(data)).toEqual(content);
    expect(calls.length).toBe(2);
    expect(calls[1]!.range).toBeNull(); // from the start, not a resume of the damaged bytes
    expect((await store.getFile('a'))!.sha256).toBe(s.sha256);
  });

  it('gives up after the allowed attempts and keeps nothing damaged', async () => {
    const content = enc(3000, 3);
    const s = await spec('a', content);
    const store = new MemoryModelStore();
    const damaged = enc(3000, 99);
    const { fetchFn, calls } = hub(content, () => ok(damaged, new Headers()));
    const waits: number[] = [];
    const error = await downloadModel(s, { store, fetchFn, sleep: async (ms) => void waits.push(ms) }, () => {}).catch((e) => e);
    expect(error).toBeInstanceOf(AnalysisError);
    expect(error.code).toBe('download-failed');
    expect(calls.length).toBe(MAX_ATTEMPTS);
    expect(waits).toEqual([800, 1600]);
    expect(await store.getFile('a')).toBeNull();
    expect(await store.readParts('a')).toEqual([]);
  });

  it('resumes after the network drops, asking only for the rest', async () => {
    const content = enc(6000, 4);
    const s = await spec('a', content);
    const store = new MemoryModelStore();
    const { fetchFn, calls } = hub(content, (n, init) => ok(content, new Headers(init?.headers), { failAfter: n === 1 ? 2500 : undefined }));
    const seen: number[] = [];
    const data = await downloadModel(s, { store, fetchFn, sleep: noWait }, (r) => seen.push(r));
    expect(new Uint8Array(data)).toEqual(content);
    expect(calls.map((c) => c.range)).toEqual([null, 'bytes=2500-']);
    expect(seen[seen.length - 1]).toBe(6000);
    // The progress did not go back to zero when it resumed.
    expect(Math.min(...seen.slice(seen.indexOf(2500)))).toBe(2500);
  });

  it('resumes from pieces already kept (a page closed in the middle)', async () => {
    const content = enc(6000, 5);
    const s = await spec('a', content);
    const store = new MemoryModelStore();
    await store.putPart('a', 0, content.slice(0, 4000).buffer);
    const { fetchFn, calls } = hub(content);
    const data = await downloadModel(s, { store, fetchFn, sleep: noWait }, () => {});
    expect(new Uint8Array(data)).toEqual(content);
    expect(calls.map((c) => c.range)).toEqual(['bytes=4000-']);
  });

  it('starts again when the server ignores the range', async () => {
    const content = enc(5000, 6);
    const s = await spec('a', content);
    const store = new MemoryModelStore();
    await store.putPart('a', 0, content.slice(0, 2000).buffer);
    const { fetchFn, calls } = hub(content, (_n, init) => ok(content, new Headers(init?.headers), { ignoreRange: true }));
    const data = await downloadModel(s, { store, fetchFn, sleep: noWait }, () => {});
    expect(new Uint8Array(data)).toEqual(content);
    expect(calls.length).toBe(1);
    expect(await store.readParts('a')).toEqual([]);
  });

  it('retries a failing request and then says the download failed', async () => {
    const content = enc(2000, 7);
    const s = await spec('a', content);
    const store = new MemoryModelStore();
    const { fetchFn, calls } = hub(content, () => {
      throw new TypeError('Failed to fetch');
    });
    const error = await downloadModel(s, { store, fetchFn, sleep: noWait }, () => {}).catch((e) => e);
    expect(error).toBeInstanceOf(AnalysisError);
    expect(error.code).toBe('download-failed');
    expect(calls.length).toBe(MAX_ATTEMPTS);
  });

  it('treats an HTTP error as a failure to retry', async () => {
    const content = enc(2000, 8);
    const s = await spec('a', content);
    const { fetchFn, calls } = hub(content, (n, init) => (n < 3 ? new Response('no', { status: 503 }) : ok(content, new Headers(init?.headers))));
    const data = await downloadModel(s, { store: new MemoryModelStore(), fetchFn, sleep: noWait }, () => {});
    expect(new Uint8Array(data)).toEqual(content);
    expect(calls.length).toBe(3);
  });

  it('refuses a file that is longer than expected', async () => {
    const content = enc(2000, 9);
    const s = await spec('a', content);
    const longer = enc(2500, 9);
    const { fetchFn } = hub(content, () => ok(longer, new Headers()));
    const error = await downloadModel(s, { store: new MemoryModelStore(), fetchFn, sleep: noWait }, () => {}).catch((e) => e);
    expect(error.code).toBe('download-failed');
  });

  it('works when the store fails (the file stays in memory for this run)', async () => {
    const content = enc(2000, 10);
    const s = await spec('a', content);
    const broken = new MemoryModelStore();
    broken.putFile = async () => {
      throw new Error('quota');
    };
    broken.putPart = async () => {
      throw new Error('quota');
    };
    const data = await downloadModel(s, { store: broken, fetchFn: hub(content).fetchFn, sleep: noWait }, () => {});
    expect(new Uint8Array(data)).toEqual(content);
  });

  it('stops at once when cancelled, during a request that never answers', async () => {
    const content = enc(2000, 11);
    const s = await spec('a', content);
    const controller = new AbortController();
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch;
    const work = downloadModel(s, { store: new MemoryModelStore(), fetchFn, signal: controller.signal }, () => {});
    setTimeout(() => controller.abort(), 10);
    const error = await work.catch((e) => e);
    expect(error).toBeInstanceOf(AnalysisError);
    expect(error.code).toBe('cancelled');
  });

  it('stops at once when cancelled, while waiting between two attempts', async () => {
    const content = enc(2000, 12);
    const s = await spec('a', content);
    const controller = new AbortController();
    const { fetchFn } = hub(content, () => {
      throw new TypeError('Failed to fetch');
    });
    const work = downloadModel(s, { store: new MemoryModelStore(), fetchFn, signal: controller.signal }, () => {});
    setTimeout(() => controller.abort(), 30);
    const t0 = Date.now();
    const error = await work.catch((e) => e);
    expect(error.code).toBe('cancelled');
    expect(Date.now() - t0).toBeLessThan(700); // not the 800 ms of the wait
  });
});

describe('ensureModels', () => {
  it('downloads what is missing, uses what is kept, and reports bytes over all the files', async () => {
    const a = enc(3000, 21);
    const b = enc(4000, 22);
    const sa = await spec('a', a);
    const sb = await spec('b', b);
    const store = new MemoryModelStore();
    await store.putFile({ id: 'a', bytes: a.length, sha256: sa.sha256, data: a.buffer.slice(0) as ArrayBuffer });
    const requested: string[] = [];
    const fetchFn = (async (url: string) => {
      requested.push(url);
      return ok(b, new Headers());
    }) as unknown as typeof fetch;
    expect((await missingModels([sa, sb], store)).map((s) => s.id)).toEqual(['b']);
    const progress: DownloadProgress[] = [];
    const files = await ensureModels([sa, sb], { store, fetchFn, sleep: noWait, onProgress: (p) => progress.push(p) });
    expect(requested).toEqual([sb.url]);
    expect(new Uint8Array(files.get('a')!)).toEqual(a);
    expect(new Uint8Array(files.get('b')!)).toEqual(b);
    expect(progress.length).toBeGreaterThan(2);
    expect(progress.every((p) => p.modelId === 'b' && p.total === 4000)).toBe(true);
    expect(progress[progress.length - 1]!.loaded).toBe(4000);
  });

  it('downloads nothing when everything is kept', async () => {
    const a = enc(3000, 23);
    const sa = await spec('a', a);
    const store = new MemoryModelStore();
    await store.putFile({ id: 'a', bytes: a.length, sha256: sa.sha256, data: a.buffer.slice(0) as ArrayBuffer });
    const { fetchFn, calls } = hub(a);
    const progress: DownloadProgress[] = [];
    await ensureModels([sa], { store, fetchFn, onProgress: (p) => progress.push(p) });
    expect(calls.length).toBe(0);
    expect(progress.length).toBe(0);
  });

  it('drops a kept file that was damaged on the device and fetches it again', async () => {
    const a = enc(3000, 24);
    const sa = await spec('a', a);
    const store = new MemoryModelStore();
    const rotten = a.slice();
    rotten[10]! ^= 255;
    await store.putFile({ id: 'a', bytes: a.length, sha256: sa.sha256, data: rotten.buffer as ArrayBuffer });
    const { fetchFn, calls } = hub(a);
    const files = await ensureModels([sa], { store, fetchFn, sleep: noWait });
    expect(calls.length).toBe(1);
    expect(new Uint8Array(files.get('a')!)).toEqual(a);
    expect(new Uint8Array((await store.getFile('a'))!.data)).toEqual(a);
  });

});

describe('the list of models', () => {
  it('has the same files, sizes and digests as the prototype\'s own list', async () => {
    // `web/spikes/analyse/lib/models.js` (plain JavaScript, no declaration file).
    // @ts-expect-error no types for the prototype
    const { MODELS } = await import('../../../../web/spikes/analyse/lib/models.js');
    const { MODEL_REGISTRY } = await import('../models');
    const pairs: [string, keyof typeof MODEL_REGISTRY][] = [
      ['logmel', 'beat-this-logmel'], ['small0', 'beat-this-small0'], ['final0', 'beat-this-final0'], ['crema', 'crema-chords'],
    ];
    for (const [proto, id] of pairs) {
      const want = (MODELS as Record<string, { url: string; bytes: number; sha256: string; licence: string }>)[proto]!;
      const got = MODEL_REGISTRY[id];
      expect({ url: got.url, bytes: got.bytes, sha256: got.sha256, licence: got.licence }).toEqual({ url: want.url, bytes: want.bytes, sha256: want.sha256, licence: want.licence });
    }
  });
});
