// The simplified chart (« Grille complète simplifiée », C14) as an `ExportChart` for iReal Pro, with real repeats:
// each section written once (`*A`, `*B`… the intro `*i`), `{ … }` round a passage played twice in a row, ` x ` (the
// one-bar repeat) for a « % » bar, the final bar `Z`. Everything else is the export of the full chart
// (`ireal.ts#iRealMusic` writes the tokens): one key per chart, a modulation as a comment on its bar, signatures where
// they change, chords at concert pitch in the key the user plays.
//
// iReal Pro plays `{ … }` twice; a passage played more times in a row says it in a comment (`<3x>`).
// The round trip is tested: `standards/irealRead.ts` reads the link back to the same bars (simplifiedExport.test.ts).

import { chordText, transposeChord } from '../harmony/chord';
import { transposeKey } from '../harmony/key';
import { sameMeter } from '../grid/tempoMap';
import { t } from '../i18n';
import type { Key } from '../model/harmony';
import type { Meter } from '../model/tempoMap';
import { PART_TYPE_KEYS } from '../model/structureLabels';
import type { SimplifiedChart } from '../structure';
import { writtenNext } from '../chart/simplifiedLayout';
import type { ExportBar, ExportChart } from './chartExport';

export interface SimplifiedExportInput {
  title: string;
  chart: SimplifiedChart;
  /** The main key in force, or null. */
  key: Key | null;
  /** Transport transposition in semitones. */
  semitones: number;
  tempo: number | null;
}

/** The export chart of a simplified chart (pure). */
export function buildSimplifiedExportChart({ title, chart, key, semitones, tempo }: SimplifiedExportInput): ExportChart {
  const writtenKey = key ? transposeKey(key, semitones) : null;
  let passageKey = writtenKey;
  let meter: Meter | null = null;
  const bars: ExportBar[] = [];
  const total = chart.sections.reduce((n, s) => n + s.bars.length, 0);
  chart.sections.forEach((section, si) => {
    section.bars.forEach((index, k) => {
      const b = chart.bars[index]!;
      const keyChange = b.keyChange ? transposeKey(b.keyChange, semitones) : null;
      if (keyChange) passageKey = keyChange;
      const spelling = passageKey;
      const m: Meter = { ...b.meter };
      const changed = !meter || !sameMeter(meter, m);
      meter = m;
      const first = k === 0;
      const lastOfSection = k === section.bars.length - 1;
      const repeated = section.times > 1;
      // The section's own mark: a letter (`*A`), the intro (`*i`), or the name of the part (a comment).
      let label: string | null = null;
      let note: string | undefined;
      if (first) {
        if ('letter' in section.label) {
          label = section.label.letter;
          if (section.variant && section.variant > 1) note = `${section.label.letter}${section.variant}`;
        } else label = t(PART_TYPE_KEYS[section.label.part]);
      }
      if (lastOfSection && repeated && section.times > 2) note = note ? `${note} ${section.times}x` : `${section.times}x`;
      bars.push({
        bar: index,
        section: label,
        doubleBarBefore: first && si > 0,
        timeSignature: changed ? m : null,
        chords: b.chords.map((c) => {
          const chord = c.chord ? transposeChord(c.chord, semitones) : null;
          const target = writtenNext(chart, c);
          const next = target ? transposeChord(target, semitones) : null;
          return { beat: c.beat, chord, text: chordText(chord, { key: spelling, next }), doubtful: false, next };
        }),
        repeat: b.simile,
        final: bars.length === total - 1,
        key: spelling,
        keyChange,
        repeatStart: repeated && first,
        repeatEnd: repeated && lastOfSection,
        note,
      });
    });
  });
  return {
    title,
    composer: null,
    style: null,
    key: writtenKey,
    timeSignature: bars[0]?.timeSignature ?? { numerator: 4, denominator: 4 },
    tempo: tempo === null ? null : Math.round(tempo),
    repeats: 'written',
    bars,
  };
}
