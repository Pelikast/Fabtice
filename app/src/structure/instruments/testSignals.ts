// Deterministic test signals for the unit tests, built by the same formula as the bench's
// `web/spikes/structure/instruments/reference.py#signal` (which computed the reference values
// in `fixtures/reference.json`). Used by tests only.

export const TEST_SAMPLE_RATE = 44100;
const NOTES = [220.0, 246.94, 261.63, 293.66, 329.63, 293.66, 261.63, 246.94];

export type TestSignalKind = 'reed' | 'plucked' | 'silence';

export function testSignal(kind: TestSignalKind, seconds = 6): Float32Array {
  const sr = TEST_SAMPLE_RATE;
  const n = Math.floor(seconds * sr);
  const out = new Float32Array(n);
  if (kind === 'silence') return out;
  let cum = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let f = NOTES[Math.floor(t / 0.5) % NOTES.length]!;
    if (kind === 'reed') f *= 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t);
    cum += f;
    const phase = (2 * Math.PI * cum) / sr;
    let x = 0;
    if (kind === 'reed') {
      for (let h = 1; h <= 12; h++) x += (1 / h) * (h % 2 ? 1 : 0.35) * Math.sin(h * phase);
      out[i] = 0.3 * x;
    } else {
      const age = t - 0.5 * Math.floor(t / 0.5);
      for (let h = 1; h <= 8; h++) x += (Math.exp(-age * (3 + 2 * h)) / h) * Math.sin(h * phase);
      out[i] = 0.4 * x;
    }
  }
  return out;
}
