// « Correction de la courbe en tapant le tempo » (C12). Opened from the bar
// menu (`ui/barDialogs.ts#openTapFix`); what it computes is `analysis/tapFix.ts`,
// what it does to the engine `ui/tapFixSession.ts`, the pure rules
// `grid/tapFixPlan.ts`.
//
// A small window docked above the transport (a sheet at the bottom of the
// screen on a phone): the ruler and the playhead stay visible around it, and
// nothing is darkened. Steps:
//   prepare    the starting bar, the bars of count-in, the instructions, « C'est parti »;
//   tapping    the passage plays (click forced on up to the chosen bar), the user taps
//              (space bar, or a touch on the big zone on a phone), « Ok, j'ai fini »;
//   computing  `previewTappedFix`; refused: a calm sentence and « Réessayer »;
//   check      « Vérifier en écoutant », « Ce n'est pas bon, réessayer », « C'est bon, c'est corrigé »;
//   committing the rest of the piece is analysed again, with its percentage.
// Closing the window at any step leaves nothing changed (playback stopped, the
// grid in force back, the user's metronome and loop back).

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore } from 'zustand';
import { commitTappedFix, discardTappedPreview, previewTappedFix, showTappedPreview, tapNow, type TapFixRefusal, type TappedPreview } from '../analysis/tapFix';
import { useAnalysisProgress } from '../analysis/progress';
import { cancelAnalysis } from '../analysis/runner';
import { getEngine } from '../audio';
import { formatBarNumber } from '../grid/format';
import { TAP_COUNT_IN, clampTapCountIn, recordTap, tapsFromBar, tapsWindowStart } from '../grid/tapFixPlan';
import { t, type MessageKey } from '../i18n';
import { appStore, useApp } from '../store/store';
import { closeTapFix, tapFixDialog } from '../ui/barDialogs';
import { onFrame } from '../ui/frameLoop';
import { CloseIcon } from '../ui/icons';
import { restoreEngineSettings, startTapping, startVerifying, stopPlaying } from '../ui/tapFixSession';
import { tapsReadingText } from '../ui/tapFixReading';
import { usePhoneLayout } from '../util/media';
import '../styles/tapFix.css';

type Step = 'prepare' | 'tapping' | 'computing' | 'check' | 'refused' | 'committing';

const REFUSALS: readonly string[] = ['tooFewTaps', 'notABar', 'noAnalysis', 'irregular', 'failed'] satisfies TapFixRefusal[];

/** The sentence for a refusal; an unknown code gets the general one. */
export function refusalText(code: string): string {
  return t(REFUSALS.includes(code) ? (`tapFix.refused.${code}` as MessageKey) : 'tapFix.refused.other');
}

export function TapFixDialog() {
  const at = useStore(tapFixDialog, (s) => s.at);
  if (!at) return null;
  return <TapFixBox key={at.bar} bar={at.bar} />;
}

/** The wait of « C'est bon, c'est corrigé » is shown at least this long. */
const COMMIT_MIN_MS = 700;

const percent = (f: number) => Math.round(Math.min(1, Math.max(0, f)) * 100);

function TapFixBox({ bar }: { bar: number }) {
  const phone = usePhoneLayout();
  const [step, setStepState] = useState<Step>('prepare');
  const [countIn, setCountIn] = useState(String(TAP_COUNT_IN.default));
  const [count, setCount] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [phase, setPhase] = useState<'listen' | 'go'>('listen');
  const [refused, setRefused] = useState<string | null>(null);
  const [preview, setPreview] = useState<TappedPreview | null>(null);
  const [verifying, setVerifying] = useState(false);
  const running = useApp((s) => s.analysisRun.status === 'running');
  const fraction = useAnalysisProgress((p) => percent(p.fraction) / 100);

  const boxRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef<Step>('prepare');
  const tapsRef = useRef<readonly number[]>([]);
  const barTimeRef = useRef(0);
  /** The earliest tap kept: two bars before the chosen one. */
  const earliestRef = useRef(0);
  const countInRef = useRef<number>(TAP_COUNT_IN.default);
  const previewRef = useRef<TappedPreview | null>(null);
  const stopAtRef = useRef(0);
  const aliveRef = useRef(true);

  const setStep = useCallback((s: Step) => {
    stepRef.current = s;
    setStepState(s);
  }, []);

  // Closing, by any road (Escape, the cross, the end of the work): the engine, the grid in force, the user's metronome and loop are back.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      // Closed while the passage is being computed: the work is given up.
      if (stepRef.current === 'computing') cancelAnalysis();
      stopPlaying();
      discardTappedPreview();
      restoreEngineSettings();
    };
  }, []);

  // Docked above the transport (the CSS puts a sheet at the bottom on a phone).
  useLayoutEffect(() => {
    const place = () => {
      const bas = document.querySelector('.bas');
      const top = bas ? bas.getBoundingClientRect().top : window.innerHeight;
      boxRef.current?.style.setProperty('--tapes-bas', `${Math.max(8, Math.round(window.innerHeight - top + 12))}px`);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);

  // The control that goes first in each step takes the focus (Enter does what is expected).
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const target = box.querySelector<HTMLElement>('[data-premier]') ?? box;
    target.focus({ preventScroll: true });
  }, [step, refused]);

  const close = useCallback(() => closeTapFix(), []);

  // ---- tapping

  // `at`: the event's time stamp, so that the time it waited before this handler ran is taken off the tap.
  const tap = useCallback((at?: number) => {
    if (stepRef.current !== 'tapping') return;
    const next = recordTap(tapsRef.current, tapNow(at), earliestRef.current);
    if (next === tapsRef.current) return;
    tapsRef.current = next;
    // Every tap pulses; the counter counts those from the chosen bar on (the earlier ones, along the count-in, only help the computation).
    setCount(tapsFromBar(next, barTimeRef.current));
    setPulse((n) => n + 1);
  }, []);

  const finish = useCallback(async () => {
    if (stepRef.current !== 'tapping') return;
    // The step first: stopping the engine reports its state, which must not finish a second time.
    setStep('computing');
    stopPlaying();
    restoreEngineSettings();
    let result: Awaited<ReturnType<typeof previewTappedFix>>;
    try {
      result = await previewTappedFix(bar, tapsRef.current);
    } catch {
      result = { refused: 'failed' };
    }
    if (!aliveRef.current) return;
    if ('refused' in result) {
      setRefused(result.refused);
      setStep('refused');
      return;
    }
    showTappedPreview(result);
    previewRef.current = result;
    setPreview(result);
    setVerifying(false);
    setStep('check');
  }, [bar, setStep]);

  const go = () => {
    const n = clampTapCountIn(countIn);
    countInRef.current = n;
    setCountIn(String(n));
    tapsRef.current = [];
    setCount(0);
    setRefused(null);
    const plan = startTapping(bar, n);
    barTimeRef.current = plan.barTime;
    earliestRef.current = tapsWindowStart(appStore.getState().tempoMap, bar);
    setPhase(plan.start >= plan.barTime && !plan.countIn ? 'go' : 'listen');
    setStep('tapping');
  };

  // While tapping: the space bar taps (and neither starts nor stops the playback, even with a button focused), and the end of the piece is the end of the tapping.
  useEffect(() => {
    if (step !== 'tapping') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.code !== 'Space' && e.key !== ' ') || e.altKey || e.ctrlKey || e.metaKey) return;
      // Before the page, before the focused button (a button would « click » on keyup).
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'keydown' && !e.repeat) tap(e.timeStamp);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    const engine = getEngine();
    let started = engine.getState() === 'playing';
    const offState = engine.on('state', (state) => {
      if (state === 'playing') started = true;
      else if (started) void finish();
    });
    const offEnded = engine.on('ended', () => void finish());
    const offFrame = onFrame(() => {
      if (stepRef.current === 'tapping' && engine.getPosition() >= barTimeRef.current - 1e-3) setPhase('go');
    });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      offState();
      offEnded();
      offFrame();
    };
  }, [step, tap, finish]);

  // Escape closes the window at any step but the last one (the rest of the piece is being analysed).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || stepRef.current === 'committing') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);

  // ---- check

  // « Vérifier en écoutant » stops by itself a little after the last beat placed from the taps.
  useEffect(() => {
    if (!verifying) return;
    const engine = getEngine();
    const timer = window.setInterval(() => {
      if (engine.getPosition() >= stopAtRef.current - 1e-3) {
        stopPlaying();
        setVerifying(false);
      }
    }, 40);
    let started = engine.getState() === 'playing';
    const offState = engine.on('state', (state) => {
      if (state === 'playing') started = true;
      else if (started) setVerifying(false);
    });
    return () => {
      window.clearInterval(timer);
      offState();
    };
  }, [verifying]);

  const toggleVerify = () => {
    if (!preview) return;
    if (verifying) {
      stopPlaying();
      setVerifying(false);
      return;
    }
    stopAtRef.current = startVerifying(preview, countInRef.current).stop;
    setVerifying(true);
  };

  const retry = () => {
    stopPlaying();
    discardTappedPreview();
    restoreEngineSettings();
    previewRef.current = null;
    setPreview(null);
    setVerifying(false);
    setRefused(null);
    setStep('prepare');
  };

  const accept = async () => {
    const p = previewRef.current;
    if (!p) return;
    stopPlaying();
    setVerifying(false);
    setStep('committing');
    const started = Date.now();
    try {
      // The preview is still shown: the commit gives the grid in force back itself, then stores what was heard.
      await commitTappedFix(p);
      // It is ignored when the grid changed since the preview: then nothing was kept, and it is said.
      const kept = appStore.getState().corrections.tempoFixes.some((f) => f.kind === 'tapped' && Math.abs(f.time - p.from) < 1e-3);
      if (!kept) throw new Error('not kept');
      // A work that ends at once must not make the window blink: the wait stays a moment, so that it is read.
      const rest = COMMIT_MIN_MS - (Date.now() - started);
      if (rest > 0) await new Promise((resolve) => window.setTimeout(resolve, rest));
    } catch {
      if (!aliveRef.current) return;
      setRefused('failed');
      setStep('refused');
      return;
    }
    if (aliveRef.current) close();
  };

  // ---- the window

  const title = t('tapFix.title', { bar: formatBarNumber(bar) });
  const waiting = step === 'computing' || step === 'committing';
  const tapsText = count === 0 ? t('tapFix.taps.none') : count === 1 ? t('tapFix.taps.one') : t('tapFix.taps.many', { n: count });
  const share = running ? fraction : 0;
  const readingLine = preview ? tapsReadingText(preview.reading) : null;

  return (
    <div
      ref={boxRef}
      className="tapes"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tapes-titre"
      tabIndex={-1}
      data-testid="tapes"
      data-etape={step}
      data-form={phone ? 'telephone' : 'ordinateur'}
    >
      <div className="tapes-entete">
        <h2 id="tapes-titre">{title}</h2>
        {step !== 'committing' && (
          <button className="fermer" aria-label={t('tapFix.close')} data-testid="tapes-fermer" onClick={close}>
            <CloseIcon />
          </button>
        )}
      </div>

      {step === 'prepare' && (
        <>
          <p className="tapes-texte" data-testid="tapes-consigne">
            {phone ? t('tapFix.instructionsTouch') : t('tapFix.instructions')}
          </p>
          <div className="tapes-champ">
            <label htmlFor="tapes-decompte">{t('tapFix.countIn')}</label>
            <input
              id="tapes-decompte"
              data-testid="tapes-decompte"
              type="number"
              inputMode="numeric"
              min={TAP_COUNT_IN.min}
              max={TAP_COUNT_IN.max}
              step={1}
              value={countIn}
              onChange={(e) => setCountIn(e.target.value)}
              onBlur={() => setCountIn(String(clampTapCountIn(countIn)))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  go();
                }
              }}
            />
          </div>
          <div className="tapes-actions">
            <button className="plein" data-premier data-testid="tapes-depart" onClick={go}>
              {t('tapFix.go')}
            </button>
          </div>
        </>
      )}

      {step === 'tapping' && (
        <>
          <div className="tapes-zone" data-testid="tapes-zone" data-phase={phase} onPointerDown={(e) => {
            e.preventDefault();
            tap(e.timeStamp);
          }}>
            <span key={pulse} className={`tapes-pouls${pulse > 0 ? ' bat' : ''}`} aria-hidden="true" />
            <span className="tapes-consigne-vive" role="status" aria-live="polite" data-testid="tapes-phase">
              {phase === 'listen' ? t('tapFix.listen') : phone ? t('tapFix.nowTouch') : t('tapFix.now')}
            </span>
            <span className="tapes-compte" data-testid="tapes-compte">
              {tapsText}
            </span>
          </div>
          <div className="tapes-actions">
            <button className="plein" data-premier data-testid="tapes-fini" onClick={() => void finish()}>
              {t('tapFix.done')}
            </button>
          </div>
        </>
      )}

      {waiting && (
        <div className="import-etat tapes-attente" role="status" aria-live="polite" data-testid="tapes-attente">
          <div className="phase">
            <span>{step === 'computing' ? t('tapFix.computing') : t('tapFix.committing')}</span>
            {step === 'computing' && running && <span data-testid="tapes-pourcentage">{t('import.percent', { n: Math.round(share * 100) })}</span>}
          </div>
          <div className={`jauge${step === 'committing' || !running ? ' indeterminee' : ''}`} style={{ '--avance': share } as CSSProperties}>
            <span />
          </div>
        </div>
      )}

      {step === 'check' && (
        <>
          <p className="tapes-texte">{t('tapFix.checkIntro')}</p>
          {readingLine && (
            <p className="tapes-lecture" data-testid="tapes-lecture">
              {readingLine}
            </p>
          )}
          <button className={`bouton-cadre tapes-ecoute${verifying ? ' actif' : ''}`} data-premier data-testid="tapes-verifier" aria-pressed={verifying} onClick={toggleVerify}>
            {verifying ? t('tapFix.stopListening') : t('tapFix.verify')}
          </button>
          <div className="tapes-actions deux">
            <button className="bouton-cadre" data-testid="tapes-reessayer" onClick={retry}>
              {t('tapFix.retry')}
            </button>
            <button className="plein" data-testid="tapes-ok" onClick={() => void accept()}>
              {t('tapFix.accept')}
            </button>
          </div>
        </>
      )}

      {step === 'refused' && (
        <>
          <p className="accueil-avis tapes-refus" role="alert" data-testid="tapes-refus" data-code={refused ?? ''}>
            {refusalText(refused ?? '')}
          </p>
          <div className="tapes-actions deux">
            <button className="bouton-cadre" data-testid="tapes-fermer-refus" onClick={close}>
              {t('tapFix.close')}
            </button>
            <button className="plein" data-premier data-testid="tapes-encore" onClick={retry}>
              {t('tapFix.again')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
