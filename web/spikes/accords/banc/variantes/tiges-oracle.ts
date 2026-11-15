// `tiges-oracle`: Diagnostic: as `tiges-harmonie` but the harmony parts are read from the
// truth (what a perfect selector would pick). Never a candidate for the app.

import { listening } from '../ecoute-variante';

export default listening({ harmony: 'oracle', mixWeight: 0.3, bass: 'aucune' });
