// « Dossier pour Logic Pro… » (C15.4): a small window that says what the
// folder will hold, then the wait (a percentage, « Annuler »), then where the
// folder is and the three gestures. The window is the one of every sequencer
// folder (`SequencerExportDialog.tsx`); the content is `export/logic/`.

import { useStore } from 'zustand';
import { closeExportLogic, logicDialog } from '../export/logic/dialog';
import { logicBarOfFirstBar, logicGestures, planLogicFolder, README_NAME, runLogicExport, type LogicFolderPlan } from '../export/logic';
import { t } from '../i18n';
import { SequencerExportBox, type SequencerExport } from './SequencerExportDialog';

const LOGIC: SequencerExport<LogicFolderPlan> = {
  id: 'logic',
  texts: 'exportLogic',
  plan: planLogicFolder,
  run: runLogicExport,
  tracksShare: 0.99,
  close: closeExportLogic,
  intro: (plan, { keyTempo, realFolder, trackNames }) => {
    const tempoWarning = plan?.session.warnings.some((w) => w.kind === 'tempo-out-of-range') ?? false;
    return (
      <>
        <p>{t('exportLogic.intro')}</p>
        <ul className="contenu-sequenceur">
          <li>
            <strong>{t('exportLogic.tracksTitle', { n: trackNames.length })}</strong>
            <span>{trackNames.join(', ')}</span>
          </li>
          <li>
            <strong>{t('exportLogic.midiTitle')}</strong>
            <span>{t('exportLogic.midiNote')}</span>
          </li>
          <li>
            <strong>{README_NAME}</strong>
            <span>{t('exportLogic.readmeLine')}</span>
          </li>
        </ul>
        <p className="accueil-avis">{t('exportLogic.unity')}</p>
        <p className="export-resume">
          {keyTempo} {realFolder ? t('exportLogic.whereMac') : t('exportLogic.whereWeb')}
        </p>
        {tempoWarning && <p className="export-resume">{t('exportLogic.tempoWarning')}</p>}
      </>
    );
  },
  end: (plan) => {
    const logicBar = plan ? logicBarOfFirstBar(plan.session) : null;
    return (
      <>
        <h3>{t('exportLogic.gesturesTitle')}</h3>
        <ol className="gestes-sequenceur" data-testid="gestes-logic">
          {logicGestures(plan?.midiName ?? '').map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ol>
        {logicBar !== null && logicBar !== 1 && <p className="export-resume">{t('exportLogic.firstBar', { n: logicBar })}</p>}
        <p className="export-resume">{t('exportLogic.readmeNote', { name: README_NAME })}</p>
      </>
    );
  },
};

export function ExportLogicDialog() {
  const open = useStore(logicDialog, (s) => s.open);
  if (!open) return null;
  return <SequencerExportBox config={LOGIC} />;
}
