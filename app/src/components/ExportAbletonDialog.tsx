// « Projet Ableton Live… » (C15.5): the window of the sequencer folders
// (`SequencerExportDialog.tsx`) with what this folder holds, said « à
// l'essai » first (nobody could open it in Live; the MIDI file and the tracks
// work in any case), and at the end which set to open and what to do when
// Live says files are missing. The content is `export/ableton/`.

import { useStore } from 'zustand';
import { abletonDialog, closeExportAbleton } from '../export/ableton/dialog';
import { ABLETON_README_NAME, abletonMissingSteps, abletonNoteLines, planAbletonFolder, runAbletonExport, type AbletonFolderPlan } from '../export/ableton';
import { logicBarOfFirstBar } from '../export/logic';
import { t } from '../i18n';
import { SequencerExportBox, type SequencerExport } from './SequencerExportDialog';

function TrialNotice({ short = false }: { short?: boolean }) {
  return (
    <p className="avis-essai" data-testid="essai-ableton">
      <span className="pastille-essai">{t('exportAbleton.trial')}</span>
      {short ? t('exportAbleton.trialShort', { name: ABLETON_README_NAME }) : t('exportAbleton.trialNote')}
    </p>
  );
}

const ABLETON: SequencerExport<AbletonFolderPlan> = {
  id: 'ableton',
  texts: 'exportAbleton',
  plan: planAbletonFolder,
  run: runAbletonExport,
  tracksShare: 0.98,
  close: closeExportAbleton,
  intro: (plan, { keyTempo, realFolder, trackNames }) => {
    const notes = plan ? abletonNoteLines(plan.notes, plan.warnings) : [];
    return (
      <>
        <TrialNotice />
        <p>{t('exportAbleton.intro')}</p>
        <ul className="contenu-sequenceur">
          <li>
            <strong>{t('exportAbleton.setsTitle')}</strong>
            <span>{t('exportAbleton.setsNote', { set: plan?.setName ?? '', set10: plan?.set10Name ?? '' })}</span>
          </li>
          <li>
            <strong>{t('exportAbleton.tracksTitle', { n: trackNames.length })}</strong>
            <span>{trackNames.join(', ')}</span>
          </li>
          <li>
            <strong>{t('exportAbleton.midiTitle')}</strong>
            <span>{t('exportAbleton.midiNote')}</span>
          </li>
          <li>
            <strong>{ABLETON_README_NAME}</strong>
            <span>{t('exportAbleton.readmeLine')}</span>
          </li>
        </ul>
        <p className="accueil-avis">{t('exportAbleton.unity')}</p>
        <p className="export-resume">
          {keyTempo} {realFolder ? t('exportAbleton.whereMac') : t('exportAbleton.whereWeb')}
        </p>
        {notes.map((line, i) => (
          <p key={i} className="export-resume">
            {line}
          </p>
        ))}
      </>
    );
  },
  end: (plan, folderName) => {
    const bar = plan ? logicBarOfFirstBar(plan.session) : null;
    return (
      <>
        <TrialNotice short />
        <h3>{t('exportAbleton.openTitle')}</h3>
        <ul className="ouvrir-ableton" data-testid="ouvrir-ableton">
          <li>{t('exportAbleton.open11', { set: plan?.setName ?? '' })}</li>
          <li>{t('exportAbleton.open10', { set10: plan?.set10Name ?? '' })}</li>
        </ul>
        <h3>{t('exportAbleton.missingTitle')}</h3>
        <ol className="gestes-sequenceur" data-testid="gestes-ableton">
          {abletonMissingSteps(folderName).map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ol>
        {bar !== null && bar !== 1 && <p className="export-resume">{t('exportAbleton.firstBar', { n: bar })}</p>}
      </>
    );
  },
};

export function ExportAbletonDialog() {
  const open = useStore(abletonDialog, (s) => s.open);
  if (!open) return null;
  return <SequencerExportBox config={ABLETON} />;
}
