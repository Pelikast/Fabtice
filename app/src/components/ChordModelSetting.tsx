// « Modèle d'accords » in « Réglages » → « Détection des accords »: « Automatique (recommandé) », the
// default (the detailed model when this device allows it, else the standard one: `analysis/chordModel.ts`),
// CREMA (fast) or the fine Tsumugi-Chords (much better on jazz and old records, but minutes per piece,
// 2.5 GB of memory and weights under a non-commercial licence); 1.0.2, à l'essai: SheetSage2 alone, or the
// combination SheetSage2 + Tsumugi (`analysis/engine/combine.ts`). Stated plainly before it is used, as
// for the separation tools. A device preference (`analysis/chordModel.ts`). For the open piece, « Analyser de
// nouveau ce morceau avec ce modèle » runs the detection again; the user's corrections are kept (`runAnalysis`).

import { setChordModelSetting, useChordModelChoice, useChordModelSetting, type ChordModelSetting } from '../analysis/chordModel';
import { MODEL_REGISTRY, SHEETSAGE2_FILES } from '../analysis/models';
import { runAnalysis } from '../analysis/runner';
import { t } from '../i18n';
import { formatSize } from '../separation/useChoice';
import { useApp } from '../store/store';
import { useState } from 'react';

/** Minutes for 4 minutes of music on a computer, as measured (4 threads, see app/README.md). */
const FINE_MINUTES_PER_4MIN = 6;
/** SheetSage2 (1.0.2): minutes per window of 5 minutes of music, measured (4 threads, WASM; RECHERCHE.md). */
const SS2_MINUTES_PER_WINDOW = 6;

export function ChordModelSetting() {
  const setting = useChordModelSetting();
  // The model in use: the one chosen, or the one « Automatique » gives here.
  const choice = useChordModelChoice();
  const crema = MODEL_REGISTRY['crema-chords'];
  const fine = MODEL_REGISTRY['tsumugi-chords'];
  const ss2Bytes = SHEETSAGE2_FILES.reduce((n, f) => n + f.bytes, 0);
  const ss2 = MODEL_REGISTRY.sheetsage2;
  return (
    <div className="option option-colonne">
      <label htmlFor="modele-accords">{t('settings.chordModel')}</label>
      <select
        id="modele-accords"
        value={setting}
        data-testid="modele-accords"
        onChange={(e) => setChordModelSetting(e.target.value as ChordModelSetting)}
      >
        <option value="auto">{t('settings.chordModel.auto')}</option>
        <option value="crema">{t('settings.chordModel.crema')}</option>
        <option value="fine">{t('settings.chordModel.fine')}</option>
        <option value="sheetsage2">{t('settings.chordModel.sheetsage2')}</option>
        <option value="combined">{t('settings.chordModel.combined')}</option>
      </select>
      {setting === 'auto' && (
        <small data-testid="modele-accords-auto">{t(choice === 'fine' ? 'settings.chordModel.autoFine' : 'settings.chordModel.autoCrema')}</small>
      )}
      {choice === 'crema' && <small>{t('settings.chordModel.cremaNote', { size: formatSize(crema.bytes), licence: crema.licence, host: crema.host })}</small>}
      {choice === 'fine' && (
        <>
          <small>{t('settings.chordModel.fineNote')}</small>
          <small data-testid="modele-accords-cout">{t('settings.chordModel.fineCost', { minutes: FINE_MINUTES_PER_4MIN })}</small>
          <small>{t('settings.chordModel.fineSource', { host: fine.host, size: formatSize(fine.bytes), licence: fine.licence })}</small>
        </>
      )}
      {choice === 'sheetsage2' && (
        <>
          <small>{t('settings.chordModel.sheetsage2Note')}</small>
          <small data-testid="modele-accords-cout">{t('settings.chordModel.sheetsage2Cost', { minutes: SS2_MINUTES_PER_WINDOW })}</small>
          <small>{t('settings.chordModel.sheetsage2Source', { host: ss2.host, size: formatSize(ss2Bytes), licence: ss2.licence })}</small>
        </>
      )}
      {choice === 'combined' && (
        <>
          <small>{t('settings.chordModel.combinedNote')}</small>
          <small data-testid="modele-accords-cout">{t('settings.chordModel.combinedCost', { minutes: SS2_MINUTES_PER_WINDOW + FINE_MINUTES_PER_4MIN })}</small>
          <small>{t('settings.chordModel.sheetsage2Source', { host: ss2.host, size: formatSize(ss2Bytes), licence: ss2.licence })}</small>
          <small>{t('settings.chordModel.fineSource', { host: fine.host, size: formatSize(fine.bytes), licence: fine.licence })}</small>
        </>
      )}
    </div>
  );
}

/**
 * « Analyser de nouveau » for the open piece (1.0.1): « Garder mes corrections » ticked by
 * default (the corrections stay and guide the new analysis); unticked, everything done by hand is
 * dropped, after a second click that says so (one undoable step). `onStart`: e.g. close a panel.
 */
export function ChordAnalysisAgain({ label = t('settings.chordModel.again'), onStart }: { label?: string; onStart?: () => void }) {
  const running = useApp((s) => s.analysisRun.status === 'running');
  const [keep, setKeep] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const start = (fresh: boolean) => {
    setConfirming(false);
    onStart?.();
    void runAnalysis({ fresh });
  };
  return (
    <div className="option option-colonne">
      <label className="case">
        <input
          type="checkbox"
          checked={keep}
          data-testid="analyse-garder-corrections"
          onChange={(e) => {
            setKeep(e.target.checked);
            setConfirming(false);
          }}
        />
        {t('analysis.keepCorrections')}
      </label>
      <small>{t(keep ? 'analysis.keepCorrectionsNote' : 'analysis.freshNote')}</small>
      {confirming ? (
        <>
          <button type="button" className="bouton-cadre" data-testid="analyse-zero-confirmer" disabled={running} onClick={() => start(true)}>
            {t('analysis.freshConfirm')}
          </button>
          <small>{t('analysis.freshUndo')}</small>
        </>
      ) : (
        <button
          type="button"
          className="bouton-cadre"
          data-testid="modele-accords-relancer"
          disabled={running}
          onClick={() => (keep ? start(false) : setConfirming(true))}
        >
          {label}
        </button>
      )}
      <small>{t('settings.chordModel.againNote')}</small>
    </div>
  );
}
