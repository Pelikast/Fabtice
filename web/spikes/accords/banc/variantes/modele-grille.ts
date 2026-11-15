// `modele-grille`: the app's own analysis (`base`), which also writes the beat grid and the
// key it detected for every file to data/modeles/app-grid/<sha256 of the audio>.json. The
// chord-model candidates (web/spikes/accords/modeles/) that read beats and key (Tsumugi)
// are then fed what the app would give them, not the truth. Run it with --grid detected.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA } from '../paths';
import type { Variant } from '../types';
import base from './base';

const PCS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const grille: Variant = async (input, ctx) => {
  const out = await base(input, ctx);
  if (!input.truthGrid && out.beats) {
    const { times, downbeat, beatsPerBar } = out.beats;
    const beats = times.map((t, i) => [t, ((((i - downbeat) % beatsPerBar) + beatsPerBar) % beatsPerBar) + 1]);
    const key = out.key ? `${PCS[out.key.tonic]}:${out.key.mode}` : null;
    const sha = createHash('sha256').update(readFileSync(input.mixPath)).digest('hex');
    const dir = join(DATA, 'modeles', 'app-grid');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${sha}.json`), JSON.stringify({ id: input.id, condition: input.condition, beats, key, beatsPerBar }));
  }
  return out;
};

export default grille;
