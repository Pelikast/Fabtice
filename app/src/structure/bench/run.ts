// Runs the harmony pass on bench cases and scores it (all tiers share this).
//
//   const rows = runTierS({ pieces: 'subset' });     // Tier S: symbolic cases
//   console.log(markdownTable(rows, 'Tier S'));
//
// Tier R (web/spikes/structure/banc/) builds its own `HarmonyInput` from the
// app's analysis of a rendered piece and calls `runInput` + the scorers.

import { detectKeyChanges, detectStructure, simplifyChart } from '../index';
import type { AnalysedKeyChange } from '../../model/analysis';
import type { Key } from '../../model/harmony';
import type { DetectedStructure } from '../../model/structure';
import type { HarmonyBar, HarmonyInput, KnownStandard, SimplifiedChart, SimplifyInput } from '../types';
import { buildCase, loadCorpus, truthLines, type BenchCase, type CaseOptions, type TruthPiece } from './cases';
import { NOISE_LEVELS, type NoiseLevel } from './noise';
import {
  addCounts, autumnChartFailures, autumnFormFailures, emptyCounts, METRICS, metricValue, scoreSimplified, scoreStructure,
  type Counts,
} from './score';
import type { EvidenceKind } from './simEvidence';

/** The three entry points under test (the app's by default; a detector author may pass candidates). */
export interface Detectors {
  detectKeyChanges: (input: HarmonyInput) => AnalysedKeyChange[];
  detectStructure: (input: HarmonyInput, keyChanges: readonly { time: number; key: Key }[]) => DetectedStructure | null;
  simplifyChart: (input: SimplifyInput) => SimplifiedChart | null;
}

export const APP_DETECTORS: Detectors = { detectKeyChanges, detectStructure, simplifyChart };

// ---------------------------------------------------------------- simplify inputs

/** Index of the bar line of `bars` nearest to `time` (0…bars.length). */
function nearestLine(bars: readonly HarmonyBar[], time: number): number {
  let best = 0;
  let d = Infinity;
  for (let i = 0; i <= bars.length; i++) {
    const t = i < bars.length ? bars[i]!.start : bars[bars.length - 1]!.end;
    const x = Math.abs(t - time);
    if (x < d) {
      d = x;
      best = i;
    }
  }
  return best;
}

/** Chart bar number of a bar line (the line after the last bar: last number + 1). */
function barNumber(bars: readonly HarmonyBar[], line: number): number {
  return line < bars.length ? bars[line]!.bar : bars[bars.length - 1]!.bar + 1;
}

/** `SimplifyInput` from the TRUE structure, placed on the bars of the input (isolates the simplification). */
export function truthSimplifyInput(piece: TruthPiece, input: HarmonyInput): SimplifyInput {
  const lines = truthLines(piece);
  const at = (truthBar: number) => barNumber(input.bars, nearestLine(input.bars, lines[truthBar]!));
  const sections = piece.sections.map((m) => ({ bar: at(m.bar), label: m.label }));
  const parts = piece.parts.map((p, i) => ({
    id: `p${i}`,
    type: p.type,
    firstBar: at(p.firstBar),
    endBar: at(p.endBar),
    letters: piece.sections.filter((m) => m.bar >= p.firstBar && m.bar < p.endBar).map((m) => m.label),
  }));
  const keyChanges = piece.keyChanges.map((k) => ({ bar: at(k.bar), key: { tonic: k.key.tonic, mode: k.key.mode } }));
  return { bars: input.bars, sections, parts, keyChanges, known: input.known };
}

/** `SimplifyInput` from a DETECTED structure (what `refresh.ts` will do: the detection is the structure in force). */
export function detectedSimplifyInput(input: HarmonyInput, s: DetectedStructure, keyChanges: readonly { time: number; key: Key }[], known: KnownStandard[]): SimplifyInput {
  const at = (time: number) => barNumber(input.bars, nearestLine(input.bars, time));
  const sections = [...s.sections].sort((a, b) => a.time - b.time).map((m) => ({ bar: at(m.time), label: m.label }));
  const parts = s.parts.map((p) => {
    const firstBar = at(p.start);
    const endBar = at(p.end);
    return { id: p.id, type: p.type, firstBar, endBar, letters: sections.filter((m) => m.bar >= firstBar && m.bar < endBar).map((m) => m.label) };
  });
  return { bars: input.bars, sections, parts, keyChanges: keyChanges.map((k) => ({ bar: at(k.time), key: k.key })), known };
}

// ---------------------------------------------------------------- running

export interface RunResult {
  piece: TruthPiece;
  input: HarmonyInput;
  withStems: boolean;
  keyChanges: AnalysedKeyChange[];
  structure: DetectedStructure | null;
  /** From the true structure. */
  simplified: SimplifiedChart | null;
  /** From the detected structure (null when nothing was detected). */
  chained: SimplifiedChart | null;
  counts: Counts;
  /** Why the « Autumn Leaves » checks fail (empty: they pass); only for that piece. */
  autumn?: { chart: string[]; chain: string[] };
  ms: number;
  /** A detector threw: the message (the case then scores as « nothing found »). */
  error?: string;
}

/** The harmony pass on one input, scored against the truth of `piece`. */
export function runInput(piece: TruthPiece, input: HarmonyInput, d: Detectors = APP_DETECTORS): RunResult {
  const t0 = performance.now();
  let keyChanges: AnalysedKeyChange[] = [];
  let structure: DetectedStructure | null = null;
  let simplified: SimplifiedChart | null = null;
  let chained: SimplifiedChart | null = null;
  let error: string | undefined;
  try {
    keyChanges = d.detectKeyChanges(input);
    structure = d.detectStructure(input, keyChanges.map((k) => ({ time: k.time, key: k.key })));
    simplified = d.simplifyChart(truthSimplifyInput(piece, input));
    if (structure) chained = d.simplifyChart(detectedSimplifyInput(input, structure, keyChanges, input.known));
  } catch (e) {
    error = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  }
  const ms = performance.now() - t0;
  const withStems = !!input.evidence?.stems;
  const counts = emptyCounts();
  addCounts(counts, scoreStructure(piece, { keyChanges, structure }, withStems));
  addCounts(counts, scoreSimplified(piece, input.bars, simplified, 'simp'));
  if (piece.simplified) addCounts(counts, scoreSimplified(piece, input.bars, chained, 'chain'));
  let autumn: RunResult['autumn'];
  if (piece.id === 'autumn-leaves') {
    autumn = { chart: autumnChartFailures(simplified), chain: autumnFormFailures(piece, structure, chained, withStems) };
    counts.autumnChart = [autumn.chart.length === 0 ? 1 : 0, 1];
    counts.autumnChain = [autumn.chain.length === 0 ? 1 : 0, 1];
  }
  return { piece, input, withStems, keyChanges, structure, simplified, chained, counts, autumn, ms, error };
}

export function runCase(c: BenchCase, d: Detectors = APP_DETECTORS): RunResult {
  return runInput(c.piece, c.input, d);
}

export interface TierSOptions {
  /** `subset` (default), `all`, or piece ids. */
  pieces?: 'subset' | 'all' | string[];
  levels?: readonly NoiseLevel[];
  evidence?: readonly EvidenceKind[];
  known?: readonly boolean[];
  /** Draws per level (different simulated errors). */
  draws?: number;
  detectors?: Detectors;
  /** Detectors per piece (the oracle); wins over `detectors`. */
  detectorsFor?: (piece: TruthPiece) => Detectors;
}

/** One row of a table: all cases of one configuration added up. */
export interface Row {
  label: string;
  level: NoiseLevel | string;
  evidence: EvidenceKind | string;
  known: boolean;
  cases: number;
  counts: Counts;
  ms: number;
  runs: RunResult[];
}

export function benchPieces(which: TierSOptions['pieces'] = 'subset'): TruthPiece[] {
  const all = loadCorpus();
  if (which === 'all') return all;
  if (which === 'subset') return all.filter((p) => p.subset);
  return all.filter((p) => which.includes(p.id));
}

/** Tier S: every piece × level × evidence × known chart, one row per configuration. */
export function runTierS(o: TierSOptions = {}): Row[] {
  const pieces = benchPieces(o.pieces);
  const rows: Row[] = [];
  for (const level of o.levels ?? NOISE_LEVELS) {
    for (const evidence of o.evidence ?? (['stems', 'mix'] as const)) {
      for (const known of o.known ?? [false, true]) {
        const opts: CaseOptions = { level, evidence, known };
        const row: Row = { label: '', level, evidence, known, cases: 0, counts: emptyCounts(), ms: 0, runs: [] };
        for (const piece of pieces) {
          for (let draw = 0; draw < (o.draws ?? 1); draw++) {
            const c = buildCase(piece, { ...opts, draw });
            row.label = c.label;
            const r = runCase(c, o.detectorsFor?.(piece) ?? o.detectors);
            addCounts(row.counts, r.counts);
            row.ms += r.ms;
            row.cases++;
            row.runs.push(r);
          }
        }
        rows.push(row);
      }
    }
  }
  return rows;
}

// ---------------------------------------------------------------- report

function fmt(kind: string, v: number | null): string {
  if (v === null) return '–';
  if (kind === 'rate') return `${(100 * v).toFixed(1)} %`;
  if (kind === 'mean') return v.toFixed(2);
  return String(v);
}

/** A markdown table: one line per metric, one column per row (configuration). */
export function markdownTable(rows: readonly Row[], title: string): string {
  const head = ['Mesure', ...rows.map((r) => `${r.label}`)];
  const lines = [`### ${title}`, '', `| ${head.join(' | ')} |`, `|${head.map((_, i) => (i ? '---:' : '---')).join('|')}|`];
  let group = '';
  for (const m of METRICS) {
    if (m.group !== group) {
      group = m.group;
      lines.push(`| **${group}** |${rows.map(() => '').join(' |')} |`);
    }
    const cells = rows.map((r) => {
      const c = r.counts[m.key];
      const v = metricValue(m, c);
      return v === null ? '–' : `${fmt(m.kind, v)}${m.kind === 'rate' && c && Number.isInteger(c[1]) && c[1] > 0 ? ` (${Math.round(c[0])}/${c[1]})` : ''}`;
    });
    lines.push(`| ${m.label}${m.lowerIsBetter ? ' ↓' : ''} | ${cells.join(' | ')} |`);
  }
  lines.push(`| Cas | ${rows.map((r) => r.cases).join(' | ')} |`);
  lines.push(`| Temps de calcul (ms) | ${rows.map((r) => r.ms.toFixed(0)).join(' | ')} |`);
  const errors = rows.flatMap((r) => r.runs.filter((x) => x.error).map((x) => `${r.label} ${x.piece.id}: ${x.error!.split('\n')[0]}`));
  if (errors.length) lines.push('', `Erreurs (${errors.length}) :`, ...errors.slice(0, 20).map((e) => `- ${e}`));
  return lines.join('\n');
}

/** One table per error level (columns: evidence × known chart), then the « Autumn Leaves » lines. */
export function markdownReport(rows: readonly Row[], title: string): string {
  const levels = [...new Set(rows.map((r) => r.level))];
  const tables = levels.map((level) => {
    const rs = rows.filter((r) => r.level === level).map((r) => ({ ...r, label: r.label.split(' / ').slice(1).join(' / ') || r.label }));
    return markdownTable(rs, `${title} — erreurs d’analyse : ${level}`);
  });
  return [...tables, autumnReport(rows)].join('\n\n');
}

/** The « Autumn Leaves » lines of a set of rows, with the reasons when it fails. */
export function autumnReport(rows: readonly Row[]): string {
  const out = ['### Autumn Leaves (exemple du cahier, C14)', ''];
  for (const r of rows) {
    const a = r.runs.find((x) => x.autumn)?.autumn;
    if (!a) continue;
    const show = (f: string[]) => (f.length ? `**échoue** (${f.slice(0, 3).join(' ; ')}${f.length > 3 ? ` ; +${f.length - 3}` : ''})` : '**passe**');
    out.push(`- ${r.label} : grille (structure vraie) ${show(a.chart)} ; chaîne complète ${show(a.chain)}`);
  }
  return out.join('\n');
}

/** A metric of a row, for thresholds (see `thresholds.ts`). */
export function rowMetric(row: Row, key: string): number | null {
  const m = METRICS.find((x) => x.key === key);
  if (!m) throw new Error(`unknown metric ${key}`);
  return metricValue(m, row.counts[key]);
}
