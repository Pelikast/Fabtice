// The message of the update (C16), a window of the family of the start-up messages (`StandardsMessage`):
//
//   Mac app   « Une mise à jour est disponible »: the number of this version and of the new one, the notes of the
//             new one (scrollable when long), one button « Mettre à jour Fabtice » and a discreet « Plus tard »;
//             then the progress of the download and of the check (« Annuler »), the closing, the restart; a
//             failure said in one sentence, nothing changed, with the manual download when it is the way out.
//             From the menu bar, « Rechercher une mise à jour… » also shows « Fabtice est à jour » or why the
//             search could not be made.
//   Web app   « Une nouvelle version de Fabtice est prête »: « Recharger » (on the new version at once) and
//             « Plus tard ».
//
// Échap is « Plus tard » (or « OK »); while it downloads, only « Annuler » stops it. The rest of the screen is
// inert while it is open, and the focus goes back to where it was when it closes.

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import { t } from '../i18n';
import type { UpdateState } from '../platform/desktopBridge';
import { Notes } from '../update/notes';
import { amountText, blockText, busyText, errorText, offersManual } from '../update/texts';
import { cancelConfirm, cancelUpdate, closeUpdateMessage, openUpdatePage, startUpdate, updateStore } from '../update/updates';
import '../styles/update.css';

const FOCUSABLE = 'button, input, [tabindex]';

/** What the window shows, from the state of the update. */
export type MessageView = 'checking' | 'up-to-date' | 'check-failed' | 'available' | 'progress' | 'closing' | 'restarting' | 'web-ready' | 'web-reloading';

export function viewOf(mode: 'desktop' | 'web' | 'none', desktop: UpdateState | null, webPhase: string): MessageView {
  if (mode === 'web') return webPhase === 'reloading' ? 'web-reloading' : 'web-ready';
  switch (desktop?.phase) {
    case 'up-to-date':
      return 'up-to-date';
    case 'failed':
      return 'check-failed';
    case 'available':
      return 'available';
    case 'downloading':
    case 'preparing':
      return 'progress';
    case 'closing':
      return 'closing';
    case 'restarting':
      return 'restarting';
    default:
      return 'checking';
  }
}

export function UpdateMessage() {
  const open = useStore(updateStore, (s) => s.message !== null);
  return open ? <MessageBox /> : null;
}

/** The progress of the download and of the check: a percentage and a line of ink that advance steadily. */
export function UpdateProgress({ state }: { state: UpdateState }) {
  const p = state.progress ?? { fraction: 0, received: 0, total: state.available?.size ?? 0 };
  const percent = Math.round(Math.min(1, Math.max(0, p.fraction)) * 100);
  const label = state.phase === 'preparing' ? t('update.preparing') : t('update.downloading');
  return (
    <div className="import-etat maj-progres" data-testid="maj-progres">
      <div className="phase">
        <span>{label}</span>
        <span data-testid="maj-pourcent">{t('import.percent', { n: percent })}</span>
      </div>
      <div className="jauge" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={label} style={{ '--avance': p.fraction } as CSSProperties}>
        <span />
      </div>
      {state.phase === 'downloading' && p.total > 0 && (
        <p className="import-note" data-testid="maj-quantite">
          {amountText(p.received, p.total)}
        </p>
      )}
    </div>
  );
}

function MessageBox() {
  const boxRef = useRef<HTMLDivElement>(null);
  const mode = useStore(updateStore, (s) => s.mode);
  const desktop = useStore(updateStore, (s) => s.desktop);
  const webPhase = useStore(updateStore, (s) => s.web.phase);
  const confirm = useStore(updateStore, (s) => (s.confirm?.where === 'message' ? s.confirm : null));
  const view = viewOf(mode, desktop, webPhase);

  // The opening screen (« Nouveau projet ») waits behind, out of reach, as it does behind the message of the charts.
  useLayoutEffect(() => {
    const behind = document.querySelector<HTMLElement>('.voile-projet');
    if (!behind || behind.inert) return;
    behind.inert = true;
    return () => {
      behind.inert = false;
    };
  }, []);
  // The focus is taken for the window, and given back when it closes.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (before && before !== document.body && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    boxRef.current?.querySelector<HTMLElement>('[data-principal]')?.focus({ preventScroll: true });
  }, [view, confirm !== null]);

  const busy = view === 'progress' || view === 'closing' || view === 'restarting' || view === 'web-reloading';
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ') {
      e.stopPropagation();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (confirm) cancelConfirm();
      else if (!busy) closeUpdateMessage();
      return;
    }
    if (e.key !== 'Tab') return;
    const box = boxRef.current;
    if (!box) return;
    const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !(el as HTMLButtonElement).disabled && el.tabIndex >= 0);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  };

  const title =
    mode === 'web'
      ? t('update.title.web')
      : view === 'up-to-date'
        ? t('update.title.upToDate')
        : view === 'check-failed'
          ? t('update.title.failed')
          : view === 'checking'
            ? t('update.title.checking')
            : t('update.title.available');

  return (
    <div
      className="voile ouverte voile-message voile-maj"
      role="dialog"
      aria-modal="true"
      aria-labelledby="maj-titre"
      data-testid="maj-message"
      data-etat={view}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => e.key === ' ' && e.stopPropagation()}
    >
      <div ref={boxRef} className="accueil message-grilles message-maj">
        <h2 id="maj-titre">{title}</h2>
        {mode === 'web' ? <WebBody view={view} /> : desktop && <DesktopBody view={view} state={desktop} />}
        {confirm && (
          <div className="maj-question" role="alertdialog" aria-labelledby="maj-question-texte">
            <p id="maj-question-texte" data-testid="maj-occupe">
              {busyText(confirm.work)}
            </p>
            <div className="message-actions">
              <button className="plein encre" data-principal data-testid="maj-quand-meme" onClick={() => void startUpdate('message', true)}>
                {t('update.busy.anyway')}
              </button>
              <button className="bouton-cadre" data-testid="maj-attendre" onClick={cancelConfirm}>
                {t('update.busy.wait')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WebBody({ view }: { view: MessageView }) {
  const confirming = useStore(updateStore, (s) => s.confirm !== null);
  return (
    <>
      <p data-testid="maj-texte">{t('update.web.text')}</p>
      {view === 'web-reloading' ? (
        <p className="message-note" role="status">
          {t('update.web.reloading')}
        </p>
      ) : (
        !confirming && (
          <div className="message-actions">
            <button className="plein encre" data-principal data-testid="maj-recharger" onClick={() => void startUpdate('message')}>
              {t('update.web.reload')}
            </button>
            <button className="bouton-cadre maj-plus-tard" data-testid="maj-plus-tard" onClick={closeUpdateMessage}>
              {t('update.later')}
            </button>
          </div>
        )
      )}
    </>
  );
}

function DesktopBody({ view, state }: { view: MessageView; state: UpdateState }) {
  const confirming = useStore(updateStore, (s) => s.confirm !== null);
  const available = state.available;
  if (view === 'checking') {
    return (
      <>
        <p role="status">{t('update.checking')}</p>
        <div className="jauge indeterminee" aria-hidden="true">
          <span />
        </div>
      </>
    );
  }
  if (view === 'up-to-date' || view === 'check-failed') {
    const code = state.error?.code;
    return (
      <>
        {view === 'up-to-date' ? (
          <p data-testid="maj-texte">{t('update.upToDate', { current: state.current })}</p>
        ) : (
          <p className="maj-erreur" role="alert" data-testid="maj-erreur">
            {code ? errorText(code, state) : t('update.error.network')}
          </p>
        )}
        <div className="message-actions">
          {view === 'check-failed' && code === 'unreadable' && (
            <button className="bouton-cadre" data-testid="maj-manuel" onClick={() => void openUpdatePage()}>
              {t('update.manual')}
            </button>
          )}
          <button className="plein encre" data-principal data-testid="maj-ok" onClick={closeUpdateMessage}>
            {t('update.ok')}
          </button>
        </div>
      </>
    );
  }
  if (!available) return null;
  const blocked = state.blocked;
  const error = state.error && state.error.during === 'update' ? state.error : null;
  return (
    <>
      <p data-testid="maj-versions">{t('update.versions', { current: state.current, version: available.version })}</p>
      {available.notes && view === 'available' && (
        <>
          <h3 className="libelle maj-notes-titre">{t('update.notesTitle', { version: available.version })}</h3>
          <Notes markdown={available.notes} testId="maj-notes" />
        </>
      )}
      {view === 'progress' && <UpdateProgress state={state} />}
      {view === 'closing' && (
        <p className="message-note" role="status" data-testid="maj-fermeture">
          {t('update.closing')}
        </p>
      )}
      {view === 'restarting' && (
        <p className="message-note" role="status" data-testid="maj-redemarre">
          {t('update.restarting')}
        </p>
      )}
      {view === 'available' && error && (
        <p className="maj-erreur" role="alert" data-testid="maj-erreur">
          {errorText(error.code, state)}
        </p>
      )}
      {view === 'available' && !error && blocked && (
        <p className="maj-erreur" role="alert" data-testid="maj-bloque">
          {blockText(blocked.code, state)}
        </p>
      )}
      {view === 'available' && !blocked && !error && <p className="message-note">{t('update.restartNote')}</p>}
      {view === 'progress' && (
        <div className="message-actions">
          <button className="bouton-cadre" data-principal data-testid="maj-annuler" onClick={() => void cancelUpdate()}>
            {t('update.cancel')}
          </button>
        </div>
      )}
      {view === 'available' && !confirming && (
        <div className="message-actions">
          {blocked ? (
            blocked.code !== 'system' && (
              <button className="plein encre" data-principal data-testid="maj-manuel" onClick={() => void openUpdatePage()}>
                {t('update.manual')}
              </button>
            )
          ) : (
            <>
              {error && offersManual(state) && (
                <button className="lien discret maj-lien" data-testid="maj-manuel" onClick={() => void openUpdatePage()}>
                  {t('update.manual')}
                </button>
              )}
              <button className="plein encre" data-principal data-testid="maj-mettre" onClick={() => void startUpdate('message')}>
                {t('update.install')}
              </button>
            </>
          )}
          <button className="bouton-cadre maj-plus-tard" data-testid="maj-plus-tard" data-principal={blocked?.code === 'system' ? '' : undefined} onClick={closeUpdateMessage}>
            {t('update.later')}
          </button>
        </div>
      )}
    </>
  );
}
