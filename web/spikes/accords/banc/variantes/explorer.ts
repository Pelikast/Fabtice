// `explorer`: a scratch variant for trying listening options from the command
// line before freezing them into named variants. E_H (aucune | selection |
// oracle | sans-batterie), E_MIXW, E_BASS (aucune | tige | bande | auto),
// E_BW, E_BT, E_BF, E_BP (three numbers), E_STEMS (ideales | reelles).

import { listening, type ListeningConfig } from '../ecoute-variante';

const e = process.env;
const bassOptions: NonNullable<ListeningConfig['bassOptions']> = {};
if (e.E_BW) bassOptions.weight = Number(e.E_BW);
if (e.E_BT) bassOptions.tones = Number(e.E_BT);
if (e.E_BF) bassOptions.floor = Number(e.E_BF);
if (e.E_BP) bassOptions.positions = e.E_BP.split(',').map(Number) as [number, number, number];

export default listening({
  harmony: (e.E_H ?? 'aucune') as ListeningConfig['harmony'],
  mixWeight: Number(e.E_MIXW ?? 0.3),
  bass: (e.E_BASS ?? 'aucune') as ListeningConfig['bass'],
  bassOptions,
  stems: (e.E_STEMS ?? 'ideales') as ListeningConfig['stems'],
});
