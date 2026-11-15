// `basse-bande`: The bass cue without separation: read on the 40–300 Hz band of the mix.

import { listening } from '../ecoute-variante';

export default listening({ harmony: 'aucune', mixWeight: 1, bass: 'bande' });
