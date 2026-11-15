// `crema-brut`: a diagnostic, and the smallest example of a variant. Same
// networks and grid as `base`, but no decoding: on every beat, the chord
// network's best reading (mean log posterior over the beat). Comparing it
// with `base` shows what the harmony prior and the HMM bring, or cost.

import { NO_CHORD } from '../../../../../app/src/analysis/engine/chords';
import { poolSegments } from '../../../../../app/src/analysis/engine/chords';
import { gridFromActivations, gridFromHint } from '../../../../../app/src/analysis/engine/pipeline';
import { symbolOf } from '../../../../../app/src/analysis/engine/result';
import type { Variant, VariantChord } from '../types';

const crema: Variant = async (input, ctx) => {
  const { outputs } = await ctx.networks(input.mixPath);
  const h = input.truthGrid;
  const grid = h ? gridFromHint(h.times, h.downbeat, h.beatsPerBar) : gridFromActivations(outputs.act).grid;
  const b = grid.beats;
  const segs = b.map((t, i) => [t, b[i + 1] ?? t + (b[i]! - (b[i - 1] ?? b[i]! - 0.5))] as [number, number]);
  const units = poolSegments(outputs.frames, segs, outputs.timeScale);
  const chords: VariantChord[] = [];
  units.forEach((u, i) => {
    let best = 0;
    for (let c = 1; c < u.logp.length; c++) if (u.logp[c]! > u.logp[best]!) best = c;
    const sym = best === NO_CHORD ? null : symbolOf(best);
    const last = chords[chords.length - 1];
    if (last && JSON.stringify(last.chord) === JSON.stringify(sym)) return;
    chords.push({ time: segs[i]![0], chord: sym, confidence: Math.exp(u.logp[best]!), doubtful: Math.exp(u.logp[best]!) < 0.35 });
  });
  const downbeat = Math.max(0, grid.numbers.indexOf(1));
  return { chords, beats: { times: b, downbeat, beatsPerBar: grid.beatsPerBar } };
};

export default crema;
