// The message of the chord charts of standards (C9), a window of the family of the other windows
// (`styles/dialog.css`), over the opening screen or the open piece, one window at a time:
//
//   ask      « Voulez-vous importer automatiquement les grilles des standards de iReal Pro ? … »
//            « Oui (recommandé) » (the main button, in ink), « Non merci », « Ne plus afficher ce message ».
//   running  the progress of the download; the window may be closed, the download goes on.
//   done     the sentence that ends it, « Terminer ».
//   last     « Ce choix reste disponible dans le menu de réglages avancé de l'application. », « OK ».
//
// Escape is « Non merci » on the question (the box, if ticked, counts), « Continuer en arrière-plan » while
// the download runs, « Terminer » on its result and « OK » on the last word. The rest of the screen is inert
// while it is open, and the focus goes back to where it was when it closes.

import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import { t } from '../i18n';
import {
  acceptMessage,
  acknowledgeLastWord,
  cancelStandardsDownload,
  declineMessage,
  finishMessage,
  leaveMessageRunning,
  reportText,
  setDontShow,
  useStandards,
  standardsStore,
  type MessageStep,
} from '../standards/offer';
import { currentMessageStep } from '../standards/messageStep';
import { subscribeWindows } from '../ui/windows';
import { StandardsProgress } from './StandardsProgress';

/** The step of the message now; follows the standards state and the windows that may be in its way. */
export function useMessageStep(): MessageStep {
  const subscribe = (listener: () => void) => {
    const offs = [standardsStore.subscribe(listener), subscribeWindows(listener)];
    return () => offs.forEach((off) => off());
  };
  return useSyncExternalStore(subscribe, currentMessageStep, () => null);
}

const FOCUSABLE = 'button, input, [tabindex]';

export function StandardsMessage() {
  const step = useMessageStep();
  if (!step) return null;
  return <MessageBox step={step} />;
}

function MessageBox({ step }: { step: Exclude<MessageStep, null> }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const run = useStandards((s) => s.run);
  const dontShow = useStandards((s) => s.dontShow);
  const report = useStandards((s) => (s.run.kind === 'done' ? s.run.report : null));

  // The focus is taken for the window, and given back when it closes (to where it was, else the logo).
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (before && before !== document.body && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, []);
  // Each step puts the focus on its main button.
  useEffect(() => {
    boxRef.current?.querySelector<HTMLElement>('[data-principal]')?.focus({ preventScroll: true });
  }, [step]);

  const escape = () => {
    if (step === 'ask') declineMessage();
    else if (step === 'running') leaveMessageRunning();
    else if (step === 'done') finishMessage();
    else acknowledgeLastWord();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Space belongs to the buttons and the box of this window: it does not start the playback behind it.
    if (e.key === ' ') {
      e.stopPropagation();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      escape();
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

  return (
    <div className="voile ouverte voile-message" role="dialog" aria-modal="true" aria-labelledby="grilles-titre" data-testid="grilles-message" data-etape={step} onKeyDown={onKeyDown} onKeyUp={(e) => e.key === ' ' && e.stopPropagation()}>
      <div ref={boxRef} className="accueil message-grilles">
        <h2 id="grilles-titre">{t('standards.title')}</h2>
        {step === 'ask' && (
          <>
            <p data-testid="grilles-texte">{t('standards.message.text')}</p>
            <label className="option message-case">
              <input type="checkbox" checked={dontShow} data-testid="grilles-ne-plus" onChange={(e) => setDontShow(e.target.checked)} />
              <span>{t('standards.message.dontShow')}</span>
            </label>
            <div className="message-actions">
              <button className="plein encre" data-principal data-testid="grilles-oui" onClick={() => void acceptMessage()}>
                {t('standards.message.yes')}
              </button>
              <button className="bouton-cadre" data-testid="grilles-non" onClick={declineMessage}>
                {t('standards.message.no')}
              </button>
            </div>
          </>
        )}
        {step === 'running' && run.kind === 'running' && (
          <>
            <StandardsProgress run={run} />
            <p className="stems-note message-note">{t('standards.message.backgroundNote')}</p>
            <div className="message-actions">
              <button className="plein encre" data-principal data-testid="grilles-arriere-plan" onClick={leaveMessageRunning}>
                {t('standards.message.background')}
              </button>
              <button className="bouton-cadre" data-testid="grilles-annuler" onClick={cancelStandardsDownload}>
                {t('standards.cancel')}
              </button>
            </div>
          </>
        )}
        {step === 'done' && report && (
          <>
            <p className="message-bilan" role="status" data-testid="grilles-bilan">
              {reportText(report)}
            </p>
            <div className="message-actions">
              <button className="plein encre" data-principal data-testid="grilles-terminer" onClick={finishMessage}>
                {t('standards.done')}
              </button>
            </div>
          </>
        )}
        {step === 'last' && (
          <>
            <p data-testid="grilles-dernier">{t('standards.message.last')}</p>
            <div className="message-actions">
              <button className="plein encre" data-principal data-testid="grilles-ok" onClick={acknowledgeLastWord}>
                {t('standards.message.ok')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
