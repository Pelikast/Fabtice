// « Dossier pour Logic Pro… » (C15.4): a small window that says what the
// folder will hold, then the wait (a percentage, « Annuler »), then where the
// folder is and the three gestures. The content is `export/logic/`, the
// delivery `export/folder/` (a real folder in the Mac app, a .zip on the web).

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useStore } from 'zustand';
import { getAudio } from '../audio/registry';
import { ExportError, type Delivered } from '../export/audio';
import { FolderError, openFolderTarget, writesRealFolder, type FolderTarget } from '../export/folder';
import { closeExportLogic, logicDialog } from '../export/logic/dialog';
import { logicBarOfFirstBar, logicGestures, planLogicFolder, README_NAME, runLogicExport, type LogicFolderPlan } from '../export/logic';
import { formatSigned } from '../grid/format';
import { formatNumber, t } from '../i18n';
import { getRenderer } from '../render';
import { appliedAudioFor } from '../render/controller';
import { targetBpm } from '../store/derived';
import { appStore, useApp } from '../store/store';
import { CloseIcon } from '../ui/icons';

type Phase =
  | { kind: 'choose' }
  | { kind: 'working'; fraction: number; track: number }
  | { kind: 'zip'; file: Delivered; folderName: string }
  | { kind: 'folder'; folderName: string; where: string; reveal: () => Promise<boolean> }
  | { kind: 'error'; code: 'failed' | 'memory' | 'nothing' | 'too-large' };

export function ExportLogicDialog() {
  const open = useStore(logicDialog, (s) => s.open);
  if (!open) return null;
  return <ExportLogicBox />;
}

function ExportLogicBox() {
  const tracks = useApp((s) => s.tracks);
  const project = useApp((s) => s.project);
  const semitones = useApp((s) => s.playback.semitones);
  const cents = useApp((s) => s.playback.cents);
  const ratio = useApp((s) => s.playback.tempoRatio);
  const bpm = useApp((s) => targetBpm(s));
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' });
  const abortRef = useRef<AbortController | null>(null);
  const targetRef = useRef<FolderTarget | null>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const realFolder = writesRealFolder();
  // The plan as it is now (names, lead-in, Logic bar of « mesure 1 »); a piece without tracks has none.
  const plan = useMemo<LogicFolderPlan | null>(() => {
    try {
      return project && tracks.length ? planLogicFolder(appStore.getState()) : null;
    } catch {
      return null;
    }
  }, [project, tracks, semitones, cents, ratio]);
  useEffect(() => firstRef.current?.focus({ preventScroll: true }), [phase.kind]);
  useEffect(
    () => () => {
      abortRef.current?.abort();
      void targetRef.current?.abort();
    },
    [],
  );
  useEffect(() => () => (phase.kind === 'zip' ? phase.file.release() : undefined), [phase]);

  const working = phase.kind === 'working';
  const close = () => {
    abortRef.current?.abort();
    closeExportLogic();
  };

  const run = async () => {
    const state = appStore.getState();
    let p: LogicFolderPlan;
    try {
      p = planLogicFolder(state);
    } catch {
      setPhase({ kind: 'error', code: 'nothing' });
      return;
    }
    const abort = new AbortController();
    abortRef.current = abort;
    let target: FolderTarget | null;
    try {
      // The Mac app's save panel comes first: the user says where before the wait.
      target = await openFolderTarget(p.folderName);
    } catch {
      setPhase({ kind: 'error', code: 'failed' });
      return;
    }
    if (!target) return; // the panel was cancelled: back to the window as it was
    targetRef.current = target;
    const n = p.tracks.length;
    setPhase({ kind: 'working', fraction: 0, track: 1 });
    let shown = -1;
    try {
      await runLogicExport(p, target, {
        renderer: getRenderer(),
        audioOf: getAudio,
        appliedOf: (trackId) => appliedAudioFor(appStore.getState(), trackId),
        signal: abort.signal,
        onProgress: (f) => {
          const pct = Math.floor(f * 100);
          if (pct === shown) return;
          shown = pct;
          setPhase({ kind: 'working', fraction: f, track: Math.min(n, Math.floor((f / 0.99) * n) + 1) });
        },
      });
      if (abort.signal.aborted) throw new ExportError('cancelled');
      const result = await target.finish();
      targetRef.current = null;
      setPhase(result.kind === 'zip' ? { kind: 'zip', file: result.file, folderName: result.folderName } : { kind: 'folder', folderName: result.folderName, where: result.where, reveal: result.reveal });
    } catch (e) {
      targetRef.current = null;
      await target.abort();
      if (abort.signal.aborted || (e instanceof ExportError && e.code === 'cancelled') || (e instanceof FolderError && e.code === 'cancelled')) {
        setPhase({ kind: 'choose' });
        return;
      }
      const code = e instanceof ExportError && (e.code === 'memory' || e.code === 'nothing') ? e.code : e instanceof FolderError && e.code === 'too-large' ? 'too-large' : 'failed';
      setPhase({ kind: 'error', code });
    }
  };

  const changes: string[] = [];
  if (semitones !== 0) changes.push(t('exportLogic.semitones', { n: formatSigned(semitones) }));
  if (cents !== 0) changes.push(t('exportLogic.cents', { n: formatSigned(cents) }));
  if (ratio !== 1) changes.push(t('exportLogic.tempo', { n: bpm !== null ? `${formatNumber(Math.round(bpm), 0)} BPM` : `${Math.round(ratio * 100)} %` }));
  const keyTempo = t('exportLogic.keyTempo', { what: changes.length ? changes.join(', ') : t('exportLogic.original') });
  const midiName = plan?.midiName ?? '';
  const logicBar = plan ? logicBarOfFirstBar(plan.session) : null;
  const tempoWarning = plan?.session.warnings.some((w) => w.kind === 'tempo-out-of-range') ?? false;

  const gestures = (
    <>
      <h3>{t('exportLogic.gesturesTitle')}</h3>
      <ol className="gestes-logic" data-testid="gestes-logic">
        {logicGestures(midiName).map((g, i) => (
          <li key={i}>{g}</li>
        ))}
      </ol>
      {logicBar !== null && logicBar !== 1 && <p className="export-resume">{t('exportLogic.firstBar', { n: logicBar })}</p>}
      <p className="export-resume">{t('exportLogic.readmeNote', { name: README_NAME })}</p>
    </>
  );

  return (
    <div
      className="voile ouverte voile-logic"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-logic-titre"
      data-testid="export-logic"
      data-phase={phase.kind}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !working) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !working) close();
      }}
    >
      <div className="accueil export-logic">
        <div className="accueil-entete">
          <h2 id="export-logic-titre">{t('exportLogic.title')}</h2>
          {!working && (
            <button className="fermer" aria-label={t('exportLogic.close')} onClick={close}>
              <CloseIcon />
            </button>
          )}
        </div>
        {phase.kind === 'choose' && (
          <>
            <p>{t('exportLogic.intro')}</p>
            <ul className="contenu-logic">
              <li>
                <strong>{t('exportLogic.tracksTitle', { n: tracks.length })}</strong>
                <span>{tracks.map((tr) => tr.name).join(', ')}</span>
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
            <div className="import-actions">
              <button className="bouton-cadre" onClick={close}>
                {t('exportLogic.cancel')}
              </button>
              <button ref={firstRef} className="plein" data-testid="creer-dossier-logic" disabled={!plan} onClick={() => void run()}>
                {t('exportLogic.go')}
              </button>
            </div>
          </>
        )}
        {phase.kind === 'working' && (
          <div className="import-etat" role="status" aria-live="polite">
            <div className="phase">
              <span>{t('exportLogic.working')}</span>
              <span data-testid="pourcentage-logic">{t('import.percent', { n: Math.round(phase.fraction * 100) })}</span>
            </div>
            <div className="jauge" style={{ '--avance': phase.fraction } as CSSProperties}>
              <span />
            </div>
            <p className="export-resume">{t('exportLogic.trackOf', { i: phase.track, n: tracks.length, name: tracks[phase.track - 1]?.name ?? '' })}</p>
            <div className="import-actions">
              <button ref={firstRef} className="bouton-cadre" onClick={() => abortRef.current?.abort()}>
                {t('exportLogic.cancel')}
              </button>
            </div>
          </div>
        )}
        {phase.kind === 'folder' && (
          <>
            <p data-testid="fin-logic">{t('exportLogic.doneFolder', { name: phase.folderName, where: phase.where })}</p>
            {gestures}
            <div className="import-actions">
              <button className="bouton-cadre" onClick={close}>
                {t('exportLogic.close')}
              </button>
              <button ref={firstRef} className="plein" data-testid="afficher-dossier-logic" onClick={() => void phase.reveal()}>
                {t('exportLogic.reveal')}
              </button>
            </div>
          </>
        )}
        {phase.kind === 'zip' && (
          <>
            <p data-testid="fin-logic">{t('exportLogic.doneZip', { name: phase.folderName })}</p>
            <a className="plein fichier-pret" data-testid="fichier-logic" href={phase.file.href} download={phase.file.name}>
              {t('exportLogic.save')}
            </a>
            {gestures}
            <div className="import-actions">
              <button ref={firstRef} className="bouton-cadre" onClick={close}>
                {t('exportLogic.close')}
              </button>
            </div>
          </>
        )}
        {phase.kind === 'error' && (
          <>
            <div className="import-erreur" role="alert">
              <p>{t(`exportLogic.error.${phase.code === 'too-large' ? 'tooLarge' : phase.code}`)}</p>
            </div>
            <div className="import-actions">
              <button className="bouton-cadre" onClick={close}>
                {t('exportLogic.close')}
              </button>
              <button ref={firstRef} className="plein" onClick={() => setPhase({ kind: 'choose' })}>
                {t('import.retry')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
