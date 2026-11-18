// « Détection des accords »: the model (« Rapide » or « Détaillé », with its weight), whether the analysis leans
// on the known charts of standards, whether the modulations and the structure are detected (stage 5), and for
// the open piece, the « Mode » of its structure (the same choice as the structure column's) and running the
// detection again.

import { t } from '../../i18n';
import { STRUCTURE_MODE_CHOICES } from '../../model/structure';
import { setAutoStructure, setDetectModulations, setListenToStems, setUseKnownCharts } from '../../store/settingsActions';
import { setStructureMode } from '../../store/structureActions';
import { useApp } from '../../store/store';
import { ChordAnalysisAgain, ChordModelSetting } from '../ChordModelSetting';
import { CheckRow, Section } from './parts';

export function ChordsTab() {
  const known = useApp((s) => s.settings.useKnownCharts);
  const stems = useApp((s) => s.settings.listenToStems);
  const modulations = useApp((s) => s.settings.detectModulations);
  const structure = useApp((s) => s.settings.autoStructure);
  const mode = useApp((s) => s.corrections.structure.mode);
  return (
    <>
      <Section scope="app">
        <ChordModelSetting />
        <CheckRow checked={known} onChange={setUseKnownCharts} label={t('settingsWin.chords.known')} note={t('settingsWin.chords.knownNote')} testId="grilles-connues" />
        <CheckRow checked={stems} onChange={setListenToStems} label={t('settingsWin.chords.stems')} note={t('settingsWin.chords.stemsNote')} testId="ecouter-instruments" />
        <CheckRow
          checked={modulations}
          onChange={setDetectModulations}
          label={t('settingsWin.chords.modulations')}
          note={t('settingsWin.chords.modulationsNote')}
          testId="detecter-modulations"
        />
        <CheckRow
          checked={structure}
          onChange={setAutoStructure}
          label={t('settingsWin.chords.structure')}
          note={t('settingsWin.chords.structureNote')}
          testId="structure-automatique"
        />
      </Section>
      <Section scope="piece">
        <div className="option option-colonne" role="radiogroup" aria-labelledby="reglages-mode-structure">
          <span id="reglages-mode-structure">{t('settingsWin.chords.mode')}</span>
          <div className="choix-reglage">
            {STRUCTURE_MODE_CHOICES.map((v) => (
              <button key={v} role="radio" aria-checked={mode === v} data-testid={`mode-structure-${v}`} onClick={() => setStructureMode(v)}>
                {t(`structure.mode.${v}`)}
              </button>
            ))}
          </div>
          <small>{t('settingsWin.chords.modeNote')}</small>
        </div>
        <ChordAnalysisAgain />
        <p className="panneau-note">{t('settingsWin.chords.pieceNote')}</p>
      </Section>
    </>
  );
}
