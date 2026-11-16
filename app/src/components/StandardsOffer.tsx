// The offer to download the chord charts of standards, in two places that share one design:
//   - `StandardsCard`: a quiet card in the opening dialog, only while nothing is on the device and the
//     user has neither declined nor postponed it (or while a download runs, or its result is shown);
//   - `StandardsDialog`: the same content as a window of its own, reached from « Réglages → Avancé »,
//     where one can also see what is kept, import a file, or remove everything.
// Ink and paper only: the ember stays on the play button, brass marks the notes (DESIGN.md).

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { t } from '../i18n';
import { getDesktopBridge } from '../platform/desktopBridge';
import { getCollectionList, isDownloadable, readablePages } from '../standards/library';
import type { CollectionSpec } from '../standards/collections';
import {
  cancelStandardsDownload,
  closeStandardsPanel,
  declineOffer,
  dismissStandardsResult,
  forgetStandards,
  importStandards,
  offerVisible,
  openStandardsPanel,
  postponeOffer,
  startStandardsDownload,
  tickedCollections,
  toggleTicked,
  useStandards,
} from '../standards/offer';
import { CloseIcon } from '../ui/icons';

const formatCount = (n: number): string => new Intl.NumberFormat(t('meta.locale')).format(n);
const tunesText = (n: number): string => t(n === 1 ? 'standards.tunes.one' : 'standards.tunes.other', { n: formatCount(n) });

/** Collections to show: the recommended ones, and the others behind a disclosure. */
function useCollections(): { main: CollectionSpec[]; more: CollectionSpec[] } {
  useStandards((s) => s.listVersion);
  const all = getCollectionList().list.collections;
  return { main: all.filter((c) => c.recommended), more: all.filter((c) => !c.recommended) };
}

function hostOf(c: CollectionSpec): string | null {
  return readablePages(c)[0]?.host ?? null;
}

function CollectionRow({ spec, ticked, locked }: { spec: CollectionSpec; ticked: boolean; locked: boolean }) {
  const downloadable = isDownloadable(spec);
  const host = hostOf(spec);
  return (
    <li className="recueil" data-id={spec.id} data-downloadable={downloadable}>
      <label>
        <input type="checkbox" checked={ticked && downloadable} disabled={!downloadable || locked} onChange={() => toggleTicked(spec.id)} />
        <span className="recueil-nom">{spec.name}</span>
        <span className="recueil-detail">
          {downloadable ? [spec.tunes !== null ? tunesText(spec.tunes) : t('standards.tunesUnknown'), t('standards.from', { host: host ?? '' })].join(' · ') : t('standards.webFileOnly')}
        </span>
      </label>
    </li>
  );
}

function Collections({ locked }: { locked: boolean }) {
  const { main, more } = useCollections();
  const choice = useStandards((s) => s.ticked);
  useStandards((s) => s.listVersion);
  const ticked = tickedCollections({ ticked: choice });
  const [showMore, setShowMore] = useState(false);
  const anyUnavailable = [...main, ...more].some((c) => !isDownloadable(c));
  return (
    <>
      <ul className="recueils" aria-label={t('standards.collections')}>
        {main.map((c) => (
          <CollectionRow key={c.id} spec={c} ticked={ticked.includes(c.id)} locked={locked} />
        ))}
        {showMore && more.map((c) => <CollectionRow key={c.id} spec={c} ticked={ticked.includes(c.id)} locked={locked} />)}
      </ul>
      {more.length > 0 && (
        <button className="lien discret recueils-plus" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}>
          {showMore ? t('standards.moreHide') : t('standards.moreShow', { n: more.length })}
        </button>
      )}
      {anyUnavailable && getDesktopBridge() === null && <p className="stems-note">{t('standards.webNote')}</p>}
    </>
  );
}

/** « Importer un fichier… » and the sentence that says where such a file comes from. */
function FileImport({ showWhere }: { showWhere: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const note = useStandards((s) => s.importNote);
  return (
    <div className="standards-fichier">
      <input
        ref={ref}
        type="file"
        accept=".html,.htm,.txt,text/html,text/plain"
        hidden
        data-testid="standards-fichier"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importStandards(file);
        }}
      />
      <button className="lien" onClick={() => ref.current?.click()}>
        {t('standards.importFile')}
      </button>
      {showWhere && <p className="stems-note">{t('standards.importWhere')}</p>}
      {note && (
        <p className="stems-note standards-note" role="status">
          {note.kind === 'ok' ? t(note.tunes === 1 ? 'standards.importOk.one' : 'standards.importOk.other', { n: formatCount(note.tunes) }) : t(`standards.importError.${note.reason}`)}
        </p>
      )}
    </div>
  );
}

function Running({ compact = false }: { compact?: boolean }) {
  const progress = useStandards((s) => (s.run.kind === 'running' ? s.run.progress : null));
  if (!progress) return null;
  return (
    <div className="import-etat" role="status" aria-live="polite" data-testid="standards-encours">
      <div className="phase">
        <span>{t('standards.running')}</span>
        <span>{Math.round(progress.fraction * 100)} %</span>
      </div>
      <div className="jauge" style={{ '--avance': progress.fraction } as CSSProperties}>
        <span />
      </div>
      {!compact && <ul className="recueils recueils-etat">
        {progress.rows.map((r) => (
          <li key={r.id} className="recueil" data-state={r.state}>
            <span className="recueil-nom">{r.name}</span>
            <span className="recueil-detail">
              {r.state === 'waiting' && t('standards.rowWaiting')}
              {r.state === 'fetching' && t('standards.rowFetching', { host: r.host ?? '' })}
              {r.state === 'kept' && tunesText(r.tunes)}
              {r.state === 'failed' && t('standards.rowFailed')}
              {r.state === 'cancelled' && t('standards.rowCancelled')}
            </span>
          </li>
        ))}
      </ul>}
      {compact ? (
        <button className="lien discret" onClick={cancelStandardsDownload}>
          {t('standards.cancel')}
        </button>
      ) : (
        <div className="import-actions">
          <button className="bouton-cadre bouton-standards" onClick={cancelStandardsDownload}>
            {t('standards.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}

/** The honest result: what is kept, what could not be had (named plainly), and the file import as the alternative. */
function Result({ compact = false }: { compact?: boolean }) {
  const run = useStandards((s) => s.run);
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => doneRef.current?.focus({ preventScroll: true }), []);
  if (run.kind !== 'done') return null;
  const { result, status } = run;
  const failed = result.outcomes.filter((o) => o.state === 'failed');
  // Recommended collections this device cannot download at all (the web app) and that are not kept: named too.
  const fileOnly = getCollectionList().list.collections.filter((c) => c.recommended && !isDownloadable(c) && !status.collections.some((k) => k.id === c.id));
  return (
    <div className="standards-resultat" role="status" aria-live="polite" data-testid="standards-resultat">
      <p className="standards-bilan">
        {result.cancelled && status.total === 0
          ? t('standards.resultCancelled')
          : status.total > 0
            ? t(status.total === 1 ? 'standards.resultKept.one' : 'standards.resultKept.other', { n: formatCount(status.total) })
            : t('standards.resultNone')}
      </p>
      {!status.persistent && status.total > 0 && <p className="stems-note">{t('standards.memoryOnly')}</p>}
      {compact && failed.length + fileOnly.length > 0 && <p className="stems-note">{t('standards.seeSettings')}</p>}
      {!compact && failed.length + fileOnly.length > 0 && (
        <>
          <p className="stems-note">{t('standards.failedLead')}</p>
          <ul className="standards-echecs">
            {failed.map((o) => (
              <li key={o.id} data-id={o.id}>
                {t(o.reason === 'file-needed' ? 'standards.failedFile' : 'standards.failedNotFound', { name: o.name })}
              </li>
            ))}
            {fileOnly
              .filter((c) => !failed.some((o) => o.id === c.id))
              .map((c) => (
                <li key={c.id} data-id={c.id}>
                  {t('standards.failedFile', { name: c.name })}
                </li>
              ))}
          </ul>
          <FileImport showWhere />
        </>
      )}
      <div className="import-actions">
        <button ref={doneRef} className="bouton-cadre bouton-standards" onClick={dismissStandardsResult}>
          {t('standards.done')}
        </button>
      </div>
    </div>
  );
}

function Actions({ children }: { children?: React.ReactNode }) {
  const count = useStandards((s) => tickedCollections(s).length);
  return (
    <div className="standards-actions">
      <button className="bouton-cadre bouton-standards" data-testid="standards-telecharger" disabled={count === 0} onClick={() => void startStandardsDownload()}>
        {t('standards.download')}
      </button>
      {children}
    </div>
  );
}

/** The card of the opening dialog: compact (one sentence, one button); the detail is in the settings window. */
export function StandardsCard() {
  const visible = useStandards((s) => offerVisible(s));
  const kind = useStandards((s) => s.run.kind);
  if (!visible) return null;
  return (
    <section className="standards standards-compact" aria-label={t('standards.title')} data-testid="standards-offre">
      {kind === 'running' ? (
        <Running compact />
      ) : kind === 'done' ? (
        <Result compact />
      ) : (
        <>
          <p className="standards-phrase">{t('standards.offer')}</p>
          <div className="standards-actions">
            <button className="bouton-cadre bouton-standards" data-testid="standards-telecharger" onClick={() => void startStandardsDownload()}>
              {t('standards.download')}
            </button>
            <button className="lien discret" onClick={postponeOffer}>
              {t('standards.later')}
            </button>
            <button className="lien discret" onClick={declineOffer}>
              {t('standards.never')}
            </button>
            <button className="lien discret" data-testid="standards-choisir" onClick={openStandardsPanel}>
              {t('standards.choose')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** What is on the device, for the settings window. */
function Kept() {
  const status = useStandards((s) => s.status);
  const [confirming, setConfirming] = useState(false);
  if (!status || status.total === 0) return null;
  const date = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(t('meta.locale'), { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  };
  return (
    <section className="standards-gardees" data-testid="standards-gardees">
      <h3>{t('standards.keptTitle')}</h3>
      <ul className="recueils recueils-etat">
        {status.collections.map((c) => (
          <li key={c.id} className="recueil" data-id={c.id}>
            <span className="recueil-nom">{c.name}</span>
            <span className="recueil-detail">{[tunesText(c.tunes), c.fromFile ? t('standards.keptFile') : date(c.date)].filter(Boolean).join(' · ')}</span>
          </li>
        ))}
      </ul>
      {!status.persistent && <p className="stems-note">{t('standards.memoryOnly')}</p>}
      {confirming ? (
        <div className="reprise-confirme" role="group" aria-label={t('standards.removeAsk')}>
          <p className="stems-note">{t('standards.removeAsk')}</p>
          <div className="reprise-actions">
            <button
              className="bouton-cadre bouton-standards"
              onClick={() => {
                setConfirming(false);
                void forgetStandards();
              }}
            >
              {t('standards.removeYes')}
            </button>
            <button className="bouton-cadre bouton-standards" autoFocus onClick={() => setConfirming(false)}>
              {t('standards.removeNo')}
            </button>
          </div>
        </div>
      ) : (
        <button className="lien discret" onClick={() => setConfirming(true)}>
          {t('standards.remove')}
        </button>
      )}
    </section>
  );
}

/** The window opened from « Réglages → Avancé ». */
export function StandardsDialog() {
  const open = useStandards((s) => s.panelOpen);
  const kind = useStandards((s) => s.run.kind);
  const hasKept = useStandards((s) => (s.status?.total ?? 0) > 0);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeStandardsPanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  // Not in the page at all while closed: the opening dialog stays the only `.voile` of the page.
  if (!open) return null;
  return (
    <div
      className="voile-standards"
      role="dialog"
      aria-modal="true"
      aria-labelledby="standards-fenetre-titre"
      data-testid="standards-fenetre"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeStandardsPanel();
      }}
    >
      <div className="accueil">
        <div className="accueil-entete">
          <h2 id="standards-fenetre-titre">{t('standards.title')}</h2>
          <button className="fermer" aria-label={t('standards.close')} onClick={closeStandardsPanel}>
            <CloseIcon />
          </button>
        </div>
        {kind === 'running' ? (
          <Running />
        ) : kind === 'done' ? (
          <Result />
        ) : (
          <>
            {hasKept ? <Kept /> : null}
            <p className={hasKept ? 'standards-suite' : undefined}>{t(hasKept ? 'standards.manageMore' : 'standards.offer')}</p>
            <Collections locked={false} />
            <Actions />
            <FileImport showWhere />
            <p className="stems-note">{t('standards.keptOnDevice')}</p>
          </>
        )}
      </div>
    </div>
  );
}

/** The line in « Réglages → Avancé »: what is kept, and the way into the window. */
export function StandardsSettingsEntry({ onOpen }: { onOpen: () => void }) {
  const total = useStandards((s) => s.status?.total ?? 0);
  return (
    <div className="option option-colonne">
      <span>{t('standards.settingsEntry')}</span>
      <small data-testid="standards-etat">{total === 0 ? t('standards.settingsNone') : t(total === 1 ? 'standards.settingsSome.one' : 'standards.settingsSome.other', { n: formatCount(total) })}</small>
      <button className="lien discret entree-standards" data-testid="standards-gerer" onClick={onOpen}>
        {t('standards.settingsManage')}
      </button>
    </div>
  );
}
