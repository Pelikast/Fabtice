// Réglages → Général (C16, C17, stage 6): the version number (« Fabtice 1.0.0 »), « Rechercher une mise à jour… »
// with its answer in place (« Fabtice est à jour. », the version available with its button, the progress, or the
// reason it could not be made), and « Vérifier à chaque ouverture ».
//
// Mac app: the number is the app's own (`app.getVersion()`, from the bridge), so that a newer build shows its
// number without a new interface; the search and the update are the main process's (`update/updates.ts`).
// Web app: the number of this page's build; the search asks the browser for a new version of the site.

import { useStore } from 'zustand';
import { t } from '../../i18n';
import { setCheckUpdatesAtLaunch } from '../../store/settingsActions';
import { useApp } from '../../store/store';
import { Notes } from '../../update/notes';
import { blockText, busyText, errorText, offersManual } from '../../update/texts';
import { cancelConfirm, cancelUpdate, checkNow, openUpdatePage, startUpdate, updateStore } from '../../update/updates';
import { APP_VERSION } from '../../version';
import { UpdateProgress } from '../UpdateMessage';
import { CheckRow, Section } from './parts';
import '../../styles/update.css';

export function UpdateSection() {
  const atLaunch = useApp((s) => s.settings.checkUpdatesAtLaunch);
  const mode = useStore(updateStore, (s) => s.mode);
  const desktop = useStore(updateStore, (s) => s.desktop);
  const web = useStore(updateStore, (s) => s.web);
  const version = mode === 'desktop' && desktop ? desktop.current : APP_VERSION;
  const searching = mode === 'desktop' ? desktop?.phase === 'checking' : web.phase === 'checking';
  const working = mode === 'desktop' && desktop !== null && ['downloading', 'preparing', 'closing', 'restarting'].includes(desktop.phase);
  return (
    <Section scope="app" title={t('update.section.title')}>
      <div className="maj-section" data-testid="maj-section">
        <p className="maj-version" data-testid="maj-version">
          {t('update.section.version', { version })}
        </p>
        <div className="option option-colonne maj-recherche">
          <div className="maj-boutons">
            <button type="button" className="bouton-cadre" data-testid="maj-rechercher" disabled={searching || working} onClick={() => void checkNow()}>
              {t('update.section.search')}
            </button>
          </div>
          <Result />
        </div>
        <CheckRow
          checked={atLaunch}
          onChange={setCheckUpdatesAtLaunch}
          label={t('update.section.atLaunch')}
          note={mode === 'web' ? t('update.section.webAtLaunchNote') : t('update.section.atLaunchNote')}
          testId="maj-ouverture"
        />
      </div>
    </Section>
  );
}

/** The answer of the search, in place. Nothing before a search (or a search at opening that found nothing). */
function Result() {
  const mode = useStore(updateStore, (s) => s.mode);
  const desktop = useStore(updateStore, (s) => s.desktop);
  const web = useStore(updateStore, (s) => s.web);
  const confirm = useStore(updateStore, (s) => (s.confirm?.where === 'section' ? s.confirm : null));

  if (mode === 'web' || mode === 'none') {
    const phase = mode === 'none' && web.phase !== 'checking' && web.phase !== 'idle' ? 'unsupported' : web.phase;
    if (phase === 'idle') return null;
    return (
      <div className="maj-resultat" role="status" data-testid="maj-resultat" data-etat={phase}>
        {phase === 'checking' && <p>{t('update.checking')}</p>}
        {phase === 'up-to-date' && <p>{t('update.upToDateShort')}</p>}
        {phase === 'unsupported' && <p>{t('update.web.unsupported')}</p>}
        {phase === 'failed' && <p className="maj-erreur">{t('update.error.network')}</p>}
        {phase === 'reloading' && <p>{t('update.web.reloading')}</p>}
        {phase === 'ready' && (
          <>
            <p>{t('update.web.ready')}</p>
            {confirm ? (
              <Confirm work={confirm.work} />
            ) : (
              <div className="maj-boutons">
                <button type="button" className="plein encre" data-testid="maj-recharger" onClick={() => void startUpdate('section')}>
                  {t('update.web.reload')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (!desktop) return null;
  const s = desktop;
  // A search at opening that found nothing new says nothing here either.
  if (s.phase === 'idle' || (s.origin === 'launch' && (s.phase === 'up-to-date' || s.phase === 'failed'))) return null;
  const error = s.error;
  return (
    <div className="maj-resultat" role="status" data-testid="maj-resultat" data-etat={s.phase}>
      {s.phase === 'checking' && <p>{t('update.checking')}</p>}
      {s.phase === 'up-to-date' && <p>{t('update.upToDateShort')}</p>}
      {s.phase === 'failed' && error && (
        <>
          <p className="maj-erreur" data-testid="maj-erreur">
            {errorText(error.code, s)}
          </p>
          {error.code === 'unreadable' && <ManualButton />}
        </>
      )}
      {s.available && s.phase !== 'checking' && s.phase !== 'up-to-date' && s.phase !== 'failed' && (
        <>
          <p data-testid="maj-disponible">{t('update.section.available', { version: s.available.version })}</p>
          {s.phase === 'available' && s.available.notes && <Notes markdown={s.available.notes} />}
          {(s.phase === 'downloading' || s.phase === 'preparing') && (
            <>
              <UpdateProgress state={s} />
              <div className="maj-boutons">
                <button type="button" className="lien discret" data-testid="maj-annuler" onClick={() => void cancelUpdate()}>
                  {t('update.cancel')}
                </button>
              </div>
            </>
          )}
          {s.phase === 'closing' && <p>{t('update.closing')}</p>}
          {s.phase === 'restarting' && <p>{t('update.restarting')}</p>}
          {s.phase === 'available' && error && (
            <p className="maj-erreur" data-testid="maj-erreur">
              {errorText(error.code, s)}
            </p>
          )}
          {s.phase === 'available' && !error && s.blocked && (
            <p className="maj-erreur" data-testid="maj-bloque">
              {blockText(s.blocked.code, s)}
            </p>
          )}
          {s.phase === 'available' &&
            (confirm ? (
              <Confirm work={confirm.work} />
            ) : (
              <div className="maj-boutons">
                {!s.blocked && (
                  <button type="button" className="plein encre" data-testid="maj-mettre" onClick={() => void startUpdate('section')}>
                    {t('update.install')}
                  </button>
                )}
                {offersManual(s) && <ManualButton />}
              </div>
            ))}
        </>
      )}
    </div>
  );
}

function ManualButton() {
  return (
    <button type="button" className="bouton-cadre" data-testid="maj-manuel" onClick={() => void openUpdatePage()}>
      {t('update.manual')}
    </button>
  );
}

function Confirm({ work }: { work: Parameters<typeof busyText>[0] }) {
  return (
    <>
      <p className="maj-occupe" data-testid="maj-occupe">
        {busyText(work)}
      </p>
      <div className="maj-boutons">
        <button type="button" className="plein encre" data-testid="maj-quand-meme" onClick={() => void startUpdate('section', true)}>
          {t('update.busy.anyway')}
        </button>
        <button type="button" className="bouton-cadre" data-testid="maj-attendre" onClick={cancelConfirm}>
          {t('update.busy.wait')}
        </button>
      </div>
    </>
  );
}
