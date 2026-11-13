import { useCallback, useRef } from 'react';
import { getEngine } from '../audio';
import { formatClock, formatLoopBars, formatPosition, formatSigned } from '../grid/format';
import { decimalSeparator, formatNumber, t } from '../i18n';
import type { Subdivision } from '../model/project';
import {
  backToStart,
  closePanel,
  resetTempo,
  setSubdivision,
  stepSemitones,
  stepTempo,
  toggleLoop,
  toggleMetronome,
  togglePanel,
  togglePlay,
  toggleTriplets,
} from '../store/actions';
import { SEMITONES, TEMPO_RATIO, targetBpm } from '../store/derived';
import { appStore, useApp } from '../store/store';
import { useFrame } from '../ui/frameLoop';
import { BackIcon, LoopIcon, MetronomeIcon, PauseIcon, PlayIcon, TripletIcon } from '../ui/icons';
import { useOutsideClose } from '../ui/useOutsideClose';
import { TuningPanel } from './TuningPanel';

const SUBDIVISIONS: Subdivision[] = [1, 2, 4, 8];

export function Transport() {
  const mode = useApp((s) => s.view.mode);
  return (
    <footer className="bas">
      <div className="gauche">
        <PositionReadout />
        {mode === 'pistes' && <SubGridControls />}
      </div>
      <Commands />
      <div className="reglages">
        <KeyControl />
        <TempoControl />
        <MetronomeButton />
      </div>
    </footer>
  );
}

/**
 * Clock, bar and beat: written straight into the DOM on every animation frame
 * from the engine's position (never through React state).
 */
function PositionReadout() {
  const timeRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const beatRef = useRef<HTMLElement>(null);
  const loopText = useApp((s) => (s.loop.enabled && s.loop.region ? formatLoopBars(s.tempoMap, s.loop.region) : null));
  const engineError = useApp((s) => (s.transport.engine === 'error' ? (s.transport.error?.code ?? 'runtime') : null));

  useFrame(() => {
    const position = getEngine().getPosition();
    const time = formatClock(position, decimalSeparator());
    const { bar, beat } = formatPosition(appStore.getState().tempoMap, position);
    // Touch the DOM only when the text changes.
    for (const [el, text] of [[timeRef.current, time], [barRef.current, bar], [beatRef.current, beat]] as const) {
      if (el && el.textContent !== text) el.textContent = text;
    }
  });

  return (
    <div className="position">
      <span className="temps" ref={timeRef} data-testid="temps" />
      {engineError ? (
        <span className="ou" role="alert">
          {t(
            engineError === 'load'
              ? 'engine.errorLoad'
              : engineError === 'unsupported'
                ? 'engine.errorUnsupported'
                : 'engine.error',
          )}
        </span>
      ) : (
        <span className="ou">
          {t('pos.bar')} <b ref={barRef} /> · {t('pos.beat')} <b ref={beatRef} />
          {loopText && (
            <span>
              {' '}
              · {t('pos.loop')} <b>{loopText}</b>
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function SubGridControls() {
  const subdivision = useApp((s) => s.view.subdivision);
  const triplets = useApp((s) => s.view.triplets);
  return (
    <div className="sous-grille" role="group" aria-label={t('sub.label')}>
      <label className="choix">
        <span className="reglage-nom">{t('sub.label')}</span>
        <select value={subdivision} onChange={(e) => setSubdivision(Number(e.target.value) as Subdivision)}>
          {SUBDIVISIONS.map((n) => (
            <option key={n} value={n}>
              {t(`sub.${n}`)}
            </option>
          ))}
        </select>
      </label>
      <button className="bascule" aria-pressed={triplets} onClick={toggleTriplets}>
        <TripletIcon />
        {t('sub.triplets')}
      </button>
    </div>
  );
}

function Commands() {
  const playing = useApp((s) => s.transport.engine === 'playing');
  const ready = useApp((s) => s.transport.engine === 'ready' || s.transport.engine === 'playing');
  const loop = useApp((s) => s.loop);
  const looping = loop.enabled && loop.region !== null;
  return (
    <div className="commandes">
      <button
        className="rond"
        aria-label={t(looping ? 'transport.backToLoop' : 'transport.backToStart')}
        title={t(looping ? 'transport.backToLoop' : 'transport.backToStart')}
        disabled={!ready}
        onClick={backToStart}
      >
        <BackIcon />
      </button>
      <button
        className="rond jouer"
        aria-pressed={playing}
        aria-label={t(playing ? 'transport.pause' : 'transport.play')}
        disabled={!ready}
        onClick={togglePlay}
      >
        <PlayIcon />
        <PauseIcon />
      </button>
      <button
        className="rond"
        aria-pressed={looping}
        aria-label={t('transport.loop')}
        title={loop.region ? t('transport.loop') : t('transport.loopNone')}
        disabled={loop.region === null}
        onClick={toggleLoop}
      >
        <LoopIcon />
      </button>
    </div>
  );
}

function KeyControl() {
  const semitones = useApp((s) => s.playback.semitones);
  const cents = useApp((s) => s.playback.cents);
  const open = useApp((s) => s.ui.panel === 'tuning');
  const valueRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const refs = useRef([valueRef, panelRef]).current;
  useOutsideClose(open, refs, useCallback(() => closePanel(), []));

  const detail = cents !== 0 ? t('key.cents', { cents: formatSigned(cents) }) : semitones === 0 ? t('key.original') : t('key.semitones');
  return (
    <div className="reglage" role="group" aria-label={t('key.label')}>
      <span className="reglage-nom">{t('key.label')}</span>
      <button className="pas" aria-label={t('key.down')} disabled={semitones <= SEMITONES.min} onClick={() => stepSemitones(-1)}>
        −
      </button>
      <button
        ref={valueRef}
        className="valeur"
        aria-label={t('key.fineOpen')}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={t('key.fine')}
        onClick={() => togglePanel('tuning')}
      >
        <strong data-testid="ton">{formatSigned(semitones)}</strong>
        <small>{detail}</small>
      </button>
      <button className="pas" aria-label={t('key.up')} disabled={semitones >= SEMITONES.max} onClick={() => stepSemitones(1)}>
        +
      </button>
      {open && <TuningPanel ref={panelRef} />}
    </div>
  );
}

function TempoControl() {
  const ratio = useApp((s) => s.playback.tempoRatio);
  const target = useApp((s) => targetBpm(s));
  const original = target === null ? null : target / ratio;
  const value = target === null ? t('tempo.percent', { n: Math.round(ratio * 100) }) : formatNumber(Math.round(target), 0);
  const detail = original === null ? t('tempo.speed') : t('tempo.original', { bpm: formatNumber(original, 1) });
  return (
    <div className="reglage" role="group" aria-label={t('tempo.label')}>
      <span className="reglage-nom">{t('tempo.label')}</span>
      <button className="pas" aria-label={t('tempo.slower')} disabled={ratio <= TEMPO_RATIO.min} onClick={() => stepTempo(-1)}>
        −
      </button>
      <button className="valeur" title={t('tempo.reset')} aria-label={`${value}, ${t('tempo.reset')}`} disabled={ratio === 1} onClick={resetTempo}>
        <strong data-testid="tempo">{value}</strong>
        <small>{detail}</small>
      </button>
      <button className="pas" aria-label={t('tempo.faster')} disabled={ratio >= TEMPO_RATIO.max} onClick={() => stepTempo(1)}>
        +
      </button>
    </div>
  );
}

function MetronomeButton() {
  const on = useApp((s) => s.playback.metronome);
  return (
    <button className="metronome" aria-pressed={on} aria-label={t('metronome.label')} onClick={toggleMetronome}>
      <MetronomeIcon />
      {t('metronome.short')}
    </button>
  );
}
