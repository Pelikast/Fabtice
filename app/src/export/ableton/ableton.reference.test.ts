// Reads what the Ableton writer produces with independent, published readers
// of the format (reference_check.py), to be sure the file does not only agree
// with our own idea of it. They are development tools, never dependencies of
// the app, so this file does nothing unless pointed at a Python that has them:
//
//   python3 -m venv /tmp/als-ref && /tmp/als-ref/bin/pip install abletoolz hexdump      (MPL-2.0; MIT)
//   /tmp/als-ref/bin/pip install git+https://github.com/offlinemark/dawtool              (BSD-3-Clause)
//   mkdir /tmp/als-ref-node && cd /tmp/als-ref-node && npm init -y && npm i ableton-als@0.4.2      (MIT)
//   ALS_REFERENCE_PYTHON=/tmp/als-ref/bin/python ALS_REFERENCE_NODE_DIR=/tmp/als-ref-node \
//     npx vitest run src/export/ableton/ableton.reference.test.ts
//
//   - abletoolz: parses the set (version, tempo, signatures, tracks, sample
//     references found in the project folder), checks Live's loader rule on
//     warp markers, and walks every element against Live's own schema of
//     11.0_433 and the census of the releases that wrote each element.
//   - dawtool: the time in seconds of every locator, through its
//     reimplementation of Live's timeline (tempo read sixteenth by sixteenth).
//   - ableton-als (JavaScript): its validator of generated sets (rules measured
//     in Live 10 and 12: ids, NextPointeeId, one clip slot per scene, XML), its
//     pointee-id inspection and its reader of tracks, scenes and tempo.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { liveFileCrc } from './crc';
import { sampleSet } from './fixtures';
import { writeAbletonSet } from './index';

const python = process.env.ALS_REFERENCE_PYTHON;
const nodeDir = process.env.ALS_REFERENCE_NODE_DIR;
const suite = python || nodeDir ? describe : describe.skip;
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

// What Live itself leaves out of a set (unmapped key and MIDI assignments), as read in sets saved by Live 10.1.7
// and 11.1.5, plus what appeared after the target release and the members Live writes as attributes.
const KEY_MIDI = /^KeyMidi|KeyMidi$/;

suite('independent readers', () => {
  const targets = [['live11', [11, 0, 0]], ['live10', [10, 1, 0]]] as const;
  (python ? it.each(targets) : it.skip.each(targets))('%s: abletoolz and dawtool read the set as intended; Live\'s schema declares every element', async (target, version) => {
    const { input: base, beats } = sampleSet();
    const input = { ...base, target };
    // One locator per beat: dawtool gives the time of each one through Live's tempo curve.
    const withBeats = { ...input, locators: beats.map((b, i) => ({ quarters: b.quarters, name: `b${i}` })) };
    const { bytes } = await writeAbletonSet(withBeats);
    const project = path.join(tmp, `${target} Project`);
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
    expect(r.abletoolz.version).toEqual(version);
    expect(r.abletoolz.bpm).toBeCloseTo(input.tempo[0]!.quarterBpm, 3);
    expect(r.abletoolz.meters).toEqual(input.meters.map((m) => [m.quarters, m.numerator, m.denominator]));
    expect(r.abletoolz.tracks).toEqual(input.tracks.map((t) => ['AudioTrack', t.name]));
    expect(r.abletoolz.samples.map((s) => [s.relative, s.resolution])).toEqual(input.tracks.map((t) => [t.file, 'loads']));
    expect(r.schemaProblems).toEqual({});
    expect(r.walked).toBeGreaterThan(1000);
    for (const [cls, members] of Object.entries(r.missingMembers)) {
      for (const m of members) expect(KEY_MIDI.test(m) || ['ResetNonautomatedMidiControllersOnClipStarts', 'MetronomeTickDuration', 'Time', 'Value', 'Mapping'].includes(m), `${cls}/${m}`).toBe(true);
    }
    // dawtool: every beat at its time.
    expect(r.dawtool.markers).toHaveLength(beats.length);
    let worst = 0;
    for (const [time, name] of r.dawtool.markers) worst = Math.max(worst, Math.abs(time - beats[Number(name.slice(1))]!.time));
    expect(worst).toBeLessThan(1e-6);
    console.log(`${target}: dawtool: ${beats.length} beats, worst ${(worst * 1e6).toFixed(3)} µs; abletoolz: ${r.walked} members walked`);
    // fastcrc
    expect(r.fastcrc).toEqual(crcInputs.map((b) => liveFileCrc(new Uint8Array(b))));
  });

  const minors = [['live11', '11.0_433'], ['live10', '10.0_377']] as const;
  (nodeDir ? it.each(minors) : it.skip.each(minors))('%s: ableton-als validates the set and reads its tracks, scenes and tempo', async (target, minor) => {
    const require = createRequire(path.join(nodeDir!, 'package.json'));
    const aa = (await import(require.resolve('ableton-als'))) as {
      validateGeneratedSet(xml: string): readonly { code: string; detail: string }[];
      inspectPointeeIds(xml: string): { duplicatedIds: readonly string[]; collidingReferences: readonly string[]; targets: number };
      parseAlsDocument(xml: string): { header: { minorVersion: string } | null; scenes: unknown[]; tracks: { type: string; name: string; sessionClips: unknown[] }[]; masterTempo: number | null; nextPointeeId: number | null };
      gridIsConsistent(doc: unknown): boolean;
    };
    const input = { ...sampleSet().input, target };
    const { xml } = await writeAbletonSet(input);
    expect(aa.validateGeneratedSet(xml)).toEqual([]);
    const ids = aa.inspectPointeeIds(xml);
    expect(ids.duplicatedIds).toEqual([]);
    expect(ids.collidingReferences).toEqual([]);
    const doc = aa.parseAlsDocument(xml);
    expect(doc.header?.minorVersion).toBe(minor);
    expect(doc.tracks.map((t) => [t.type, t.name, t.sessionClips.length])).toEqual(input.tracks.map((t) => ['AudioTrack', t.name, 8]));
    expect(doc.scenes).toHaveLength(8);
    expect(aa.gridIsConsistent(doc)).toBe(true);
    expect(doc.masterTempo).toBeCloseTo(input.tempo[0]!.quarterBpm, 3);
    console.log(`${target}: ableton-als: valid, ${ids.targets} targets, NextPointeeId ${doc.nextPointeeId}`);
  });
});
