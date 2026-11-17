// The app's real analysis of a rendered piece (Tier R): the chords bench's
// `app` variant (web/spikes/accords/banc/variantes/app.ts: the app's networks
// in Node, then `resultFromOutputs` exactly as the worker calls it) on the
// MIX. Its result (beats, chords, key) is small: it is kept per piece and
// condition in analyses/<id>.<condition>.json (committed), so that Tier R can
// be re-scored without rendering nor running the networks.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import appVariant from '../../accords/banc/variantes/app';
import { networks } from '../../accords/banc/networks';
import type { ChordSymbol } from '../../../../app/src/model/harmony';
import type { StemId } from '../../../../app/src/model/separation';
import { barsFromAnalysis, measureEvidence, type MeasuredEvidence } from './adapter';
import { ROOT } from './paths';

export const ANALYSES = join(ROOT, 'analyses');

/** What the analysis found, in the condition's own seconds. */
export interface DetectedAnalysis {
  id: string;
  condition: string;
  /** Truth time × timeScale = time in this condition's audio (the old record turns a little fast or slow). */
  timeScale: number;
  duration: number;
  beats: { times: number[]; downbeat: number; beatsPerBar: number };
  key: { tonic: number; mode: 'major' | 'minor' } | null;
  chords: { time: number; chord: ChordSymbol | null; doubtful: boolean }[];
  analyser: string;
  /** Measured on the rendered audio, per bar of `barsFromAnalysis(this)` (adapter.ts). */
  evidence: MeasuredEvidence;
}

export function analysisPath(id: string, condition: string): string {
  return join(ANALYSES, `${id}.${condition}.json`);
}

export function readAnalysis(id: string, condition: string): DetectedAnalysis | null {
  const f = analysisPath(id, condition);
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as DetectedAnalysis) : null;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export async function analyse(id: string, title: string, condition: string, mixPath: string, stemPaths: Partial<Record<StemId, string>>, timeScale: number): Promise<DetectedAnalysis> {
  const out = await appVariant(
    { id, condition, mixPath, stemPaths: {}, title, meta: {} },
    { networks },
  );
  const net = await networks(mixPath);
  const a: Omit<DetectedAnalysis, 'evidence'> = {
    id,
    condition,
    timeScale,
    duration: r3(net.duration),
    beats: { times: (out.beats?.times ?? []).map(r3), downbeat: out.beats?.downbeat ?? 0, beatsPerBar: out.beats?.beatsPerBar ?? 4 },
    key: out.key ?? null,
    chords: out.chords.map((c) => ({ time: r3(c.time), chord: c.chord, doubtful: !!c.doubtful })),
    analyser: 'app (web/spikes/accords/banc/variantes/app.ts), mélange seul',
  };
  const full: DetectedAnalysis = { ...a, evidence: measureEvidence(barsFromAnalysis(a), mixPath, stemPaths) };
  mkdirSync(ANALYSES, { recursive: true });
  writeFileSync(analysisPath(id, condition), JSON.stringify(full) + '\n');
  return full;
}
