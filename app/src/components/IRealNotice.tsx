// « Ouvrir dans iReal Pro » in the web app: the calm notice shown when the link seems not to have been taken
// (`export/irealOpen.ts`), or when it was too long to follow. Same family as the storage notice: paper, a brass
// rule on its left, never ember. « Enregistrer le fichier… » is the `irealFile` command.

import { useStore } from 'zustand';
import { t } from '../i18n';
import { runCommand } from '../ui/commands';
import { closeIRealNotice, irealNotice } from '../ui/irealNotice';

export function IRealNotice() {
  const notice = useStore(irealNotice, (s) => s.notice);
  if (!notice) return null;
  return (
    <div className="avis-stockage avis-ireal" role="status" data-testid="avis-ireal" data-avis={notice}>
      <p>{t(notice === 'asked' ? 'ireal.notice' : 'ireal.tooLong')}</p>
      <div className="avis-ireal-actions">
        {notice === 'asked' && (
          <button
            className="bouton-cadre"
            data-testid="avis-ireal-fichier"
            onClick={() => {
              closeIRealNotice();
              void runCommand('irealFile');
            }}
          >
            {t('ireal.saveFile')}
          </button>
        )}
        <button className="bouton-cadre" data-testid="avis-ireal-fermer" onClick={closeIRealNotice}>
          {t('ireal.close')}
        </button>
      </div>
    </div>
  );
}
