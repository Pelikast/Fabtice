// `reprises`: the app's analysis (as `base`) with the repeats of the form (app/src/analysis/engine/repeats.ts) as soft evidence, added to the
// network's evidence before decoding; « doubtful » from the reliability model
// (app/src/analysis/engine/reliability.ts). The title is the piece's own.
// The fuller evaluation (dev / held-out, noisy titles, reharmonised bars,
// chart acceptance) is banc/structure.ts.

import { analyse } from '../structure/analyse';
import type { Variant } from '../types';

const variant: Variant = async (input, ctx) => analyse(input, await ctx.networks(input.mixPath), { repeats: {}, chart: null, reliability: true }).out;

export default variant;
