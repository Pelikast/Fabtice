// `grille-connue`: the app's analysis (as `base`) with the known chart found by the title (app/src/analysis/engine/knownChart.ts), verified against the audio, added to the
// network's evidence before decoding; « doubtful » from the reliability model
// (app/src/analysis/engine/reliability.ts). The title is the piece's own.
// The fuller evaluation (dev / held-out, noisy titles, reharmonised bars,
// chart acceptance) is banc/structure.ts.

import { analyse } from '../structure/analyse';
import type { Variant } from '../types';

const variant: Variant = async (input, ctx) => analyse(input, await ctx.networks(input.mixPath), { repeats: null, chart: {}, reliability: true }).out;

export default variant;
