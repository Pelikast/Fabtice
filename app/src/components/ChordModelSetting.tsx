// « Modèle d'accords » in « Réglages » → « Détection des accords »: CREMA (the default, fast) or the fine
// Tsumugi-Chords (much better on jazz and old records, but minutes per piece, 2.5 GB of memory
// and weights under a non-commercial licence). Stated plainly before it is chosen, as for the
// separation tools. A device preference (`analysis/chordModel.ts`). For the open piece, « Analyser de
// nouveau ce morceau avec ce modèle » runs the detection again; the user's corrections are kept (`runAnalysis`).

import { setChordModelChoice, useChordModelChoice } from '../analysis/chordModel';
import { MODEL_REGISTRY, type ChordModelChoice } from '../analysis/models';
import { runAnalysis } from '../analysis/runner';
import { t } from '../i18n';
import { formatSize } from '../separation/useChoice';
import { useApp } from '../store/store';

/** Minutes for 4 minutes of music on a computer, as measured (4 threads, see app/README.md). */
const FINE_MINUTES_PER_4MIN = 6;

export function ChordModelSetting() {
  const choice = useChordModelChoice();
  const crema = MODEL_REGISTRY['crema-chords'];
  const fine = MODEL_REGISTRY['tsumugi-chords'];
  return (
    <div className="option option-colonne">
      <label htmlFor="modele-accords">{t('settings.chordModel')}</label>
      <select
        id="modele-accords"
        value={choice}
        data-testid="modele-accords"
        onChange={(e) => setChordModelChoice(e.target.value as ChordModelChoice)}
      >
        <option value="crema">{t('settings.chordModel.crema')}</option>
        <option value="fine">{t('settings.chordModel.fine')}</option>
      </select>
      {choice === 'crema' ? (
        <small>{t('settings.chordModel.cremaNote', { size: formatSize(crema.bytes), licence: crema.licence, host: crema.host })}</small>
      ) : (
        <>
          <small>{t('settings.chordModel.fineNote')}</small>
          <small data-testid="modele-accords-cout">{t('settings.chordModel.fineCost', { minutes: FINE_MINUTES_PER_4MIN })}</small>
          <small>{t('settings.chordModel.fineSource', { host: fine.host, size: formatSize(fine.bytes), licence: fine.licence })}</small>
        </>
      )}
    </div>
  );
}

/** For the open piece: the detection runs again with the model in force. Offered at any time (there is no « changed » to wait for). */
export function ChordAnalysisAgain() {
  const running = useApp((s) => s.analysisRun.status === 'running');
  return (
    <div className="option option-colonne">
      <button type="button" className="bouton-cadre" data-testid="modele-accords-relancer" disabled={running} onClick={() => void runAnalysis()}>
        {t('settings.chordModel.again')}
      </button>
      <small>{t('settings.chordModel.againNote')}</small>
    </div>
  );
}
