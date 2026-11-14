import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { formatAmount } from '../import/amount';
import { cancelImport, isCancellablePhase, startFileImport, startLinkImport, startToolUpdate } from '../import/controller';
import { FILE_ACCEPT } from '../import/formats';
import { t } from '../i18n';
import { getDesktopBridge } from '../platform/desktopBridge';
import { forgetKeptPiece, reopenKeptPiece } from '../storage';
import { closeNewPiece, setImportStatus } from '../store/actions';
import { useApp, type ImportStatus, type ReopenOffer } from '../store/store';
import { CloseIcon } from '../ui/icons';

/**
 * « Nouveau morceau »: a link (Mac app only) or an audio file. Shown over the
 * empty shell at launch; while an import runs (or the kept piece is reopened)
 * it shows its progress, then its error if it fails. In the Mac app it also
 * proposes, discreetly, a newer version of the import tool.
 */
export function NewPieceDialog() {
  const open = useApp((s) => s.ui.newPieceOpen);
  const status = useApp((s) => s.ui.import);
  const hasProject = useApp((s) => s.project !== null);
  const desktop = useMemo(() => getDesktopBridge() !== null, []);
  const canClose = hasProject && status.kind !== 'busy';

  return (
    <div
      className={`voile${open ? ' ouverte' : ''}`}
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
            <button className="plein" autoFocus onClick={() => setConfirming(false)}>
              {t('restore.forgetNo')}
            </button>
          </div>
        </div>
      ) : (
        <div className="reprise-actions">
          <button className="plein" onClick={() => void reopenKeptPiece()}>
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
  const [link, setLink] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  // Mac app: the link field takes the focus, ready for a paste.
  const linkRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) linkRef.current?.focus({ preventScroll: true });
  }, [open]);

  const chooseFile = () => fileRef.current?.click();
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

  if (desktop) {
    return (
      <>
        {noticeLine}
        <p>{t('new.leadLink')}</p>
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
          <button className="plein" type="submit">
            {t('new.import')}
          </button>
        </form>
        <div className="sinon">
          {t('new.or')}{' '}
          <button className="lien" onClick={chooseFile}>
            {t('new.chooseFile')}
          </button>
        </div>
        {fileInput}
        {toolUpdate && (
          <div className="mise-a-jour">
            <span>{t('new.updateOffer')}</span>{' '}
            <button className="lien" onClick={() => void startToolUpdate()}>
              {t('new.updateAction')}
            </button>
          </div>
        )}
        <div className="pied">
          <span>{t('new.formats')}</span>
          <span>{t('new.dropHint')}</span>
        </div>
      </>
    );
  }
  return (
    <>
      {noticeLine}
      <p>{t('new.leadFile')}</p>
      <button className="plein" onClick={chooseFile}>
        {t('new.chooseFileButton')}
      </button>
      {fileInput}
      <div className="pied">
        <span>{t('new.formats')}</span>
        <span>{t('new.dropHint')}</span>
      </div>
    </>
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
  const cancellable = isCancellablePhase(phase);
  const quiet = useQuiet(`${phase}|${step ?? ''}|${fraction ?? ''}|${received ?? ''}`, MAY_BE_SLOW.has(phase), QUIET_NOTE_DELAY_MS);
  // A percentage only when there is something real to measure; else the amount received, else nothing.
  const figure = fraction !== null ? t('import.percent', { n: Math.round(fraction * 100) }) : received !== undefined ? t('import.received', { size: formatAmount(received) }) : '';
  return (
    <div className="import-etat" role="status" aria-live="polite">
      {title && !restoring && <div className="import-titre">{title}</div>}
      <div className="phase">
        <span>{restoring ? t('import.restoring', { title: title ?? '' }) : t(`import.${phase}`)}</span>
        <span>{figure}</span>
      </div>
      <div className={`jauge${fraction === null ? ' indeterminee' : ''}`} style={{ '--avance': fraction ?? 0 } as CSSProperties}>
        <span />
      </div>
      {restoring && step && <p className="import-note">{t(`restore.step.${step}`)}</p>}
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
