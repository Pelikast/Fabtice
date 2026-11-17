// The « oracle »: detectors that read the answers from the truth. Not a
// detector: it checks the bench itself (on error-free cases every metric must
// be perfect) and shows the exact shape of a perfect answer.

import type { AnalysedKeyChange } from '../../model/analysis';
import type { DetectedStructure } from '../../model/structure';
import type { HarmonyInput, SimplifiedChart, SimplifyInput, WrittenBar, WrittenPlace, WrittenSection } from '../types';
import { chordOf, truthBarAt, type TruthPiece } from './cases';
import type { Detectors } from './run';

export function oracleDetectors(piece: TruthPiece): Detectors {
  const startOf = (bar: number) => (bar < piece.bars.length ? piece.bars[bar]!.start : piece.bars[piece.bars.length - 1]!.end);
  return {
    detectKeyChanges: (): AnalysedKeyChange[] =>
      piece.keyChanges.map((k) => ({ time: startOf(k.bar), key: { tonic: k.key.tonic, mode: k.key.mode, confidence: 1, alternatives: [] } })),
    detectStructure: (input: HarmonyInput): DetectedStructure => ({
      mode: piece.mode,
      form: piece.formScored ? piece.form : '',
      sections: piece.sections.map((m) => ({ time: startOf(m.bar), label: m.label })),
      parts: piece.parts.map((p, i) => ({
        id: `oracle-${i}`,
        type: p.type,
        number: p.number,
        instrument: input.evidence?.stems ? p.instrument : null,
        start: startOf(p.firstBar),
        end: startOf(p.endBar),
      })),
    }),
    simplifyChart: (si: SimplifyInput): SimplifiedChart | null => {
      const exp = piece.simplified;
      if (!exp) return null;
      const bars: WrittenBar[] = [];
      const sections: WrittenSection[] = exp.sections.map((s) => {
        const idx = s.bars.map((b) => {
          bars.push({
            index: bars.length, beats: b.beats, meter: { numerator: b.beats, denominator: 4 }, signature: null,
            chords: b.chords.map((c) => ({ beat: c.beat, chord: chordOf(c.text) })), simile: b.simile,
            keyChange: null, played: [],
          });
          return bars.length - 1;
        });
        if (s.keyChange) bars[idx[0]!]!.keyChange = { tonic: s.keyChange.tonic, mode: s.keyChange.mode };
        return { id: s.id, label: s.label, bars: idx, times: s.times };
      });
      const want = new Map(exp.places.map(([bar, sec, off]) => [bar, sections[sec]!.bars[off]!]));
      const places = new Map<number, WrittenPlace>();
      const seen = new Map<number, number>();
      for (const b of si.bars) {
        const w = want.get(truthBarAt(piece, (b.start + b.end) / 2));
        if (w === undefined) continue;
        const pass = (seen.get(w) ?? 0) + 1;
        seen.set(w, pass);
        places.set(b.bar, { written: w, pass, passes: 0 });
        bars[w]!.played.push(b.bar);
      }
      for (const p of places.values()) p.passes = seen.get(p.written) ?? 1;
      return { form: si.parts.map((p) => ({ partId: p.id, letters: p.letters.join('') })), sections, bars, places };
    },
  };
}
