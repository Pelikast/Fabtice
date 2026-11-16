// « Détection des accords »: the model (« Rapide » or « Détaillé », with its weight), whether the analysis leans
// on the known charts of standards, and for the open piece, running the detection again. « Détecter les
// modulations » and « structure automatique et mode » come with the stages that build them.

import { t } from '../../i18n';
import { setUseKnownCharts } from '../../store/settingsActions';
import { useApp } from '../../store/store';
import { ChordAnalysisAgain, ChordModelSetting } from '../ChordModelSetting';
import { CheckRow, Section } from './parts';

export function ChordsTab() {
  const known = useApp((s) => s.settings.useKnownCharts);
  return (
    <>
      <Section scope="app">
        <ChordModelSetting />
        <CheckRow checked={known} onChange={setUseKnownCharts} label={t('settingsWin.chords.known')} note={t('settingsWin.chords.knownNote')} testId="grilles-connues" />
      </Section>
      <Section scope="piece">
        <ChordAnalysisAgain />
        <p className="panneau-note">{t('settingsWin.chords.pieceNote')}</p>
      </Section>
    </>
  );
}
