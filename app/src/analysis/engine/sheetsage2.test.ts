// SheetSage2 in the app (`sheetsage2.ts`): the grammar, the reading of the tokens and the windows
// against a real run of the authors' PyTorch model (web/spikes/accords/modeles/dump_sheetsage2.py,
// « Satin Doll » of the bench, clean version), and the evidence handed to the decoding. The graphs
// themselves are checked against the authors' model by modeles/check_sheetsage2.py and, through
// this very code, by modeles/ts/ss2-parity.ts (729 tokens out of 729 identical).

import { describe, expect, it } from 'vitest';
import fixture from './fixtures/sheetsage2-satin.json';
import { N_CHORDS, NO_CHORD, chordRoot } from './chords';
import { combineFrames } from './combine';
import {
  Grammar,
  SS2_CHORDS,
  SS2_FPS,
  bestAllowed,
  decodeEvents,
  runSheetSage2,
  sheetsage2ChordFrames,
  ss2Label,
  ss2Units,
  ss2Windows,
  timeMap,
  type Ss2Manifest,
  type Ss2Runtime,
  type Ss2Session,
} from './sheetsage2';
import { SS2_LAYOUT, SS2_TO_APP } from './sheetsage2Vocab';
import type { MelFront } from './sheetsage2Mel';

const L = SS2_LAYOUT;

describe('the grammar', () => {
  it('allows every token the authors model wrote, in order', () => {
    const g = new Grammar();
    const tokens = fixture.tokens;
    for (let i = L.prefix.length; i < tokens.length; i++) {
      const t = tokens[i]!;
      const ok = g.ranges().some(([a, b]) => t >= a && t < b);
      expect(ok, `token ${i} (${t})`).toBe(true);
      if (g.update(t)) {
        expect(i).toBe(tokens.length - 1);
        break;
      }
    }
  });

  it('starts with a shift or a field, never the end; no more than four shifts in a row', () => {
    const g = new Grammar();
    expect(g.ranges().some(([a, b]) => L.eos >= a && L.eos < b)).toBe(false);
    for (let i = 0; i < 4; i++) g.update(L.shift[0] + 1);
    expect(g.ranges().some(([a]) => a === L.shift[0])).toBe(false);
  });

  it('picks the best allowed token, the first one on a tie', () => {
    const logits = new Float32Array(L.nTokens);
    logits[5] = 9; // not allowed
    logits[L.time[0] + 3] = 2;
    logits[L.time[0] + 7] = 2;
    expect(bestAllowed(logits, [[L.time[0], L.time[1]]])).toBe(L.time[0] + 3);
  });
});

describe('reading the tokens back', () => {
  it('gives the chords and their times of the PyTorch run', () => {
    const events = decodeEvents(fixture.tokens);
    const at = timeMap(events, 300);
    const chords = events.filter((e) => e.chord !== undefined);
    expect(chords.length).toBe(fixture.chords.length);
    for (let i = 0; i < chords.length; i++) {
      expect(chords[i]!.subbeat).toBe(fixture.chords[i]!.subbeat);
      expect(ss2Label(chords[i]!.chord!)).toBe(fixture.chords[i]!.chord);
      expect(at(chords[i]!.subbeat)).toBeCloseTo(fixture.chords[i]!.time, 3);
    }
  });

  it('extrapolates the time of steps outside the time stamps with the median step', () => {
    const at = timeMap(
      [
        { subbeat: 0, timestamp: 1 },
        { subbeat: 4, timestamp: 2 },
        { subbeat: 8, timestamp: 3 },
      ],
      300,
    );
    expect(at(2)).toBeCloseTo(1.5);
    expect(at(12)).toBeCloseTo(4);
    expect(at(-100)).toBe(0);
  });
});

describe('windows', () => {
  it('one window up to 5 minutes; longer pieces in 300 s windows every 200 s, the middles of the overlaps kept', () => {
    expect(ss2Windows(190)).toEqual([{ start: 0, acceptStart: 0, acceptEnd: 190 }]);
    const w = ss2Windows(745);
    expect(w.map((x) => x.start)).toEqual([0, 200, 400, 445]);
    expect(w[0]!.acceptStart).toBe(0);
    expect(w.at(-1)!.acceptEnd).toBe(745);
    for (let i = 1; i < w.length; i++) {
      expect(w[i]!.acceptStart).toBe(w[i - 1]!.acceptEnd);
      expect(w[i]!.acceptStart).toBeGreaterThan(w[i]!.start);
      expect(w[i - 1]!.acceptEnd).toBeLessThan(w[i - 1]!.start + 300);
    }
  });
});

describe('the evidence for the decoding', () => {
  it('holds each chord until the next, folded onto the app chords, with its bass', () => {
    const p1 = new Float32Array(SS2_CHORDS);
    const labels = ['G:min7/b7', 'C:7'];
    const idx = labels.map((l) => [...Array(SS2_CHORDS).keys()].find((i) => ss2Label(i) === l)!);
    p1[idx[0]!] = 1;
    const p2 = new Float32Array(SS2_CHORDS);
    p2[idx[1]!] = 0.75;
    p2[0] = 0.25; // N
    const f = sheetsage2ChordFrames({ duration: 2, chords: [{ time: 0.5, label: idx[0]!, probs: p1 }, { time: 1, label: idx[1]!, probs: p2 }], tokens: [] });
    expect(f.fps).toBe(SS2_FPS);
    expect(f.T).toBe(50);
    const row = (t: number) => f.probs.subarray(t * N_CHORDS, (t + 1) * N_CHORDS);
    expect(row(0)[NO_CHORD]).toBe(1); // before the first chord
    const gm7 = SS2_TO_APP[idx[0]!]!;
    expect(chordRoot(gm7)).toBe(7);
    expect(row(20)[gm7]).toBeCloseTo(1);
    expect(f.bass[20 * 13 + 5]).toBeCloseTo(1); // G minor 7 over F
    expect(row(30)[SS2_TO_APP[idx[1]!]!]).toBeCloseTo(0.75);
    expect(row(30)[NO_CHORD]).toBeCloseTo(0.25);
  });

  it('combines: the vote of both models on the chord, Tsumugi keeping its notes, bass and extensions', () => {
    const T = 4;
    const frames = (best: number, sure: number) => {
      const probs = new Float32Array(T * N_CHORDS).fill((1 - sure) / (N_CHORDS - 1));
      for (let t = 0; t < T; t++) probs[t * N_CHORDS + best] = sure;
      return { T, fps: 25, probs, pitch: new Float32Array(T * 12).fill(0.5), bass: new Float32Array(T * 13), detail: new Float32Array(T * 745) };
    };
    const ts = frames(10, 0.4);
    const ss = frames(20, 0.9);
    const c = combineFrames(ts, ss, { sheetsage2: 1, tsumugi: 1 });
    expect(c.probs[20]!).toBeGreaterThan(c.probs[10]!);
    expect(c.detail).toBe(ts.detail);
    expect(c.bass).toBe(ts.bass);
    let s = 0;
    for (let i = 0; i < N_CHORDS; i++) s += c.probs[i]!;
    expect(s).toBeCloseTo(1, 5);
    // Tsumugi alone when SheetSage2 weighs nothing.
    const t0 = combineFrames(ts, ss, { sheetsage2: 0, tsumugi: 1 });
    expect(t0.probs[10]!).toBeCloseTo(0.4, 1);
  });
});

describe('running (stand-in graphs)', () => {
  it('runs the parts in order, releases each session, and reads the chords the decoder writes', async () => {
    const manifest: Ss2Manifest = {
      layersPerPart: 12,
      parts: [
        { graph: 'a', bytes: 0, sha256: '', slices: [] },
        { graph: 'b', bytes: 0, sha256: '', slices: [] },
      ],
      cross: { graph: 'cross', bytes: 0, sha256: '', slices: [] },
      step: { graph: 'step', bytes: 0, sha256: '', slices: [] },
    };
    class Tensor {
      constructor(
        readonly type: string,
        readonly data: Float32Array | BigInt64Array,
        readonly dims: readonly number[],
      ) {}
    }
    const opened: string[] = [];
    const released: string[] = [];
    // The decoder writes, after the prompt: shift, time 0.5 s, chord; shift, time 1.0 s, chord; shift, time 2 s (stop: piece end).
    const script = [L.shift[0] + 2, L.time[0] + 50, L.chord[0] + 5, L.shift[0] + 2, L.time[0] + 100, L.chord[0] + 9, L.shift[0] + 2, L.time[0] + 200];
    let step = 0;
    const rt: Ss2Runtime = {
      Tensor: Tensor as unknown as Ss2Runtime['Tensor'],
      async open(info) {
        opened.push(info.graph);
        return {
          async run() {
            const T = 7500;
            if (info.graph === 'a') return { hidden_out: new Tensor('float32', new Float32Array(1), [1, T, 1024]), mixed_out: new Tensor('float32', new Float32Array(1), [1, T, 1024]) };
            if (info.graph === 'b') return { memory: new Tensor('float32', new Float32Array(1), [1, T, 512]) };
            if (info.graph === 'cross') return {};
            const logits = new Float32Array(L.nTokens);
            logits[script[Math.min(step, script.length - 1)]!] = 10;
            step++;
            const out: Record<string, Tensor> = { logits: new Tensor('float32', logits, [1, L.nTokens]) };
            for (let i = 0; i < 6; i++) for (const kv of 'kv') out[`new_self_${i}_${kv}`] = new Tensor('float32', new Float32Array(1), [1, 8, step + 1, 64]);
            return out;
          },
          async release() {
            released.push(info.graph);
          },
        } as unknown as Ss2Session;
      },
    };
    const front: MelFront = { window: new Float32Array(2048).fill(1), fb: new Float32Array(1025 * 128), mean: new Float32Array(128), std: new Float32Array(128).fill(1) };
    const audio = new Float32Array(24000 * 3);
    const seen: number[] = [];
    const out = await runSheetSage2(rt, manifest, front, audio, { check() {}, progress() {}, yieldNow: async () => {} }, (p) => seen.push(p.done));
    expect(opened).toEqual(['a', 'b', 'cross', 'step']);
    expect(released).toEqual(opened);
    expect(out.chords.map((c) => [c.time, c.label])).toEqual([
      [0.5, 5],
      [1, 9],
    ]);
    expect(out.tokens[0]!.at(-1)).toBe(L.eos);
    expect(Math.max(...seen)).toBe(ss2Units(3, manifest));
  }, 60000); // the front end computes the whole 300 s window (30 000 spectra)
});
