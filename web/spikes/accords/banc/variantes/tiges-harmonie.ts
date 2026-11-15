// `tiges-harmonie`: Means 1 alone: the chord network also hears a remix of the separated parts that
// carry the harmony (chosen from the audio by `selectHarmony`) and the bass, no
// drums, no melody; pooled with the mix (weight 0.3 to the mix). Ideal stems.

import { listening } from '../ecoute-variante';

export default listening({ harmony: 'selection', mixWeight: 0.3, bass: 'aucune' });
