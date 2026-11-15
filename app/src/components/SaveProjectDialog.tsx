// « Enregistrer le projet » (lot 4): one `.fab` file holding the whole
// project, with every separation and the kept render (owner's decision: no
// choice to make). The dialog says what goes in, prepares the file (the FLAC
// encoding takes a moment, with a steady percentage), then hands it over as a
// link (the user's click saves it: a download in a browser, the save panel of
// macOS in the Mac app), in the family of « Exporter le son ».

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { deliverable, type Delivered } from '../export/audio/deliver';
import { t } from '../i18n';
import { buildProjectFile, projectContents, ProjectSaveError, saveRefusal } from '../project/save';
import { formatSize } from '../separation/useChoice';
import { closeSaveProject } from '../store/exportActions';
import { useApp } from '../store/store';
import { CloseIcon } from '../ui/icons';

type Phase = { kind: 'choose' } | { kind: 'working'; fraction: number } | { kind: 'ready'; file: Delivered } | { kind: 'error'; code: string };

export function SaveProjectDialog() {
  const open = useApp((s) => s.ui.saveProjectOpen);
  if (!open) return null;
  return <SaveProjectBox />;
}

function SaveProjectBox() {
  const contents = useApp(useShallowContents);
  const [phase, setPhase] = useState<Phase>(() => {
    const refusal = saveRefusal();
    return refusal ? { kind: 'error', code: refusal } : { kind: 'choose' };
  });
  const abortRef = useRef<AbortController | null>(null);
  const goRef = useRef<HTMLButtonElement>(null);
  useEffect(() => goRef.current?.focus({ preventScroll: true }), []);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => () => (phase.kind === 'ready' ? phase.file.release() : undefined), [phase]);
  const close = () => {
    abortRef.current?.abort();
    closeSaveProject();
  };
  const run = async () => {
    const abort = new AbortController();
    abortRef.current = abort;
    setPhase({ kind: 'working', fraction: 0 });
    try {
      const out = await buildProjectFile({
        signal: abort.signal,
        onProgress: (fraction) => setPhase((p) => (p.kind === 'working' && Math.round(fraction * 100) !== Math.round(p.fraction * 100) ? { kind: 'working', fraction } : p)),
      });
      if (abort.signal.aborted) return;
      setPhase({ kind: 'ready', file: deliverable(out.blob, out.name) });
    } catch (e) {
      if (abort.signal.aborted) return setPhase({ kind: 'choose' });
      setPhase({ kind: 'error', code: e instanceof ProjectSaveError ? e.code : 'failed' });
    }
  };

  return (
    <div
      className="voile ouverte"
      role="dialog"
      aria-modal="true"
      aria-labelledby="projet-titre"
      data-testid="enregistrer-projet"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && phase.kind !== 'working') close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && phase.kind !== 'working') close();
      }}
    >
      <div className="accueil export-son enregistrer-projet">
        <div className="accueil-entete">
          <h2 id="projet-titre">{t('saveProject.title')}</h2>
          <button className="fermer" aria-label={t('saveProject.close')} onClick={close}>
            <CloseIcon />
          </button>
        </div>
        {phase.kind === 'choose' && (
          <>
            <p>{t('saveProject.lead')}</p>
            {contents.separations.length > 0 && (
              <p className="export-resume" data-testid="contenu-projet">
                {contents.separations.length === 1
                  ? t('saveProject.separations.one', { tools: contents.separations[0]! })
                  : t('saveProject.separations.other', { n: contents.separations.length, tools: contents.separations.join(', ') })}{' '}
                {contents.render && t('saveProject.render')}
              </p>
            )}
            {(contents.separations.length > 0 || contents.render) && <p className="export-resume">{t('saveProject.flacNote')}</p>}
            <div className="import-actions">
              <button ref={goRef} className="plein" data-testid="preparer-projet" onClick={() => void run()}>
                {t('saveProject.go')}
              </button>
            </div>
          </>
        )}
        {phase.kind === 'working' && (
          <div className="import-etat" role="status" aria-live="polite">
            <div className="phase">
              <span>{t('saveProject.working')}</span>
              <span>{t('import.percent', { n: Math.round(phase.fraction * 100) })}</span>
            </div>
            <div className="jauge" style={{ '--avance': phase.fraction } as CSSProperties}>
              <span />
            </div>
            <div className="import-actions">
              <button className="bouton-cadre" onClick={() => abortRef.current?.abort()}>
                {t('saveProject.cancel')}
              </button>
            </div>
          </div>
        )}
        {phase.kind === 'ready' && (
          <>
            <p>{t('saveProject.ready')}</p>
            <a className="plein fichier-pret" data-testid="fichier-projet" href={phase.file.href} download={phase.file.name}>
              {t('saveProject.save', { name: phase.file.name })}
            </a>
            <p className="export-resume">{formatSize(phase.file.bytes)}</p>
            <div className="import-actions">
              <button className="bouton-cadre" onClick={close}>
                {t('saveProject.close')}
              </button>
            </div>
          </>
        )}
        {phase.kind === 'error' && (
          <>
            <div className="import-erreur" role="alert">
              <p>{t(`saveProject.error.${phase.code as 'failed'}`)}</p>
            </div>
            <div className="import-actions">
              {phase.code !== 'demo' && phase.code !== 'no-project' && (
                <button className="bouton-cadre" onClick={() => setPhase(saveRefusal() ? { kind: 'error', code: saveRefusal()! } : { kind: 'choose' })}>
                  {t('import.retry')}
                </button>
              )}
              <button className="bouton-cadre" onClick={close}>
                {t('saveProject.close')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** What the file will hold, as a stable value (the store is read on every change). */
let lastContents: ReturnType<typeof projectContents> | null = null;
function useShallowContents(s: Parameters<typeof projectContents>[0]): ReturnType<typeof projectContents> {
  const next = projectContents(s);
  if (lastContents && lastContents.render === next.render && lastContents.separations.join('|') === next.separations.join('|')) return lastContents;
  lastContents = next;
  return next;
}
