import { describe, expect, it, vi } from 'vitest';
import { classifyExcerpt, readExcerpt, sessionRunner, type WindowRunner } from './classify';
import { createInstrumentRecognizer, INSTRUMENT_MODEL, instrumentModelSourceText, type InstrumentsWorkerLike } from './recognizer';
import type { FromInstrumentsWorker, ToInstrumentsWorker } from './protocol';

const tone = (seconds: number, sr = 48000) => {
  const x = new Float32Array(seconds * sr);
  for (let i = 0; i < x.length; i++) x[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / sr);
  return x;
};

/** A runner that always answers the same 527 scores. */
const fixed = (classes: Record<number, number>): WindowRunner => {
  const out = new Float32Array(527);
  for (const [i, v] of Object.entries(classes)) out[Number(i)] = v;
  return vi.fn(async () => out);
};

describe('classifyExcerpt', () => {
  it('reads every window and names a clear trumpet', async () => {
    const run = fixed({ 187: 0.8, 185: 0.5, 197: 0.05 });
    const r = await readExcerpt(tone(24), 48000, run);
    expect(r.windows).toBe(4); // 0, 5, 10 s and the end (14 s)
    expect(run).toHaveBeenCalledTimes(4);
    expect(r.guess?.instrument).toBe('trumpet');
  });

  it('answers « Vents » between saxophone and clarinet', async () => {
    expect((await classifyExcerpt(tone(8), 48000, fixed({ 197: 0.5, 198: 0.45 })))?.instrument).toBe('winds');
  });

  it('does not run the model on silence', async () => {
    const run = fixed({ 187: 0.9 });
    expect(await classifyExcerpt(new Float32Array(48000 * 8), 48000, run)).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('stops when aborted', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(classifyExcerpt(tone(8), 48000, fixed({}), { signal: ctl.signal })).rejects.toThrow();
  });

  it('feeds a session [1, samples] and reads its first output', async () => {
    const seen: number[][] = [];
    const ort = { Tensor: class { constructor(public type: string, public data: Float32Array, public dims: number[]) { seen.push(dims); } } };
    const out = new Float32Array(527);
    out[196] = 0.9;
    const session = { inputNames: ['waveform'], outputNames: ['logits'], run: async () => ({ logits: { data: out, dims: [1, 527] } }) };
    const g = await classifyExcerpt(tone(4, 16000), 16000, sessionRunner(ort as never, session));
    expect(g?.instrument).toBe('flute');
    expect(seen).toEqual([[1, 64000]]);
    const bad = { ...session, run: async () => ({ logits: { data: new Float32Array(3), dims: [1, 3] } }) };
    await expect(classifyExcerpt(tone(4, 16000), 16000, sessionRunner(ort as never, bad))).rejects.toThrow(/unexpected/);
  });
});

/** A fake worker: `answer` decides what it replies to each excerpt (undefined: never replies). */
function fakeWorker(answer: (m: Extract<ToInstrumentsWorker, { type: 'recognise' }>) => FromInstrumentsWorker | undefined) {
  const created: InstrumentsWorkerLike[] = [];
  const posted: ToInstrumentsWorker[] = [];
  const create = () => {
    const w: InstrumentsWorkerLike = {
      onmessage: null,
      onerror: null,
      terminate: vi.fn(),
      postMessage(m) {
        posted.push(m);
        if (m.type !== 'recognise') return;
        const a = answer(m);
        if (a) queueMicrotask(() => w.onmessage?.({ data: a } as MessageEvent<FromInstrumentsWorker>));
      },
    };
    created.push(w);
    return w;
  };
  return { create, created, posted };
}

describe('the model as shown', () => {
  it('comes from a pinned Hugging Face address, with its licence', () => {
    expect(INSTRUMENT_MODEL.url).toMatch(/^https:\/\/huggingface\.co\/mispeech\/ced-tiny\/resolve\/[0-9a-f]{40}\/model\.onnx$/);
    expect(INSTRUMENT_MODEL.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(instrumentModelSourceText('6,7 Mo')).toBe(
      'Pour reconnaître les instruments à vent d’un solo, Fabtice télécharge une fois CED-Tiny (6,7 Mo) depuis Hugging Face. Licence : Apache-2.0.',
    );
  });
});

describe('createInstrumentRecognizer', () => {
  it('passes the excerpt to its worker (a copy) and returns its answer', async () => {
    const fw = fakeWorker((m) => ({ type: 'result', id: m.id, guess: { instrument: 'clarinet', confidence: 0.8 } }));
    const r = createInstrumentRecognizer({ createWorker: fw.create });
    const x = tone(3);
    expect(await r.recognise(x, 48000)).toEqual({ instrument: 'clarinet', confidence: 0.8 });
    expect(x.length).toBe(3 * 48000); // the caller's excerpt is untouched
    expect(fw.posted[0]).toMatchObject({ type: 'recognise', sampleRate: 48000, download: true });
    expect(fw.created).toHaveLength(1);
  });

  it('resolves to null when the model is unusable, and then answers null at once for a while', async () => {
    let t = 0;
    const fw = fakeWorker((m) => ({ type: 'unavailable', id: m.id, reason: 'offline' }));
    const r = createInstrumentRecognizer({ createWorker: fw.create, now: () => t, retryMs: 1000 });
    expect(await r.recognise(tone(3), 48000)).toBeNull();
    expect(await r.recognise(tone(3), 48000)).toBeNull();
    expect(fw.posted.filter((m) => m.type === 'recognise')).toHaveLength(1);
    t = 2000;
    expect(await r.recognise(tone(3), 48000)).toBeNull();
    expect(fw.posted.filter((m) => m.type === 'recognise')).toHaveLength(2);
  });

  it('does not download when not allowed, and asks again next time', async () => {
    const fw = fakeWorker((m) => (m.download ? { type: 'result', id: m.id, guess: null } : { type: 'unavailable', id: m.id, reason: 'not downloaded' }));
    let allowed = false;
    const r = createInstrumentRecognizer({ createWorker: fw.create, allowDownload: () => allowed });
    expect(await r.recognise(tone(3), 48000)).toBeNull();
    allowed = true;
    await r.recognise(tone(3), 48000);
    expect(fw.posted.filter((m) => m.type === 'recognise').map((m) => (m as { download: boolean }).download)).toEqual([false, true]);
  });

  it('resolves to null on abort and on time out, and tells the worker', async () => {
    const fw = fakeWorker(() => undefined);
    const r = createInstrumentRecognizer({ createWorker: fw.create, timeoutMs: 20 });
    expect(await r.recognise(tone(3), 48000)).toBeNull();
    const ctl = new AbortController();
    const p = r.recognise(tone(3), 48000, ctl.signal);
    ctl.abort();
    expect(await p).toBeNull();
    expect(fw.posted.filter((m) => m.type === 'cancel')).toHaveLength(2);
    const pre = new AbortController();
    pre.abort();
    expect(await r.recognise(tone(3), 48000, pre.signal)).toBeNull();
  });

  it('never throws: a worker that cannot start, or that crashes', async () => {
    const r = createInstrumentRecognizer({ createWorker: () => { throw new Error('no worker'); } });
    expect(await r.recognise(tone(3), 48000)).toBeNull();
    const fw = fakeWorker(() => undefined);
    const r2 = createInstrumentRecognizer({ createWorker: fw.create });
    const p = r2.recognise(tone(3), 48000);
    await Promise.resolve();
    fw.created[0]!.onerror?.(new Error('crash'));
    expect(await p).toBeNull();
    expect(fw.created[0]!.terminate).toHaveBeenCalled();
    expect(await r.recognise(new Float32Array(0), 48000)).toBeNull();
  });
});
