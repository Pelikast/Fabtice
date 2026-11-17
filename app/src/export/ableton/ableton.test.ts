// The Ableton Live set writer: the document read back by Python's XML parser
// (check_structure.py, when python3 is there: it is on the Mac CI), the tempo
// curve against the times of the input, the clip placement, the encodings.
// Independent readers of the format (abletoolz with Live's own schemas,
// dawtool): ableton.reference.test.ts.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { gzipStored } from './gzip';
import { liveFileCrc } from './crc';
import { sampleSet } from './fixtures';
import { buildLiveSet, writeAbletonSet } from './index';
import { decodeTimeSignature, liveTempoSteps, quartersToSeconds, secondsToQuarters, tempoEvents, timeSignatureCode } from './tempo';
import type { AbletonSetInput, AbletonWarning } from './types';
import { float32, num, serialize, el, v } from './xml';

const here = path.dirname(new URL(import.meta.url).pathname);
const python = (() => {
  for (const p of [process.env.ALS_PYTHON, 'python3'].filter(Boolean) as string[]) {
    const r = spawnSync(p, ['-I', '-c', 'import xml.etree.ElementTree, gzip, json'], { encoding: 'utf8' });
    if (r.status === 0) return p;
  }
  return null;
})();
const withPython = python ? it : it.skip;
if (!python) console.warn('python3 missing: the structural check of the .als (check_structure.py) is skipped');

const tmp = mkdtempSync(path.join(tmpdir(), 'fabtice-als-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

interface Checked {
  errors: string[];
  minorVersion: string;
  scenes: number;
  nextPointeeId: number;
  tracks: { name: string; start: number; end: number; seconds: number; relativePath: string; relativePathType: number; path: string; size: number; crc: number; frames: number; rate: number }[];
  tempo: [number, number][];
  signatures: [number, number][];
  locators: [number, string][];
  elements: number;
}

async function checked(input: AbletonSetInput, name: string): Promise<Checked> {
  const { bytes } = await writeAbletonSet(input);
  const file = path.join(tmp, `${name}.als`);
  writeFileSync(file, bytes);
  const r = spawnSync(python!, ['-I', path.join(here, 'check_structure.py'), file], { encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout) as Checked;
}

describe('encodings', () => {
  it('time signatures: numerator − 1 + 99 × log2(denominator), as Live stores them', () => {
    expect(timeSignatureCode(4, 4)).toBe(201);
    expect(timeSignatureCode(3, 4)).toBe(200);
    expect(timeSignatureCode(6, 8)).toBe(302);
    expect(timeSignatureCode(7, 8)).toBe(303);
    expect(timeSignatureCode(1, 4)).toBe(198);
    expect(timeSignatureCode(1, 8)).toBe(297); // both read in a set saved by Live 11.1.5
    expect(timeSignatureCode(12, 8)).toBe(308);
    expect(timeSignatureCode(5, 16)).toBe(400);
    for (let n = 1; n <= 99; n++) for (const d of [1, 2, 4, 8, 16]) expect(decodeTimeSignature(timeSignatureCode(n, d))).toEqual({ numerator: n, denominator: d });
    expect(() => timeSignatureCode(3, 32)).toThrow(RangeError);
    expect(() => timeSignatureCode(100, 4)).toThrow(RangeError);
    expect(() => timeSignatureCode(0, 4)).toThrow(RangeError);
  });

  it('numbers as Live writes them: no exponent, float32 values at their shortest', () => {
    expect(num(132)).toBe('132');
    expect(num(-63072000)).toBe('-63072000');
    expect(num(0.976870748299319747)).toBe('0.9768707482993197');
    expect(num(1e-7)).toBe('0.0000001');
    expect(num(-0)).toBe('0');
    expect(float32(120.760574)).toBe('120.760574');
    expect(float32(72.4)).toBe('72.4');
    expect(float32(1 / 3)).toBe('0.33333334');
    expect(Math.fround(Number(float32(162.16216216)))).toBe(Math.fround(162.16216216));
  });

  it('XML: tabs, « />» for empty elements, escaped attributes', () => {
    const x = serialize(el('A', { Id: 0 }, [v('Name', 'Tom & "Jerry" <3>'), el('B')]));
    expect(x).toBe('<A Id="0">\n\t<Name Value="Tom &amp; &quot;Jerry&quot; &lt;3&gt;" />\n\t<B />\n</A>');
  });

  it("Live's file checksum is CRC-16/UMTS of the first 16 384 bytes", () => {
    expect(liveFileCrc(new TextEncoder().encode('123456789'))).toBe(0xfee8); // the catalogue check value
    const big = new Uint8Array(40000).map((_, i) => (i * 7) & 0xff);
    expect(liveFileCrc(big)).toBe(liveFileCrc(big.subarray(0, 16384)));
  });

  it('gzip: stored blocks read back by zlib', () => {
    const data = new Uint8Array(200000).map((_, i) => (i * 31) & 0xff);
    const gz = gzipStored(data);
    expect([...gz.subarray(0, 10)]).toEqual([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0xff]);
    expect(Buffer.compare(gunzipSync(gz), Buffer.from(data))).toBe(0);
  });
});

describe('tempo curve', () => {
  it('every beat of the input falls at its time (sixteenth-aligned steps)', () => {
    const { input, beats } = sampleSet();
    const warnings: AbletonWarning[] = [];
    const steps = liveTempoSteps(input.tempo, warnings);
    expect(steps[0]!.quarters).toBe(0);
    let worst = 0;
    for (const b of beats) worst = Math.max(worst, Math.abs(quartersToSeconds(steps, b.quarters) - b.time));
    expect(worst).toBeLessThan(1e-6);
    for (const s of steps) {
      expect(Math.abs(s.quarters * 4 - Math.round(s.quarters * 4))).toBeLessThan(1e-9);
      expect(Math.fround(s.quarterBpm)).toBe(s.quarterBpm);
    }
    expect(warnings).toEqual([]);
  });

  it('the float32 rounding does not accumulate over a long piece', () => {
    const tempo = Array.from({ length: 4000 }, (_, i) => ({ quarters: i, quarterBpm: 117.123456789 + Math.sin(i) * 3.3 }));
    const steps = liveTempoSteps(tempo);
    let t = 0;
    let worst = 0;
    for (let i = 0; i < 4000; i++) {
      worst = Math.max(worst, Math.abs(quartersToSeconds(steps, i) - t));
      t += 60 / tempo[i]!.quarterBpm;
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('a change between two sixteenths (a beat of an x/32 bar) is averaged over its sixteenth', () => {
    const tempo = [
      { quarters: 0, quarterBpm: 100 },
      { quarters: 4.125, quarterBpm: 140 },
      { quarters: 8, quarterBpm: 90 },
    ];
    const warnings: AbletonWarning[] = [];
    const steps = liveTempoSteps(tempo, warnings);
    const exact = (q: number) => (q <= 4.125 ? (q * 60) / 100 : (4.125 * 60) / 100 + (Math.min(q, 8) - 4.125) * (60 / 140) + Math.max(0, q - 8) * (60 / 90));
    for (const q of [4, 4.25, 8, 12]) expect(Math.abs(quartersToSeconds(steps, q) - exact(q))).toBeLessThan(1e-6);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.kind).toBe('tempo-unaligned');
    // A jump of 40 % inside one sixteenth: 11 ms off at the 32nd, exact on the sixteenths around it.
    expect((warnings[0] as { error: number }).error).toBeLessThan(0.011);
    expect(Math.abs(quartersToSeconds(steps, 4.125) - exact(4.125))).toBeLessThanOrEqual((warnings[0] as { error: number }).error + 1e-9);
  });

  it('tempos outside 20-999 are clamped and reported', () => {
    const warnings: AbletonWarning[] = [];
    const steps = liveTempoSteps([{ quarters: 0, quarterBpm: 1500 }, { quarters: 1, quarterBpm: 12 }, { quarters: 2, quarterBpm: 120 }], warnings);
    expect(steps.map((s) => s.quarterBpm)).toEqual([999, 20, 120]);
    expect(warnings.map((w) => w.kind)).toEqual(['tempo-clamped', 'tempo-clamped']);
  });

  it('events: Live\'s first point, then vertical steps (old value, new value)', () => {
    const ev = tempoEvents([{ quarters: 0, quarterBpm: 100 }, { quarters: 4, quarterBpm: 120 }]);
    expect(ev).toEqual([{ time: -63072000, value: 100 }, { time: 4, value: 100 }, { time: 4, value: 120 }]);
  });

  it('seconds and quarters are inverse', () => {
    const steps = liveTempoSteps(sampleSet().input.tempo);
    for (const s of [0, 0.37, 1, 10.5, 33.3, 60]) expect(quartersToSeconds(steps, secondsToQuarters(steps, s))).toBeCloseTo(s, 9);
  });
});

describe('the set', () => {
  it('builds a document with its tracks, clips ending where their audio ends, envelopes and locators', () => {
    const { input } = sampleSet();
    const r = buildLiveSet(input);
    const seconds = input.tracks[0]!.frames / input.sampleRate;
    for (const end of r.clipEnds) expect(quartersToSeconds(r.tempo, end)).toBeCloseTo(seconds, 9);
    expect(r.xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<Ableton MajorVersion="5" MinorVersion="11.0_433" Creator="Ableton Live 11.0" Revision="')).toBe(true);
    expect(r.xml).not.toMatch(/SchemaChangeCount/);
    expect(r.xml).toContain('<RelativePath Value="Samples/Imported/01 Morceau.wav" />');
    expect(r.warnings).toEqual([]);
  });

  it('refuses what Live could not open', () => {
    const { input } = sampleSet();
    expect(() => buildLiveSet({ ...input, tracks: [] })).toThrow(RangeError);
    expect(() => buildLiveSet({ ...input, tracks: [{ ...input.tracks[0]!, file: '/abs/x.wav' }] })).toThrow(RangeError);
    expect(() => buildLiveSet({ ...input, tracks: [{ ...input.tracks[0]!, file: '..\\x.wav' }] })).toThrow(RangeError);
    expect(() => buildLiveSet({ ...input, meters: [{ quarters: 0, numerator: 5, denominator: 32 }] })).toThrow(RangeError);
    expect(() => buildLiveSet({ ...input, meters: [{ quarters: 1, numerator: 4, denominator: 4 }] })).toThrow(RangeError);
    expect(() => buildLiveSet({ ...input, tempo: [{ quarters: 1, quarterBpm: 120 }] })).toThrow(RangeError);
  });

  it('merges locators at the same time', () => {
    const { input } = sampleSet();
    const r = buildLiveSet({ ...input, locators: [{ quarters: 5, name: 'B' }, { quarters: 1, name: 'A' }, { quarters: 5, name: 'F7' }] });
    expect(r.xml).toContain('<Name Value="B · F7" />');
    expect(r.warnings).toEqual([{ kind: 'locators-merged', quarters: 5, names: ['B', 'F7'] }]);
  });

  const targets = [['live11', '11.0_433'], ['live10', '10.0_377']] as const;
  (python ? it.each(targets) : it.skip.each(targets))('%s: read back by an XML parser: structure, ids, pointers, envelopes, clips, locators', async (target, minor) => {
    const { input: base, beats } = sampleSet();
    const input = { ...base, target };
    const r = buildLiveSet(input);
    expect(r.target).toBe(target);
    const c = await checked(input, `sample-${target}`);
    expect(c.errors).toEqual([]);
    expect(c.minorVersion).toBe(minor);
    expect(c.scenes).toBe(8);
    // Tracks and clips.
    expect(c.tracks.map((t) => t.name)).toEqual(['Morceau', 'Contrebasse']);
    for (const t of c.tracks) {
      expect(t.start).toBe(0);
      expect(t.seconds).toBe(t.frames / 48000);
      expect(t.relativePathType).toBe(3);
      expect(quartersToSeconds(r.tempo, t.end)).toBeCloseTo(t.seconds, 9);
    }
    expect(c.tracks[1]).toMatchObject({ size: input.tracks[1]!.fileSize, crc: 12345, path: input.tracks[1]!.absolutePath });
    expect(c.tracks[0]).toMatchObject({ size: 0, crc: 0, path: '' });
    // The tempo as written, read back: every beat at its time (float32 values as parsed).
    const steps = [{ quarters: 0, quarterBpm: c.tempo[0]![1] }];
    for (let i = 1; i < c.tempo.length; i += 2) steps.push({ quarters: c.tempo[i + 1]![0], quarterBpm: c.tempo[i + 1]![1] });
    let worst = 0;
    for (const b of beats) worst = Math.max(worst, Math.abs(quartersToSeconds(steps, b.quarters) - b.time));
    expect(worst).toBeLessThan(1e-6);
    // Signatures and locators.
    expect(c.signatures).toEqual([[-63072000, 198], [1, 201], [33, 302], [45, 303], [48.5, 201]]);
    const locs = input.locators.map((l) => [l.quarters, l.name]);
    expect(c.locators).toEqual(locs);
  });

  withPython('a single tempo and a single signature: one point each, no step', async () => {
    const c = await checked(
      {
        title: 'Constant',
        sampleRate: 48000,
        tracks: [{ name: 'Morceau', file: 'Samples/Imported/01 Morceau.wav', frames: 48000 * 30 }],
        tempo: [{ quarters: 0, quarterBpm: 120 }],
        meters: [{ quarters: 0, numerator: 4, denominator: 4 }],
        locators: [],
      },
      'constant',
    );
    expect(c.errors).toEqual([]);
    expect(c.tempo).toEqual([[-63072000, 120]]);
    expect(c.signatures).toEqual([[-63072000, 201]]);
    expect(c.tracks[0]!.end).toBe(60);
    expect(c.locators).toEqual([]);
  });

  it('the .als is gzip around the document, with Live\'s header', async () => {
    const { input } = sampleSet();
    const { bytes, xml } = await writeAbletonSet(input);
    expect([...bytes.subarray(0, 4)]).toEqual([0x1f, 0x8b, 8, 0]);
    expect([...bytes.subarray(4, 8)]).toEqual([0, 0, 0, 0]);
    expect(bytes[9]).toBe(0xff);
    expect(gunzipSync(bytes).toString('utf8')).toBe(xml);
    expect(bytes.length).toBeLessThan(xml.length / 4);
  });

  it('dumps the sample set when asked (ALS_DUMP=folder), for the reference readers', async () => {
    const dir = process.env.ALS_DUMP;
    if (!dir) return;
    const { input } = sampleSet();
    for (const target of ['live11', 'live10'] as const) {
      const { bytes } = await writeAbletonSet({ ...input, target });
      writeFileSync(path.join(dir, `sample-${target}.als`), bytes);
      expect(readFileSync(path.join(dir, `sample-${target}.als`)).length).toBe(bytes.length);
    }
  });
});
