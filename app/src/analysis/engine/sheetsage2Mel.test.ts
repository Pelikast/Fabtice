import { describe, expect, it } from 'vitest';
import fixture from './fixtures/sheetsage2-mel.json';
import { SS2_MELS, melFrames, safetensor, type MelFront } from './sheetsage2Mel';

/** torchaudio's MelScale filters (HTK scale, no normalisation), which the MERT-v2 file holds. */
function htkFilters(nMels: number, rate: number, bins: number): Float32Array {
  const hz2mel = (f: number) => 2595 * Math.log10(1 + f / 700);
  const mel2hz = (m: number) => 700 * (10 ** (m / 2595) - 1);
  const freqs = Array.from({ length: bins }, (_, i) => ((rate / 2) * i) / (bins - 1));
  const mMax = hz2mel(rate / 2);
  const pts = Array.from({ length: nMels + 2 }, (_, i) => mel2hz((mMax * i) / (nMels + 1)));
  const fb = new Float32Array(bins * nMels);
  for (let m = 0; m < nMels; m++) {
    for (let f = 0; f < bins; f++) {
      const down = (freqs[f]! - pts[m]!) / (pts[m + 1]! - pts[m]!);
      const up = (pts[m + 2]! - freqs[f]!) / (pts[m + 2]! - pts[m + 1]!);
      fb[f * nMels + m] = Math.max(0, Math.min(down, up));
    }
  }
  return fb;
}

describe('SheetSage2 front end', () => {
  it('gives the log-mel frames of MERT-v2 (torchaudio), within float32 error', async () => {
    const n = 12000;
    const x = Float32Array.from({ length: n }, (_, i) => 0.3 * Math.sin(i * 0.0731) + 0.2 * Math.sin(i * 0.4113) + 0.05 * Math.sin(i * 1.9));
    const window = Float32Array.from({ length: 2048 }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / 2048));
    const front: MelFront = { window, fb: htkFilters(SS2_MELS, 24000, 1025), mean: new Float32Array(SS2_MELS), std: new Float32Array(SS2_MELS).fill(1) };
    const mel = await melFrames(x, front);
    expect(mel.length / SS2_MELS).toBe(fixture.frames);
    let worst = 0;
    // Below -80 dB (2e-10 of power, near digital silence) the reference's own float32 rounding
    // dominates: there both only need to be that quiet.
    for (let i = 0; i < mel.length; i++) {
      if (fixture.mel[i]! > -80) worst = Math.max(worst, Math.abs(mel[i]! - fixture.mel[i]!));
      else expect(mel[i]!).toBeLessThan(-75);
    }
    expect(worst).toBeLessThan(0.15); // dB; the normalisation then divides by about 15 to 20
  });

  it('reads a float32 tensor from a .safetensors buffer', () => {
    const header = new TextEncoder().encode(JSON.stringify({ a: { dtype: 'F32', shape: [2], data_offsets: [0, 8] } }));
    const buf = new ArrayBuffer(8 + header.length + 8);
    new DataView(buf).setBigUint64(0, BigInt(header.length), true);
    new Uint8Array(buf, 8).set(header);
    new DataView(buf).setFloat32(8 + header.length, 1.5, true);
    new DataView(buf).setFloat32(8 + header.length + 4, -2, true);
    expect([...safetensor(buf, 'a')]).toEqual([1.5, -2]);
    expect(() => safetensor(buf, 'b')).toThrow();
  });
});
