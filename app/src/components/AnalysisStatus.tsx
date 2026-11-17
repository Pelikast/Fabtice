// The discreet status of the analysis, next to the title in the top bar, and
// its small panel: steps and progress, where the analysis tools come from and
// under which licence (shown by itself the first time they are downloaded),
// « Annuler », « Analyser de nouveau ».

import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { getAnalyzer, type AnalysisModelInfo } from '../analysis';
import { useAnalysisProgress } from '../analysis/progress';
import { evidenceText } from '../analysis/evidenceText';
import { cancelAnalysis, runAnalysis } from '../analysis/runner';
import { chordModelChoice, useChordModelChoice } from '../analysis/chordModel';
import { analysisEvidence, resultChordModel, type ChordWindowProgress } from '../analysis/types';
import { formatBarNumber } from '../grid/format';
import { formatNumber, t } from '../i18n';
import { closePanel, openPanel, togglePanel } from '../store/actions';
import { selectAnalysisStatus } from '../store/chartSelectors';
import { appStore, useApp, type AnalysisRun } from '../store/store';
import { instrumentModelInfo, instrumentModelSourceText } from '../structure/instruments';
import { useOutsideClose } from '../ui/useOutsideClose';
import { useFitPanel } from '../ui/useFitPanel';

const percent = (f: number) => Math.round(Math.min(1, Math.max(0, f)) * 100);
const megabytes = (bytes: number) => formatNumber(bytes / 1e6, 0);

/** Whole percent of the fine chord step: the steady estimate, or the windows done when there is none. */
function windowPercentOf(w: ChordWindowProgress | null | undefined): number {
  if (!w || w.total <= 0) return 0;
  return percent(w.fraction ?? w.done / w.total);
}

/** Short text of the status for the top bar, or null when there is nothing to say. */
function statusText(run: AnalysisRun, fraction: number, window: (ChordWindowProgress & { percent: number }) | null, fallback: string | null): string | null {
  if (run.status === 'running') {
    if (run.step === 'download') return t('analysis.statusDownload', { n: percent(fraction) });
    if (run.step === 'chords' && window && window.total > 0) return t('analysis.statusFine', { n: window.percent });
    if (run.tempoBar !== undefined) return t('analysis.statusTempo', { bar: formatBarNumber(run.tempoBar), n: percent(fraction) });
    return t('analysis.statusRunning', { n: percent(fraction) });
  }
  if (run.status === 'error') return t('analysis.statusError');
  // The fine chord model could not run: the default one read the chords. Said calmly, until the next analysis.
  if (fallback) return t('analysis.statusFallback');
  return null;
}

export function AnalysisStatus() {
  const run = useApp((s) => s.analysisRun);
  // Whole percents only: the top bar redraws once per percent at most.
  const fraction = useAnalysisProgress((p) => percent(p.fraction) / 100);
  const windowDone = useAnalysisProgress((p) => p.chordWindow?.done ?? -1);
  const windowTotal = useAnalysisProgress((p) => p.chordWindow?.total ?? 0);
  const windowPercent = useAnalysisProgress((p) => windowPercentOf(p.chordWindow));
  const fallback = useAnalysisProgress((p) => p.fallback ?? null);
  const open = useApp((s) => s.ui.panel === 'analysis');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const refs = useRef([buttonRef, panelRef]).current;
  useOutsideClose(open, refs, useCallback(() => closePanel(), []));

  // The first download of the tools explains itself: the panel opens once, by itself.
  const explained = useRef(false);
  // True while the panel on screen is the one that opened by itself (the user has not touched it).
  const openedByItself = useRef(false);
  const downloading = run.status === 'running' && run.step === 'download';
  useEffect(() => {
    if (downloading && !explained.current && appStore.getState().ui.panel === 'none') {
      explained.current = true;
      openedByItself.current = true;
      openPanel('analysis');
    }
  }, [downloading]);
  // A panel that came by itself also leaves by itself once the analysis is over:
  // it must not stay over the chords it has just found. An error keeps it open.
  useEffect(() => {
    if (run.status === 'idle' && openedByItself.current) {
      openedByItself.current = false;
      if (appStore.getState().ui.panel === 'analysis') closePanel();
    }
  }, [run.status]);

  const text = statusText(run, fraction, windowDone >= 0 ? { done: windowDone, total: windowTotal, percent: windowPercent } : null, fallback);
  if (!text && !open) return null;
  return (
    // Any press on the button or in the panel means the user has taken it over: it then stays until they close it.
    <span className="analyse-etat" onPointerDownCapture={() => (openedByItself.current = false)}>
      {text && (
        <button
          ref={buttonRef}
          className={`analyse-bouton${run.status === 'error' ? ' erreur' : ''}${run.status === 'running' ? ' en-cours' : ''}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          data-testid="analyse-etat"
          onClick={() => {
            openedByItself.current = false;
            togglePanel('analysis');
          }}
        >
          {text}
        </button>
      )}
      {open && <AnalysisPanel ref={panelRef} />}
    </span>
  );
}

/** Progress, sources and licences: in the panel and in the chart's « analysis running » state. */
export function AnalysisProgressNote() {
  const run = useApp((s) => s.analysisRun);
  const fraction = useAnalysisProgress((p) => p.fraction);
  const download = useAnalysisProgress((p) => p.download);
  const windowDone = useAnalysisProgress((p) => p.chordWindow?.done ?? -1);
  const windowTotal = useAnalysisProgress((p) => p.chordWindow?.total ?? 0);
  const windowPercent = useAnalysisProgress((p) => windowPercentOf(p.chordWindow));
  const models = useModels();
  const instruments = useInstrumentModel();
  if (run.status !== 'running') return null;
  const toDownload = models.filter((m) => !m.cached);
  const showSources = run.step === 'download' || toDownload.length > 0;
  return (
    <div className="analyse-note">
      <div className="analyse-progres" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(fraction)}>
        <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, fraction))})` }} />
      </div>
      <p className="analyse-etape" data-testid="analyse-etape">
        {run.step === 'chords' && windowDone >= 0 && windowTotal > 0 ? t('analysis.stepFine', { n: windowPercent, done: windowDone, total: windowTotal }) : t(`analysis.step.${run.step}`)}
        {run.step === 'download' && download && ` · ${t('analysis.downloaded', { loaded: megabytes(download.loaded), total: megabytes(download.total) })}`}
      </p>
      {showSources && models.length > 0 && <ModelSources models={models} />}
      {/* Stage 5: the small instrument recogniser comes later (after a separation), but is said here, before its first download. */}
      {showSources && instruments && !instruments.cached && (
        <p className="analyse-sources" data-testid="source-instruments">
          {instrumentModelSourceText(`${formatNumber(instruments.bytes / 1e6, 1)} Mo`)}
        </p>
      )}
    </div>
  );
}

/** The instrument recogniser's model (`structure/instruments`), as the list of tools shows it; null until known. */
function useInstrumentModel(): AnalysisModelInfo | null {
  const [info, setInfo] = useState<AnalysisModelInfo | null>(null);
  useEffect(() => {
    let alive = true;
    instrumentModelInfo()
      .then((m) => alive && setInfo(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

function ModelSources({ models }: { models: AnalysisModelInfo[] }) {
  const total = models.filter((m) => !m.cached).reduce((s, m) => s + m.bytes, 0) || models.reduce((s, m) => s + m.bytes, 0);
  // One line per tool (a tool may come in several files).
  const tools = new Map<string, { role: string; licence: string; host: string }>();
  for (const m of models) {
    const name = m.name.replace(/\s*\(.*\)$/, '');
    if (!tools.has(name)) tools.set(name, { role: m.role, licence: m.licence, host: m.host });
  }
  const hosts = [...new Set(models.map((m) => m.host))].join(', ');
  return (
    <div className="analyse-sources">
      <p>{t('analysis.sourcesIntro', { size: megabytes(total), host: hosts })}</p>
      <ul>
        {[...tools.entries()].map(([name, x]) => (
          <li key={name}>
            <strong>{name}</strong> — {t('analysis.sourceLine', { role: x.role, licence: x.licence })}
          </li>
        ))}
      </ul>
    </div>
  );
}

function useModels(): AnalysisModelInfo[] {
  const [models, setModels] = useState<AnalysisModelInfo[]>([]);
  const step = useApp((s) => (s.analysisRun.status === 'running' ? s.analysisRun.step : null));
  const chordModel = useChordModelChoice();
  useEffect(() => {
    let alive = true;
    getAnalyzer()
      .models(chordModelChoice())
      .then((m) => alive && setModels(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [step, chordModel]);
  return models;
}

export function AnalysisPanel({ ref }: { ref: Ref<HTMLDivElement> }) {
  const status = useApp(selectAnalysisStatus);
  const run = useApp((s) => s.analysisRun);
  const used = useApp((s) => (s.analysis ? evidenceText(analysisEvidence(s.analysis)) : ''));
  // Primitives only: a selector that builds an object would re-render for ever.
  const chordId = useApp((s) => (s.analysis ? resultChordModel(s.analysis).id : null));
  const chordFallback = useApp((s) => (s.analysis ? (resultChordModel(s.analysis).fallback ?? null) : null));
  const chordModel = chordId ? { id: chordId, fallback: chordFallback } : null;
  const fitRef = useFitPanel(ref);
  return (
    <div ref={fitRef} className="fenetre panneau-analyse" role="dialog" aria-label={t('analysis.title')}>
      <h2 className="libelle">{t('analysis.title')}</h2>
      {status === 'running' ? (
        <>
          <p className="panneau-note">{t('analysis.runningText')}</p>
          <AnalysisProgressNote />
          <button className="bouton-cadre" onClick={cancelAnalysis}>
            {t('analysis.cancel')}
          </button>
        </>
      ) : (
        <>
          <p className="panneau-note">
            {run.status === 'error' ? t(`analysis.error.${run.code}`) : status === 'done' ? t('analysis.doneText') : t('analysis.noneText')}
          </p>
          {status === 'done' && used && (
            <p className="panneau-note" data-testid="analyse-ecoute">
              {used}
            </p>
          )}
          {status === 'done' && chordModel && (
            <p className="panneau-note" data-testid="analyse-modele-accords">
              {chordModel.fallback
                ? t(`analysis.fallback.${chordModel.fallback}`)
                : chordModel.id === 'tsumugi-chords'
                  ? t('analysis.chordModelFine')
                  : null}
            </p>
          )}
          <button
            className="bouton-cadre"
            onClick={() => {
              closePanel();
              void runAnalysis();
            }}
          >
            {status === 'none' ? t('analysis.start') : t('analysis.again')}
          </button>
        </>
      )}
    </div>
  );
}
