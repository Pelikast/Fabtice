import { describe, expect, it } from 'vitest';
import { Sha256 } from './sha256';
import { sha256Hex } from './download';

describe('Sha256 (piece by piece)', () => {
  it('gives the known digests', () => {
    expect(new Sha256().hex()).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(new Sha256().update(new TextEncoder().encode('abc')).hex()).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('matches crypto.subtle whatever the pieces', async () => {
    for (const n of [55, 56, 63, 64, 65, 1000, 100_003]) {
      const data = Uint8Array.from({ length: n }, (_, i) => (i * 7919 + 13) & 255);
      const expected = await sha256Hex(data.slice().buffer);
      const h = new Sha256();
      for (let i = 0; i < n; ) {
        const step = 1 + ((i * 31) % 97);
        h.update(data.subarray(i, i + step));
        i += step;
      }
      expect(h.hex()).toBe(expected);
    }
  });
});
