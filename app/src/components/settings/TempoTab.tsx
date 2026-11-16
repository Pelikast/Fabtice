// « Tempo et analyse »: for the app, whether a new piece is analysed at once and how the sub-grid and the magnet
// behave; for the open piece, the analysis itself, the grid (first beat, beats per bar, tempo × 2 and ÷ 2, back
// to the analysis) and the tuning of the recording. The small panels « Tempo et mesures » and « Tonalité »
// stay where they are and show the same settings, on the same state.

import { runAnalysis } from '../../analysis/runner';
import { t } from '../../i18n';
import { setAnalyseOnImport } from '../../store/settingsActions';
import { toggleSnap, toggleTriplets } from '../../store/actions';
import { selectAnalysisStatus, tuningInForce } from '../../store/chartSelectors';
import { useApp } from '../../store/store';
import { TripletIcon } from '../../ui/icons';
import { BackToAnalysisButton, BeatsPerBarSetting, DownbeatSetting, GridOriginNote, TempoFixSetting } from '../GridPanel';
import { SubdivisionSelect } from '../Transport';
import { RecordingTuning } from '../TuningPanel';
import { CheckRow, Section, SubTitle } from './parts';

export function TempoTab() {
  const analyseOnImport = useApp((s) => s.settings.analyseOnImport);
  const snap = useApp((s) => s.view.snap);
  const triplets = useApp((s) => s.view.triplets);
  return (
    <>
      <Section scope="app">
        <CheckRow checked={analyseOnImport} onChange={setAnalyseOnImport} label={t('settingsWin.tempo.analyseOnImport')} note={t('settingsWin.tempo.analyseOnImportNote')} testId="analyser-des-import" />
        <div className="option option-colonne" data-testid="reglage-sous-grille">
          <label htmlFor="reglage-sous-grille-liste">{t('sub.label')}</label>
          <div className="sous-grille-ligne">
            <SubdivisionSelect id="reglage-sous-grille-liste" />
            <button className="bascule" aria-pressed={triplets} data-testid="reglage-triolets" onClick={toggleTriplets}>
              <TripletIcon />
              {t('sub.triplets')}
            </button>
          </div>
        </div>
        <CheckRow checked={snap} onChange={toggleSnap} label={t('settingsWin.tempo.magnet')} note={t('settingsWin.tempo.magnetNote')} testId="reglage-magnetisme" />
      </Section>
      <Section scope="piece">
        <AnalysisNow />
        <SubTitle>{t('grid.title')}</SubTitle>
        <div className="reglages-grille">
          <BeatsPerBarSetting />
          <TempoFixSetting />
          <DownbeatSetting />
          <GridOriginNote />
          <div className="panneau-actions">
            <BackToAnalysisButton />
          </div>
        </div>
        <SubTitle>{t('settingsWin.tempo.tuningTitle')}</SubTitle>
        <Tuning />
      </Section>
    </>
  );
}

/** « Analyser ce morceau »: the way to start the analysis by hand (the one that is always there, whatever « Analyser dès l'import » says). */
function AnalysisNow() {
  const status = useApp(selectAnalysisStatus);
  return (
    <>
      <SubTitle>{t('settingsWin.tempo.analysisTitle')}</SubTitle>
      <div className="option option-colonne">
        <button className="bouton-cadre" data-testid="analyser-maintenant" disabled={status === 'running'} onClick={() => void runAnalysis()}>
          {status === 'running' ? t('settingsWin.tempo.analysing') : t(status === 'none' ? 'settingsWin.tempo.analyseNow' : 'settingsWin.tempo.analyseAgain')}
        </button>
        <small>{t('settingsWin.tempo.analyseNote')}</small>
      </div>
    </>
  );
}

/** The tuning measured on the recording, and the offer to compensate it (the same as in the small panel). */
function Tuning() {
  const measured = useApp((s) => tuningInForce(s).cents);
  return measured === null ? (
    <p className="panneau-note">{t('settingsWin.tempo.tuningNone')}</p>
  ) : (
    <div className="reglages-accordage">
      <RecordingTuning />
    </div>
  );
}
