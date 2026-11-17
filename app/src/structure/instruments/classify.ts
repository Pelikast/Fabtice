// The pure core of the recogniser, testable in Node: an excerpt, a way to run the model on one
// 16 kHz window, and the answer. The worker (`instruments.worker.ts`) hands in ONNX Runtime;
// tests hand in a fake session, or the real one (`classify.real.test.ts`).

import type { OrtLike, SessionLike } from '../../analysis/engine/session';
import type { InstrumentGuess } from '../types';
import { DECISION, decide, type DecisionRule } from './decide';
import { excerptWindows } from './excerpt';
import { CED_CLASSES, groupScores, meanScores, type GroupScores } from './model';

/** Runs the model on one 16 kHz window: its 527 AudioSet scores. */
export type WindowRunner = (window: Float32Array) => Promise<ArrayLike<number>>;

/** A runner over an ONNX Runtime session of CED-Tiny (input `[1, samples]`, output `[1, 527]`). */
export function sessionRunner(ort: OrtLike, session: SessionLike): WindowRunner {
  const input = session.inputNames[0]!;
  const output = session.outputNames[0]!;
  return async (window) => {
    const out = await session.run({ [input]: new ort.Tensor('float32', window, [1, window.length]) });
    const t = out[output];
    if (!t || t.data.length < CED_CLASSES) throw new Error('unexpected model output');
    return t.data;
  };
}

export interface ExcerptReading {
  guess: InstrumentGuess | null;
  /** Mean group scores over the windows read (null: nothing was played). */
  scores: GroupScores | null;
  /** Windows read by the model. */
  windows: number;
}

/** Reads an excerpt (mono, any sample rate). Throws only what the runner throws, or on abort. */
export async function readExcerpt(
  mono: Float32Array,
  sampleRate: number,
  run: WindowRunner,
  options: { signal?: AbortSignal; rule?: DecisionRule; pause?: () => Promise<unknown> } = {},
): Promise<ExcerptReading> {
  const windows = excerptWindows(mono, sampleRate);
  const each: GroupScores[] = [];
  for (const w of windows) {
    if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    each.push(groupScores(await run(w)));
    // « Alléger le travail pour l'appareil »: a rest after each window (absent at full speed).
    if (options.pause) await options.pause();
  }
  const scores = meanScores(each);
  return { guess: scores ? decide(scores, options.rule ?? DECISION) : null, scores, windows: each.length };
}

/** `readExcerpt`, answer only. */
export async function classifyExcerpt(
  mono: Float32Array,
  sampleRate: number,
  run: WindowRunner,
  options: { signal?: AbortSignal; rule?: DecisionRule; pause?: () => Promise<unknown> } = {},
): Promise<InstrumentGuess | null> {
  return (await readExcerpt(mono, sampleRate, run, options)).guess;
}
