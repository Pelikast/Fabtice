// Separation of the instruments, on screen (lot 3):
//   - `StemChips`: the instruments to separate, as in the mockup's new-piece
//     dialog (the hues of DESIGN.md), only those the tool in use provides;
//   - `SeparationEntry`: the quiet button under the track headers
//     (« Séparer les instruments », or « Instruments » once separated);
//   - `SeparationStatus`: « Séparation · 34 % » next to the title while it runs;
//   - `SeparationPanel`: the tool, the honest estimate, the first-download
//     notice (source, size, known licence), the instruments wanted,
//     progress and remaining time, the processor notice, cancel; once
//     separated, « Revenir au morceau entier » / « Revoir les instruments »,
//     the room it takes on the device and « Libérer la place ».
// Ink and brass only: the ember stays on the play button and the playhead.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { t } from '../i18n';
import { MAIN_STEMS, STEM_ROLE, type StemId } from '../model/separation';
import { getSeparator } from '../separation';
import { useSeparationProgress } from '../separation/progress';
import { cancelSeparation, freeSeparatedTracks, separationUsage, startSeparation, type SeparationUsage } from '../separation/runner';
import { estimateSentence, formatSize, formatWait, useSeparationChoice } from '../separation/useChoice';
import type { ModelChoice } from '../separation/types';
import { closePanel, togglePanel } from '../store/actions';
import { showInstruments, showWholePiece, stemName } from '../store/separationActions';
import { useApp } from '../store/store';
import { useFitPanel } from '../ui/useFitPanel';
import { useOutsideClose } from '../ui/useOutsideClose';

const percent = (f: number) => Math.round(Math.min(1, Math.max(0, f)) * 100);

/** The instruments a tool offers, in the mockup's order (« Autres » last). */
export function offeredStems(choice: ModelChoice | null): StemId[] {
  if (!choice) return [];
  return MAIN_STEMS.filter((s) => choice.model.stems.includes(s));
}

export function StemChips({ stems, pressed, onToggle, label }: { stems: StemId[]; pressed: readonly StemId[]; onToggle: (s: StemId) => void; label: string }) {
  return (
    <div className="stems" role="group" aria-label={label}>
      {stems.map((s) => (
        <button
          key={s}
          type="button"
          className="stem"
          data-stem={s}
          aria-pressed={pressed.includes(s)}
          style={{ '--teinte': `var(--${STEM_ROLE[s]})` } as CSSProperties}
          onClick={() => onToggle(s)}
        >
          {stemName(s)}
        </button>
      ))}
    </div>
  );
}

/** Under the track headers: the way in, at any time after the import. */
export function SeparationEntry() {
  const hasProject = useApp((s) => s.project !== null);
  const separated = useApp((s) => s.separation.result !== null);
  const open = useApp((s) => s.ui.panel === 'separation');
  if (!hasProject) return null;
  return (
    <div className="pistes-pied">
      <button
        className="separer"
        data-testid="separer"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => togglePanel('separation')}
      >
        <span className="long">{separated ? t('separation.instrumentsEntry') : t('separation.entry')}</span>
        <span className="court">{separated ? t('separation.instrumentsEntry') : t('separation.entryShort')}</span>
      </button>
    </div>
  );
}

/** Next to the title while a separation runs (or failed): opens the panel. */
export function SeparationStatus() {
  const run = useApp((s) => s.separationRun);
  const fraction = useSeparationProgress((p) => percent(p.fraction));
  if (run.status === 'idle') return null;
  return (
    <button
      className="analyse-bouton separation-bouton"
      data-testid="separation-etat"
      aria-haspopup="dialog"
      onClick={() => togglePanel('separation')}
    >
      {run.status === 'running' ? t('separation.status', { n: fraction }) : t('separation.statusError')}
    </button>
  );
}

/** The panel lives at the app's root (one for both entries); closed by Escape, a click outside, or the cross. */
export function SeparationPanelHost() {
  const open = useApp((s) => s.ui.panel === 'separation');
  const panelRef = useRef<HTMLDivElement>(null);
  const refs = useRef([panelRef]).current;
  useOutsideClose(
    open,
    refs,
    useCallback(() => closePanel(), []),
    '[data-testid="separer"], [data-testid="separation-etat"], [data-separation-entry]',
  );
  return open ? <SeparationPanel ref={panelRef} /> : null;
}

function SeparationPanel({ ref }: { ref: Ref<HTMLDivElement> }) {
  const fitRef = useFitPanel(ref);
  const run = useApp((s) => s.separationRun);
  const result = useApp((s) => s.separation.result);
  return (
    <div ref={fitRef} className="fenetre panneau-separation" role="dialog" aria-label={t('separation.title')} data-testid="panneau-separation">
      <h2 className="libelle">{t('separation.title')}</h2>
      {run.status === 'running' ? <Running /> : result ? <Done /> : <Offer />}
      {getSeparator().kind === 'mock' && <p className="panneau-note discret">{t('separation.mockNote')}</p>}
    </div>
  );
}

/** Not separated yet (or failed): tool, estimate, licence, instruments, « Séparer ». */
function Offer() {
  const run = useApp((s) => s.separationRun);
  const duration = useApp((s) => s.project?.duration ?? 0);
  const choice = useSeparationChoice(true);
  const [wanted, setWanted] = useState<StemId[]>([]);
  const [cached, setCached] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    if (choice) void getSeparator().isCached(choice.model).then((c) => alive && setCached(c));
    return () => {
      alive = false;
    };
  }, [choice]);
  if (!choice) return <p className="panneau-note">{t('separation.error.unknown-model')}</p>;
  const toggle = (s: StemId) => setWanted((w) => (w.includes(s) ? w.filter((x) => x !== s) : [...w, s]));
  return (
    <>
      {run.status === 'error' && (
        <p className="panneau-avis" role="alert">
          {t(`separation.error.${run.code}`)}
        </p>
      )}
      <p className="panneau-note">{t('separation.intro')}</p>
      <ToolLine choice={choice} />
      <p className="panneau-note" data-testid="estimation">
        {estimateSentence(choice, duration)}
      </p>
      {cached === false && <FirstDownload choice={choice} />}
      <h3 className="libelle">{t('separation.choose')}</h3>
      <StemChips stems={offeredStems(choice)} pressed={wanted} onToggle={toggle} label={t('separation.choose')} />
      <p className="panneau-note discret">{t('separation.chooseNote')}</p>
      <button className="bouton-cadre" data-testid="lancer-separation" onClick={() => void startSeparation({ stems: wanted })}>
        {run.status === 'error' ? t('separation.retry') : t('separation.start')}
      </button>
    </>
  );
}

function ToolLine({ choice }: { choice: ModelChoice }) {
  return <p className="panneau-note">{t('separation.tool', { name: choice.model.name, label: choice.model.label.toLowerCase() })}</p>;
}

/** Shown before the first download: what, from where, how big, under which licence. */
export function FirstDownload({ choice }: { choice: ModelChoice }) {
  const m = choice.model;
  return (
    <div className="separation-source" data-testid="premier-telechargement">
      <p>{t('separation.firstDownload', { size: formatSize(m.file.bytes), host: m.file.host })}</p>
      <p>
        {t('separation.source')}{' '}
        <a className="lien" href={m.sourcePage} target="_blank" rel="noreferrer noopener">
          {m.sourcePage.replace(/^https:\/\//, '')}
        </a>
      </p>
      <p>{t('separation.licence', { licence: m.licence })}</p>
      {m.licenceUnclear && <p>{t('separation.licenceUnclear')}</p>}
    </div>
  );
}

function Running() {
  const run = useApp((s) => s.separationRun);
  const fraction = useSeparationProgress((p) => p.fraction);
  const remaining = useSeparationProgress((p) => (p.remainingSeconds === null ? null : Math.round(p.remainingSeconds / 10) * 10));
  const downloadLoaded = useSeparationProgress((p) => (p.download ? Math.round(p.download.loaded / 1e6) : null));
  const downloadTotal = useSeparationProgress((p) => p.download?.total ?? null);
  const choice = useSeparationChoice();
  if (run.status !== 'running') return null;
  return (
    <div className="separation-cours" role="status" aria-live="polite">
      {choice && <ToolLine choice={choice} />}
      <div className="analyse-progres" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(fraction)}>
        <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, fraction))})` }} />
      </div>
      <p className="analyse-etape">
        {t(`separation.step.${run.step}`)}
        {run.step === 'download' && downloadLoaded !== null && downloadTotal !== null && ` · ${t('separation.downloaded', { loaded: formatSize(downloadLoaded * 1e6), total: formatSize(downloadTotal) })}`}
        {run.step === 'separate' &&
          ` · ${remaining === null ? t('separation.remainingUnknown') : remaining < 60 ? t('separation.remainingShort') : t('separation.remaining', { time: formatWait(remaining) })}`}
      </p>
      {run.step === 'download' && choice && <FirstDownload choice={choice} />}
      {run.backend && !run.fellBack && <p className="panneau-note discret">{t(`separation.backend.${run.backend}`)}</p>}
      {run.fellBack && (
        <p className="panneau-avis" data-testid="repli">
          {t('separation.fallback')}
        </p>
      )}
      <button className="bouton-cadre" onClick={cancelSeparation}>
        {t('separation.cancel')}
      </button>
    </div>
  );
}

function Done() {
  const result = useApp((s) => s.separation.result)!;
  const showing = useApp((s) => s.separation.showing);
  const run = useApp((s) => s.separationRun);
  const [confirming, setConfirming] = useState(false);
  const [usage, setUsage] = useState<SeparationUsage | null>(null);
  const [again, setAgain] = useState(false);
  useEffect(() => {
    let alive = true;
    void separationUsage().then((u) => alive && setUsage(u));
    return () => {
      alive = false;
    };
  }, [result.id]);
  if (again) return <Offer />;
  const time = formatWait(result.computeSeconds);
  return (
    <>
      {run.status === 'error' && (
        <p className="panneau-avis" role="alert">
          {t(`separation.error.${run.code}`)}
        </p>
      )}
      <p className="panneau-note">{t(result.fellBack ? 'separation.doneFallback' : 'separation.done', { name: result.modelName, time })}</p>
      {showing === 'whole' && <p className="panneau-note discret">{t('separation.wholeNote')}</p>}
      <button className="bouton-cadre" data-testid="bascule-morceau" onClick={() => void (showing === 'instruments' ? showWholePiece() : showInstruments())}>
        {showing === 'instruments' ? t('separation.showWhole') : t('separation.showInstruments')}
      </button>
      <div className="separation-place" data-testid="place">
        {usage && (
          <p className="panneau-note discret">
            {usage.instruments ? t('separation.storage', { size: formatSize(usage.instruments) }) : t('separation.storageNotKept')}
            {usage.tools && usage.tools.bytes > 0 && ` ${t('separation.storageTools', { size: formatSize(usage.tools.bytes) })}`}
          </p>
        )}
        {confirming ? (
          <div className="reprise-confirme" role="group" aria-label={t('separation.freeAsk')}>
            <p className="panneau-note">{t('separation.freeAsk')}</p>
            <div className="reprise-actions">
              <button
                className="bouton-cadre"
                data-testid="liberer-oui"
                onClick={() => {
                  setConfirming(false);
                  void freeSeparatedTracks();
                }}
              >
                {t('separation.freeYes')}
              </button>
              <button className="bouton-cadre" autoFocus onClick={() => setConfirming(false)}>
                {t('separation.freeNo')}
              </button>
            </div>
          </div>
        ) : (
          <div className="separation-actions">
            <button className="lien discret" data-testid="liberer" onClick={() => setConfirming(true)}>
              {t('separation.free')}
            </button>
            <button className="lien discret" onClick={() => setAgain(true)}>
              {t('separation.again')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
