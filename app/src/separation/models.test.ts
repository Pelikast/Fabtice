import { describe, expect, it } from 'vitest';
import bundled from './models.json';
import { bundledModelList, loadModelList, validateModelList } from './models';

const clone = () => JSON.parse(JSON.stringify(bundled)) as { version: number; updated: string; models: Record<string, unknown>[] };

describe('the list of separation tools', () => {
  it('the bundled list passes the strict check and holds the three tools of the prototype', () => {
    const list = bundledModelList();
    expect(list.models.map((m) => m.id)).toEqual(['bs-roformer-sw', 'htdemucs-6s', 'scnet']);
    for (const m of list.models) {
      expect(m.file.url).toMatch(/^https:\/\/huggingface\.co\/.+\/resolve\/[0-9a-f]{40}\//);
      expect(m.file.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('matches the prototype: same files, sizes and SHA-256 (web/spikes/separation/models.js)', () => {
    const byId = Object.fromEntries(bundledModelList().models.map((m) => [m.id, m.file]));
    expect(byId['bs-roformer-sw']).toMatchObject({ bytes: 352778874, sha256: 'd3d2bac77a7023282cb5f35a5807179e34076b60589867b572275f1a8ec36444' });
    expect(byId['htdemucs-6s']).toMatchObject({ bytes: 55845005, sha256: '8cde625ece6fddb022a1a021cc1f2bef65a16711c20710e0e96e317f38fe994c' });
    expect(byId['scnet']).toMatchObject({ bytes: 12900277, sha256: '98228931494151762a1c4ab1ec7899a894b1f81fd4a509921a9d2f9bacc50845' });
  });

  it('refuses an unpinned address, another host, plain http, a missing or wrong SHA-256', () => {
    const cases: [string, (m: Record<string, unknown>) => void][] = [
      ['unpinned', (m) => ((m.file as Record<string, unknown>).url = 'https://huggingface.co/a/b/resolve/main/x.onnx')],
      ['other host', (m) => ((m.file as Record<string, unknown>).url = 'https://example.com/a/b/resolve/a744f80957374e1735ad70fa122670b7961da8cc/x.onnx')],
      ['http', (m) => ((m.file as Record<string, unknown>).url = 'http://huggingface.co/a/b/resolve/a744f80957374e1735ad70fa122670b7961da8cc/x.onnx')],
      ['no sha', (m) => delete (m.file as Record<string, unknown>).sha256],
      ['short sha', (m) => ((m.file as Record<string, unknown>).sha256 = 'abc')],
      ['size', (m) => ((m.file as Record<string, unknown>).bytes = -3)],
      ['unknown stem', (m) => (m.stems = ['vocals', 'kazoo'])],
      ['no licence', (m) => delete m.licence],
    ];
    for (const [name, spoil] of cases) {
      const doc = clone();
      spoil(doc.models[0]!);
      expect(() => validateModelList(doc), name).toThrow();
    }
    expect(() => validateModelList({ ...clone(), version: 2 })).toThrow();
    const dup = clone();
    dup.models.push(dup.models[0]!);
    expect(() => validateModelList(dup)).toThrow();
  });

  it('uses the remote list when it passes, the bundled one otherwise; an empty remote list withdraws every tool', async () => {
    const remote = clone();
    remote.models = remote.models.slice(2);
    const ok = await loadModelList({ fetchFn: (async () => new Response(JSON.stringify(remote))) as typeof fetch });
    expect(ok.source).toBe('remote');
    expect(ok.list.models.map((m) => m.id)).toEqual(['scnet']);
    const empty = await loadModelList({ fetchFn: (async () => new Response(JSON.stringify({ ...remote, models: [] }))) as typeof fetch });
    expect(empty.source).toBe('remote');
    expect(empty.list.models).toHaveLength(0);
    const spoilt = clone();
    (spoilt.models[1]!.file as Record<string, unknown>).sha256 = 'nope';
    const bad = await loadModelList({ fetchFn: (async () => new Response(JSON.stringify(spoilt))) as typeof fetch });
    expect(bad.source).toBe('bundled');
    expect(bad.list.models).toHaveLength(3);
    const down = await loadModelList({ fetchFn: (async () => new Response('', { status: 404 })) as typeof fetch });
    expect(down).toMatchObject({ source: 'bundled', problem: 'HTTP 404' });
    // Not JSON at all (a page of text where the list should be), or a list of another shape: the bundled one.
    const garbled = await loadModelList({ fetchFn: (async () => new Response('<html>not here</html>')) as typeof fetch });
    expect(garbled.source).toBe('bundled');
    expect(garbled.list.models).toHaveLength(3);
    const shape = await loadModelList({ fetchFn: (async () => new Response(JSON.stringify({ version: 1, updated: 'x', models: {} }))) as typeof fetch });
    expect(shape.source).toBe('bundled');
    const offline = await loadModelList({ fetchFn: (async () => Promise.reject(new TypeError('network'))) as typeof fetch });
    expect(offline.source).toBe('bundled');
    const slow = await loadModelList({ timeoutMs: 20, fetchFn: ((_u: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch });
    expect(slow.source).toBe('bundled');
  });
});
