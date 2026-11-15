// `ecoute-reelle`: As `ecoute`, on what the app's separation really gives (HTDemucs 6 sources,
// banc/separer.ts). Run with --only on the separated pieces; the others fall
// back to the band of the mix.

import { listening } from '../ecoute-variante';

export default listening({ harmony: 'selection', mixWeight: 0.3, bass: 'auto', stems: 'reelles' });
