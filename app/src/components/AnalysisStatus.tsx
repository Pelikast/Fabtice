// The discreet status of the analysis, next to the title in the top bar, and
// its small panel: steps and progress, where the analysis tools come from and
// under which licence (shown by itself the first time they are downloaded),
// « Annuler », « Analyser de nouveau ».

import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { getAnalyzer, type AnalysisModelInfo } from '../analysis';
import { useAnalysisProgress } from '../analysis/progress';
import { cancelAnalysis, runAnalysis } from '../analysis/runner';
import { formatNumber, t } from '../i18n';
import { closePanel, openPanel, togglePanel } from '../store/actions';
import { selectAnalysisStatus } from '../store/chartSelectors';
import { appStore, useApp, type AnalysisRun } from '../store/store';
import { useOutsideClose } from '../ui/useOutsideClose';

const percent = (f: number) => Math.round(Math.min(1, Math.max(0, f)) * 100);
const megabytes = (bytes: number) => formatNumber(bytes / 1e6, 0);

/** Short text of the status for the top bar, or null when there is nothing to say. */
function statusText(run: AnalysisRun, fraction: number): string | null {
  if (run.status === 'running') {
    return run.step === 'download'
      ? t('analysis.statusDownload', { n: percent(fraction) })
      : t('analysis.statusRunning', { n: percent(fraction) });
  }
  if (run.status === 'error') return t('analysis.statusError');
  return null;
}

export function AnalysisStatus() {
  const run = useApp((s) => s.analysisRun);
  // Whole percents only: the top bar redraws once per percent at most.
  const fraction = useAnalysisProgress((p) => percent(p.fraction) / 100);
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

  const text = statusText(run, fraction);
  if (!text && !open) return null;
  return (
    // Any press on the button or in the panel means the user has taken it over: it then stays until they close it.
    <span className="analyse-etat" onPointerDownCapture={() => (openedByItself.current = false)}>
      {text && (
        <button
          ref={buttonRef}
          className={`analyse-bouton${run.status === 'error' ? ' erreur' : ''}`}
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
  const models = useModels();
  if (run.status !== 'running') return null;
  const toDownload = models.filter((m) => !m.cached);
  const showSources = run.step === 'download' || toDownload.length > 0;
  return (
    <div className="analyse-note">
      <div className="analyse-progres" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(fraction)}>
        <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, fraction))})` }} />
      </div>
      <p className="analyse-etape">
        {t(`analysis.step.${run.step}`)}
        {run.step === 'download' && download && ` · ${t('analysis.downloaded', { loaded: megabytes(download.loaded), total: megabytes(download.total) })}`}
      </p>
      {showSources && models.length > 0 && <ModelSources models={models} />}
    </div>
  );
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
  useEffect(() => {
    let alive = true;
    getAnalyzer()
      .models()
      .then((m) => alive && setModels(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [step]);
  return models;
}

export function AnalysisPanel({ ref }: { ref: Ref<HTMLDivElement> }) {
  const status = useApp(selectAnalysisStatus);
  const run = useApp((s) => s.analysisRun);
  return (
    <div ref={ref} className="fenetre panneau-analyse" role="dialog" aria-label={t('analysis.title')}>
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
