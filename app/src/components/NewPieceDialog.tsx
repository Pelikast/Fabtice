import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { formatAmount } from '../import/amount';
import { cancelImport, isCancellablePhase, startFileImport, startLinkImport, startToolUpdate } from '../import/controller';
import { chooseProjectFile } from '../project/choose';
import { FILE_ACCEPT } from '../import/formats';
import { t } from '../i18n';
import { getDesktopBridge, type RecentProject } from '../platform/desktopBridge';
import { forgetKeptPiece, reopenKeptPiece } from '../storage';
import { closeNewPiece, setImportStatus } from '../store/actions';
import { useApp, type ImportStatus, type ReopenOffer } from '../store/store';
import { CloseIcon } from '../ui/icons';
import { estimateWait, useSeparationChoice } from '../separation/useChoice';
import { isSeparateTicked, reconcileStems, setSeparateOnImport } from '../separation/importChoice';
import type { StemId } from '../model/separation';
import { toggleImportStem } from '../store/separationActions';
import { offeredStems, StemChips } from './SeparationPanel';
import { useMessageStep } from './StandardsMessage';
import { CheckRow } from './settings/parts';

/**
 * « Nouveau projet »: a link (Mac app only) or an audio file. Shown over the
 * empty shell at launch (the whole opening screen: a link, a file, a `.fab`
 * project, the recent ones); opened from the menu « Nouveau projet ▸ » it
 * shows only the way asked for (`ui.newPieceFrom`). While an import runs (or
 * the kept piece is reopened) it shows its progress, then its error if it
 * fails. In the Mac app it also proposes, discreetly, a newer version of the
 * import tool. « Séparer les instruments » (unticked by default) is under
 * the way in; the case « Alléger le travail pour l'appareil » (C2, stage 6)
 * takes its place right after it (`ImportStems`).
 */
export function NewPieceDialog() {
  const open = useApp((s) => s.ui.newPieceOpen);
  const status = useApp((s) => s.ui.import);
  const hasProject = useApp((s) => s.project !== null);
  const desktop = useMemo(() => getDesktopBridge() !== null, []);
  const canClose = hasProject && status.kind !== 'busy';
  // The message of the chord charts comes over this window: this one waits, out of reach, behind it.
  const behindMessage = useMessageStep() !== null;

  return (
    <div
      className={`voile voile-projet${open ? ' ouverte' : ''}`}
      inert={behindMessage}
      role="dialog"
      aria-modal="true"
      aria-labelledby="accueil-titre"
      aria-hidden={!open}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeNewPiece();
      }}
    >
      <div className="accueil">
        <div className="accueil-entete">
          <h2 id="accueil-titre">{t('new.title')}</h2>
          {canClose && (
            <button className="fermer" aria-label={t('new.close')} onClick={closeNewPiece}>
              <CloseIcon />
            </button>
          )}
        </div>
        {status.kind === 'busy' ? (
          <ImportProgressView status={status} />
        ) : status.kind === 'error' ? (
          <ImportErrorView status={status} />
        ) : (
          <Choices open={open} desktop={desktop} />
        )}
      </div>
    </div>
  );
}

/**
 * A piece is kept on the device but was not opened: « Rouvrir » tries again,
 * « Oublier ce morceau » (discreet, and asked twice) deletes it.
 */
function ReopenOfferCard({ offer, withLine }: { offer: ReopenOffer; withLine: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const title = offer.title;
  return (
    <div className="reprise">
      {withLine && <p>{title ? t('restore.keptLine', { title }) : t('restore.keptLineUnknown')}</p>}
      {confirming ? (
        <div className="reprise-confirme" role="group" aria-label={t('restore.forgetAsk')}>
          <p>{t('restore.forgetAsk')}</p>
          <div className="reprise-actions">
            <button
              className="bouton-cadre"
              onClick={() => {
                setConfirming(false);
                void forgetKeptPiece();
              }}
            >
              {t('restore.forgetYes')}
            </button>
            <button className="plein encre" autoFocus onClick={() => setConfirming(false)}>
              {t('restore.forgetNo')}
            </button>
          </div>
        </div>
      ) : (
        <div className="reprise-actions">
          <button className="plein encre" onClick={() => void reopenKeptPiece()}>
            {title ? t('restore.reopen', { title }) : t('restore.reopenUnknown')}
          </button>
          <button className="lien discret" onClick={() => setConfirming(true)}>
            {t('restore.forget')}
          </button>
        </div>
      )}
    </div>
  );
}

function Choices({ open, desktop }: { open: boolean; desktop: boolean }) {
  const notice = useApp((s) => s.ui.notice);
  const reopenOffer = useApp((s) => s.ui.reopenOffer);
  const toolUpdate = useApp((s) => s.ui.toolUpdate);
  // « Nouveau projet ▸ » (C6): which entry asked; null for the whole opening screen.
  const from = useApp((s) => s.ui.newPieceFrom);
  const [link, setLink] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  // Mac app: the link field takes the focus, ready for a paste; « À partir d'un fichier audio »: the file button.
  const linkRef = useRef<HTMLInputElement>(null);
  const fileButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    if (from === 'file' || (!desktop && from === 'link')) fileButtonRef.current?.focus({ preventScroll: true });
    else if (desktop) linkRef.current?.focus({ preventScroll: true });
  }, [open, from, desktop]);

  const chooseFile = () => fileRef.current?.click();
  // Lot 4: a `.fab` project, offered calmly after the main way in. Its file picker is made on the
  // spot (`chooseProjectFile`): the dialog keeps a single file field, the audio one.
  const projectLine = (
    <div className="ouvrir-projet">
      {t('new.openProjectLead')}{' '}
      <button className="lien" data-testid="ouvrir-projet" onClick={chooseProjectFile}>
        {t('new.openProject')}
      </button>
    </div>
  );
  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept={FILE_ACCEPT}
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) void startFileImport(file);
      }}
    />
  );

  const noticeLine = (
    <>
      {notice && (
        <p className="accueil-avis" role="status">
          {notice}
        </p>
      )}
      {reopenOffer && <ReopenOfferCard offer={reopenOffer} withLine={!notice} />}
    </>
  );

  const noticeAndLead = (lead: string) => (
    <>
      {noticeLine}
      <p>{lead}</p>
    </>
  );
  const formatsLine = (
    <div className="pied">
      <span>{t('new.formats')}</span>
      <span>{t('new.dropHint')}</span>
    </div>
  );
  const updateOffer = toolUpdate && (
    <div className="mise-a-jour">
      <span>{t('new.updateOffer')}</span>{' '}
      <button className="lien" onClick={() => void startToolUpdate()}>
        {t('new.updateAction')}
      </button>
    </div>
  );
  const linkForm = (
    <form
      className="champ"
      onSubmit={(e) => {
        e.preventDefault();
        if (link.trim()) void startLinkImport(link.trim());
      }}
    >
      <input
        ref={linkRef}
        type="url"
        inputMode="url"
        placeholder={t('new.linkPlaceholder')}
        aria-label={t('new.linkLabel')}
        value={link}
        onChange={(e) => setLink(e.target.value)}
      />
      <button className="plein encre" type="submit">
        {t('new.import')}
      </button>
    </form>
  );
  const fileButton = (
    <button ref={fileButtonRef} className="plein encre" onClick={chooseFile}>
      {t('new.chooseFileButton')}
    </button>
  );

  // « Nouveau projet ▸ À partir d'un lien YouTube »: only the link (Mac app); on the web, the sentence that sends to the Mac app.
  if (from === 'link') {
    if (!desktop) {
      return (
        <>
          {noticeLine}
          <p className="accueil-avis" role="status" data-testid="lien-app-mac">
            {t('menu.linkOnMac')}
          </p>
        </>
      );
    }
    return (
      <>
        {noticeAndLead(t('new.leadLink'))}
        {linkForm}
        {updateOffer}
        <ImportStems />
      </>
    );
  }
  // « Nouveau projet ▸ À partir d'un fichier audio »: only the file.
  if (from === 'file') {
    return (
      <>
        {noticeAndLead(t('new.leadFile'))}
        {fileButton}
        {fileInput}
        <ImportStems />
        {formatsLine}
      </>
    );
  }
  // The whole opening screen: a project of the app (`.fab`, recent), a link (Mac app), a file.
  if (desktop) {
    return (
      <>
        {noticeAndLead(t('new.leadLink'))}
        {linkForm}
        <div className="sinon">
          {t('new.or')}{' '}
          <button ref={fileButtonRef} className="lien" onClick={chooseFile}>
            {t('new.chooseFile')}
          </button>
        </div>
        {fileInput}
        {projectLine}
        <RecentProjects open={open} />
        {updateOffer}
        <ImportStems />
        {formatsLine}
      </>
    );
  }
  return (
    <>
      {noticeAndLead(t('new.leadFile'))}
      {fileButton}
      {fileInput}
      {projectLine}
      <ImportStems />
      {formatsLine}
    </>
  );
}

/** A typical piece, for the estimate shown before its length is known. */
const TYPICAL_PIECE_SECONDS = 240;

/**
 * « Séparer les instruments », unticked by default. Ticked, it shows « Instruments à séparer » with every
 * instrument the tool in use provides selected; a click on an instrument unselects it (none left is the same as
 * unticked). The selected instruments are separated once the piece has been imported and can play, in the
 * background; the estimate is honest (this device, a typical piece).
 *
 * Stage 6 (C2) adds « Alléger le travail pour l'appareil » here, right after this box.
 */
function ImportStems() {
  const stems = useApp((s) => s.ui.importStems);
  const ticked = isSeparateTicked(stems);
  // The graphics chip is asked only once the box is ticked (the estimate depends on it).
  const choice = useSeparationChoice(ticked);
  const offered = offeredStems(choice);
  const offeredKey = offered.join(',');
  // The tool in use may change once the device has been probed: the choice follows what it provides.
  // (The first time, nothing has changed: the box is shown again after an import as it was left.)
  const before = useRef<StemId[] | null>(null);
  useEffect(() => {
    const next = reconcileStems(stems, before.current ?? offered, offered);
    before.current = offered;
    if (next.length !== stems.length || next.some((s, i) => s !== stems[i])) setSeparateOnImport(next.length > 0, next);
    // Only when the tool's instruments change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offeredKey]);
  return (
    <section className="stems-choix" aria-label={t('new.separate')}>
      <CheckRow
        checked={ticked}
        onChange={(on) => setSeparateOnImport(on, offered)}
        label={t('new.separate')}
        note={choice ? t('new.separateNote') : t('new.stemsNone')}
        disabled={!choice}
        testId="separer-case"
      />
      {ticked && choice && (
        <div className="stems-liste" data-testid="stems-liste">
          <h3 id="stems-titre">{t('new.stemsTitle')}</h3>
          <StemChips stems={offered} pressed={stems} onToggle={toggleImportStem} label={t('new.stemsTitle')} />
          <p className="stems-note" data-testid="estimation-import">
            {t('new.stemsEstimate', { time: estimateWait(choice, TYPICAL_PIECE_SECONDS) })} {stems.length < offered.length && t('new.stemsOthers')}
          </p>
        </div>
      )}
    </section>
  );
}

/** Steps where the Mac app works and nothing can stop it. */
const WAITS_FOR_MAC_APP = new Set(['installing', 'updating', 'fetching-info', 'starting-download', 'downloading']);
/** Steps that can stay silent for a long time on a slow Mac: after this long without news, one reassuring sentence. */
const MAY_BE_SLOW = new Set(['fetching-info', 'starting-download', 'downloading']);
export const QUIET_NOTE_DELAY_MS = 10_000;

/** True once `delayMs` have passed without `key` changing (any news resets it), while `enabled`. */
function useQuiet(key: string, enabled: boolean, delayMs: number): boolean {
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    setQuiet(false);
    if (!enabled) return;
    const timer = setTimeout(() => setQuiet(true), delayMs);
    return () => clearTimeout(timer);
  }, [key, enabled, delayMs]);
  return quiet;
}

function ImportProgressView({ status }: { status: Extract<ImportStatus, { kind: 'busy' }> }) {
  const { phase, fraction, title, step, received } = status.progress;
  const restoring = phase === 'restoring';
  const opening = phase === 'opening';
  // Once the tracks are being put in place, the open piece is already replaced: nothing to cancel any more.
  const cancellable = isCancellablePhase(phase) && !(opening && step === 'preparing');
  const quiet = useQuiet(`${phase}|${step ?? ''}|${fraction ?? ''}|${received ?? ''}`, MAY_BE_SLOW.has(phase), QUIET_NOTE_DELAY_MS);
  // A percentage only when there is something real to measure; else the amount received, else nothing.
  const figure = fraction !== null ? t('import.percent', { n: Math.round(fraction * 100) }) : received !== undefined ? t('import.received', { size: formatAmount(received) }) : '';
  return (
    <div className="import-etat" role="status" aria-live="polite">
      {title && !restoring && !opening && <div className="import-titre">{title}</div>}
      <div className="phase">
        <span>{restoring ? t('import.restoring', { title: title ?? '' }) : opening ? t('import.opening', { title: title ?? '' }) : t(`import.${phase}`)}</span>
        <span>{figure}</span>
      </div>
      <div className={`jauge${fraction === null ? ' indeterminee' : ''}`} style={{ '--avance': fraction ?? 0 } as CSSProperties}>
        <span />
      </div>
      {restoring && step && <p className="import-note">{t(`restore.step.${step}`)}</p>}
      {opening && step && <p className="import-note">{t(`project.step.${step}`)}</p>}
      {phase === 'installing' && <p className="import-note">{t('import.installingNote')}</p>}
      {quiet && <p className="import-note">{t('import.quietNote')}</p>}
      {cancellable ? (
        <div className="import-actions">
          <button className="bouton-cadre" onClick={cancelImport}>
            {t('import.cancel')}
          </button>
        </div>
      ) : (
        WAITS_FOR_MAC_APP.has(phase) && <p className="import-note">{t('import.noCancel')}</p>
      )}
    </div>
  );
}

function ImportErrorView({ status }: { status: Extract<ImportStatus, { kind: 'error' }> }) {
  const retryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => retryRef.current?.focus({ preventScroll: true }), []);
  return (
    <>
      <div className="import-erreur" role="alert">
        <strong>{t('import.errorTitle')}</strong>
        <p>{status.message}</p>
        {status.detail && <p>{status.detail}</p>}
      </div>
      <div className="import-actions">
        <button ref={retryRef} className="bouton-cadre" onClick={() => setImportStatus({ kind: 'idle' })}>
          {t('import.retry')}
        </button>
      </div>
    </>
  );
}

/**
 * Mac app (owner's decisions of 15 November): « Projets récents », the last
 * projects opened or saved, a few calm lines under « ouvrir un projet »,
 * most recent first. Read each time the dialog opens; nothing on the web.
 */
function RecentProjects({ open }: { open: boolean }) {
  const [list, setList] = useState<RecentProject[]>([]);
  const [all, setAll] = useState(false);
  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!open || !bridge?.recentProjects) return;
    let live = true;
    bridge.recentProjects().then(
      (l) => live && setList(l.slice(0, RECENT_MAX)),
      () => live && setList([]),
    );
    return () => {
      live = false;
    };
  }, [open]);
  if (list.length === 0) return null;
  const shown = all ? list : list.slice(0, RECENT_SHOWN);
  return (
    <section className="projets-recents" aria-label={t('new.recentTitle')} data-testid="projets-recents">
      <ul>
        {shown.map((p) => (
          <li key={p.token}>
            <button className="lien" onClick={() => void getDesktopBridge()?.openRecentProject?.(p.token)}>
              {p.name.replace(/\.fab$/i, '')}
            </button>
            <small>{p.folder}</small>
          </li>
        ))}
      </ul>
      {list.length > RECENT_SHOWN && (
        <button className="lien discret" data-testid="recents-tous" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? t('new.recentFewer') : t('new.recentAll', { n: list.length })}
        </button>
      )}
    </section>
  );
}

/** Three recent projects are shown, most recent first; « voir tous » unfolds the rest. */
const RECENT_SHOWN = 3;
const RECENT_MAX = 5;
