// Reads what the Ableton writer produces with independent, published readers
// of the format (reference_check.py), to be sure the file does not only agree
// with our own idea of it. They are development tools, never dependencies of
// the app, so this file does nothing unless pointed at a Python that has them:
//
//   python3 -m venv /tmp/als-ref && /tmp/als-ref/bin/pip install abletoolz hexdump      (MPL-2.0; MIT)
//   /tmp/als-ref/bin/pip install git+https://github.com/offlinemark/dawtool              (BSD-3-Clause)
//   ALS_REFERENCE_PYTHON=/tmp/als-ref/bin/python npx vitest run src/export/ableton/ableton.reference.test.ts
//
//   - abletoolz: parses the set (version, tempo, signatures, tracks, sample
//     references found in the project folder), checks Live's loader rule on
//     warp markers, and walks every element against Live's own schema of
//     11.0_433 and the census of the releases that wrote each element.
//   - dawtool: the time in seconds of every locator, through its
//     reimplementation of Live's timeline (tempo read sixteenth by sixteenth).

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { liveFileCrc } from './crc';
import { sampleSet } from './fixtures';
import { writeAbletonSet } from './index';

const python = process.env.ALS_REFERENCE_PYTHON;
const suite = python ? describe : describe.skip;
const here = path.dirname(new URL(import.meta.url).pathname);
const tmp = mkdtempSync(path.join(tmpdir(), 'fabtice-als-ref-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

interface Report {
  abletoolz: {
    version: number[];
    bpm: number;
    meters: [number, number, number][];
    tracks: [string, string][];
    samples: { relative: string; absolute: string | null; resolution: string; size: number; crc: number | null }[];
  };
  schemaProblems: Record<string, number>;
  walked: number;
  missingMembers: Record<string, string[]>;
  dawtool: { markers: [number, string][]; tempoEvents: [number, number][] };
  fastcrc: number[];
}

// What Live 11 itself leaves out of a set (unmapped key and MIDI assignments), as read in a set saved by
// Live 11.1.5, plus what appeared after 11.0.0 and the members Live writes as attributes.
const KEY_MIDI = /^KeyMidi|KeyMidi$/;

suite('independent readers', () => {
  it('abletoolz and dawtool read the set as intended; Live 11.0\'s schema declares every element', async () => {
    const { input, beats } = sampleSet();
    // One locator per beat: dawtool gives the time of each one through Live's tempo curve.
    const withBeats = { ...input, locators: beats.map((b, i) => ({ quarters: b.quarters, name: `b${i}` })) };
    const { bytes } = await writeAbletonSet(withBeats);
    const project = path.join(tmp, 'Blues du dimanche Project');
    mkdirSync(path.join(project, 'Samples', 'Imported'), { recursive: true });
    for (const t of input.tracks) writeFileSync(path.join(project, t.file), new Uint8Array(16));
    const als = path.join(project, 'Blues du dimanche.als');
    writeFileSync(als, bytes);
    const crcInputs = [Array.from({ length: 20000 }, (_, i) => (i * 13 + 7) & 0xff), Array.from({ length: 100 }, (_, i) => i)];
    const expected = path.join(tmp, 'expected.json');
    writeFileSync(expected, JSON.stringify({ crcInputs }));

    const run = spawnSync(python!, ['-I', path.join(here, 'reference_check.py'), als, project, expected], { encoding: 'utf8', env: { ...process.env } });
    expect(run.status, run.stderr).toBe(0);
    const r = JSON.parse(run.stdout) as Report;

    // abletoolz
    expect(r.abletoolz.version).toEqual([11, 0, 0]);
    expect(r.abletoolz.bpm).toBeCloseTo(input.tempo[0]!.quarterBpm, 3);
    expect(r.abletoolz.meters).toEqual(input.meters.map((m) => [m.quarters, m.numerator, m.denominator]));
    expect(r.abletoolz.tracks).toEqual(input.tracks.map((t) => ['AudioTrack', t.name]));
    expect(r.abletoolz.samples.map((s) => [s.relative, s.resolution])).toEqual(input.tracks.map((t) => [t.file, 'loads']));
    expect(r.schemaProblems).toEqual({});
    expect(r.walked).toBeGreaterThan(1000);
    for (const [cls, members] of Object.entries(r.missingMembers)) {
      for (const m of members) expect(KEY_MIDI.test(m) || ['ResetNonautomatedMidiControllersOnClipStarts', 'Time', 'Mapping'].includes(m), `${cls}/${m}`).toBe(true);
    }
    // dawtool: every beat at its time.
    expect(r.dawtool.markers).toHaveLength(beats.length);
    let worst = 0;
    for (const [time, name] of r.dawtool.markers) worst = Math.max(worst, Math.abs(time - beats[Number(name.slice(1))]!.time));
    expect(worst).toBeLessThan(1e-6);
    console.log(`dawtool: ${beats.length} beats, worst ${(worst * 1e6).toFixed(3)} µs; abletoolz: ${r.walked} members walked`);
    // fastcrc
    expect(r.fastcrc).toEqual(crcInputs.map((b) => liveFileCrc(new Uint8Array(b))));
  });
});
