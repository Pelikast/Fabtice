// The real model, end to end in Node (ONNX Runtime Web, WebAssembly): download from its pinned
// Hugging Face address through the app's download code (SHA-256 checked), then the app's windows,
// resampling and decision on test signals built here, against the scores the bench computed in
// Python on the same signals (`fixtures/reference.json`, `reference.py`). Off by default:
//
//   FABTICE_INSTRUMENTS_REAL=1 npx vitest run src/structure/instruments/classify.real --silent=false
//
// (Behind an HTTPS proxy, Node's fetch needs NODE_USE_ENV_PROXY=1.)

import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY } from '../../analysis/models';
import { ensureModels } from '../../analysis/models/download';
import { MemoryModelStore } from '../../analysis/models/store';
import type { OrtLike, SessionLike } from '../../analysis/engine/session';
import reference from './fixtures/reference.json';
import { readExcerpt, sessionRunner } from './classify';
import { TEST_SAMPLE_RATE, testSignal, type TestSignalKind } from './testSignals';
import type { Group } from './model';

const run = process.env.FABTICE_INSTRUMENTS_REAL === '1' ? describe : describe.skip;

run('CED-Tiny, the real model', () => {
  it('downloads, runs, and matches the bench', { timeout: 300_000 }, async () => {
    const spec = MODEL_REGISTRY['ced-tiny'];
    const files = await ensureModels([spec], { store: new MemoryModelStore() });
    const ort = (await import('onnxruntime-web')) as unknown as OrtLike & {
      env: { wasm: { numThreads: number } };
      InferenceSession: { create(b: Uint8Array, o: object): Promise<SessionLike> };
    };
    ort.env.wasm.numThreads = 1;
    const t0 = performance.now();
    const session = await ort.InferenceSession.create(new Uint8Array(files.get(spec.id)!), { executionProviders: ['wasm'] });
    const loadMs = performance.now() - t0;
    const runner = sessionRunner(ort, session);
    const lines = [`load ${loadMs.toFixed(0)} ms`];
    for (const kind of ['reed', 'plucked', 'silence'] as TestSignalKind[]) {
      const x = testSignal(kind, reference.seconds);
      const t = performance.now();
      const r = await readExcerpt(x, TEST_SAMPLE_RATE, runner);
      lines.push(`${kind}: ${r.guess ? `${r.guess.instrument} ${r.guess.confidence.toFixed(2)}` : 'null'}, ${r.windows} window(s), ${(performance.now() - t).toFixed(0)} ms`);
      const want = reference.signals[kind].scores;
      if (!want) {
        expect(r.guess).toBeNull();
        expect(r.windows).toBe(0);
        continue;
      }
      expect(r.scores).not.toBeNull();
      reference.groups.forEach((g, k) => {
        const got = (r.scores as Record<string, number>)[g as Group];
        if (got !== undefined) expect(Math.abs(got - want[k]!)).toBeLessThan(0.05);
      });
    }
    console.log(lines.join('\n'));
  });
});
