// The window of the sequencer folders (« Dossier pour Logic Pro… » C15.4,
// « Projet Ableton Live… » C15.5): what the folder will hold, then the wait (a
// percentage, « Annuler »), then where the folder is and what to do with it.
// The parts that differ (what is said before and after) come from each export;
// the delivery is `export/folder/` (a real folder in the Mac app, a .zip on
// the web), the tracks `export/sequencer/`.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { getAudio } from '../audio/registry';
import { ExportError, type Delivered } from '../export/audio';
import { FolderError, openFolderTarget, writesRealFolder, type FolderTarget } from '../export/folder';
import type { SequencerRenderDeps } from '../export/sequencer';
import { formatSigned } from '../grid/format';
import { formatNumber, t, type MessageKey } from '../i18n';
import { getRenderer } from '../render';
import { appliedAudioFor } from '../render/controller';
import { targetBpm } from '../store/derived';
import { appStore, useApp, type AppState } from '../store/store';
import { CloseIcon } from '../ui/icons';

type Phase =
  | { kind: 'choose' }
  | { kind: 'working'; fraction: number; track: number }
  | { kind: 'zip'; file: Delivered; folderName: string }
  | { kind: 'folder'; folderName: string; where: string; reveal: () => Promise<boolean> }
  | { kind: 'error'; code: 'failed' | 'memory' | 'nothing' | 'too-large' };

export interface SequencerExport<P extends { folderName: string; tracks: readonly unknown[] }> {
  /** « logic », « ableton »: the window's test ids (`export-logic`, `creer-dossier-logic`…) and class. */
  id: string;
  /** The prefix of its texts (`exportLogic` → `exportLogic.title`, `.go`, `.cancel`, `.close`, `.working`…). */
  texts: string;
  plan: (s: AppState) => P;
  run: (plan: P, target: FolderTarget, deps: SequencerRenderDeps) => Promise<void>;
  /** Fraction of the progress the tracks take (the track shown during the wait follows it). */
  tracksShare: number;
  /** What the window says before (between the title and the buttons). `keyTempo`: the key and tempo line. */
  intro: (plan: P | null, info: { keyTempo: string; realFolder: boolean; trackNames: string[] }) => ReactNode;
  /** What it says at the end, under « Le dossier … est enregistré ». */
  end: (plan: P | null, folderName: string) => ReactNode;
  close: () => void;
}

/** « Tonalité et tempo : +2 demi-tons, tempo 90 BPM. », with the export's texts. */
function keyTempoLine(prefix: string, semitones: number, cents: number, ratio: number, bpm: number | null): string {
  const k = (s: string) => `${prefix}.${s}` as MessageKey;
  const changes: string[] = [];
  if (semitones !== 0) changes.push(t(k('semitones'), { n: formatSigned(semitones) }));
  if (cents !== 0) changes.push(t(k('cents'), { n: formatSigned(cents) }));
  if (ratio !== 1) changes.push(t(k('tempo'), { n: bpm !== null ? `${formatNumber(Math.round(bpm), 0)} BPM` : `${Math.round(ratio * 100)} %` }));
  return t(k('keyTempo'), { what: changes.length ? changes.join(', ') : t(k('original')) });
}

export function SequencerExportBox<P extends { folderName: string; tracks: readonly unknown[] }>({ config }: { config: SequencerExport<P> }) {
  const { id } = config;
  const k = (s: string) => `${config.texts}.${s}` as MessageKey;
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
  // The plan as it is now (names, lead-in…); a piece without tracks has none.
  const plan = useMemo<P | null>(() => {
    try {
      return project && tracks.length ? config.plan(appStore.getState()) : null;
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
    config.close();
  };

  const run = async () => {
    const state = appStore.getState();
    let p: P;
    try {
      p = config.plan(state);
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
      await config.run(p, target, {
        renderer: getRenderer(),
        audioOf: getAudio,
        appliedOf: (trackId) => appliedAudioFor(appStore.getState(), trackId),
        signal: abort.signal,
        onProgress: (f) => {
          const pct = Math.floor(f * 100);
          if (pct === shown) return;
          shown = pct;
          setPhase({ kind: 'working', fraction: f, track: Math.min(n, Math.floor((f / config.tracksShare) * n) + 1) });
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

  const keyTempo = keyTempoLine(config.texts, semitones, cents, ratio, bpm);

  return (
    <div
      className={`voile ouverte voile-sequenceur voile-${id}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`export-${id}-titre`}
      data-testid={`export-${id}`}
      data-phase={phase.kind}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !working) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !working) close();
      }}
    >
      <div className={`accueil export-sequenceur export-${id}`}>
        <div className="accueil-entete">
          <h2 id={`export-${id}-titre`}>{t(k('title'))}</h2>
          {!working && (
            <button className="fermer" aria-label={t(k('close'))} onClick={close}>
              <CloseIcon />
            </button>
          )}
        </div>
        {phase.kind === 'choose' && (
          <>
            {config.intro(plan, { keyTempo, realFolder, trackNames: tracks.map((tr) => tr.name) })}
            <div className="import-actions">
              <button className="bouton-cadre" onClick={close}>
                {t(k('cancel'))}
              </button>
              <button ref={firstRef} className="plein" data-testid={`creer-dossier-${id}`} disabled={!plan} onClick={() => void run()}>
                {t(k('go'))}
              </button>
            </div>
          </>
        )}
        {phase.kind === 'working' && (
          <div className="import-etat" role="status" aria-live="polite">
            <div className="phase">
              <span>{t(k('working'))}</span>
              <span data-testid={`pourcentage-${id}`}>{t('import.percent', { n: Math.round(phase.fraction * 100) })}</span>
            </div>
            <div className="jauge" style={{ '--avance': phase.fraction } as CSSProperties}>
              <span />
            </div>
            <p className="export-resume">{t(k('trackOf'), { i: phase.track, n: tracks.length, name: tracks[phase.track - 1]?.name ?? '' })}</p>
            <div className="import-actions">
              <button ref={firstRef} className="bouton-cadre" onClick={() => abortRef.current?.abort()}>
                {t(k('cancel'))}
              </button>
            </div>
          </div>
        )}
        {phase.kind === 'folder' && (
          <>
            <p data-testid={`fin-${id}`}>{t(k('doneFolder'), { name: phase.folderName, where: phase.where })}</p>
            {config.end(plan, phase.folderName)}
            <div className="import-actions">
              <button className="bouton-cadre" onClick={close}>
                {t(k('close'))}
              </button>
              <button ref={firstRef} className="plein" data-testid={`afficher-dossier-${id}`} onClick={() => void phase.reveal()}>
                {t(k('reveal'))}
              </button>
            </div>
          </>
        )}
        {phase.kind === 'zip' && (
          <>
            <p data-testid={`fin-${id}`}>{t(k('doneZip'), { name: phase.folderName })}</p>
            <a className="plein fichier-pret" data-testid={`fichier-${id}`} href={phase.file.href} download={phase.file.name}>
              {t(k('save'))}
            </a>
            {config.end(plan, phase.folderName)}
            <div className="import-actions">
              <button ref={firstRef} className="bouton-cadre" onClick={close}>
                {t(k('close'))}
              </button>
            </div>
          </>
        )}
        {phase.kind === 'error' && (
          <>
            <div className="import-erreur" role="alert">
              <p>{t(k(`error.${phase.code === 'too-large' ? 'tooLarge' : phase.code}`))}</p>
            </div>
            <div className="import-actions">
              <button className="bouton-cadre" onClick={close}>
                {t(k('close'))}
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
