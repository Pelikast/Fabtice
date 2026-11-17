import { useCallback, useRef, useState } from 'react';
import { getEngine } from '../audio';
import { formatClock, formatPosition, formatSigned } from '../grid/format';
import { formatLoop } from '../grid/loopText';
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
  togglePanel,
  togglePlay,
  toggleTriplets,
} from '../store/actions';
import { withAccidentals } from '../harmony/ChordSymbol';
import { keyLabel, transposeKey } from '../harmony/key';
import { keyPassages, type KeyPassage } from '../store/keySelectors';
import { SEMITONES, TEMPO_RATIO, targetBpm } from '../store/derived';
import { appStore, useApp } from '../store/store';
import { useFrame } from '../ui/frameLoop';
import { BackIcon, LoopIcon, PauseIcon, PlayIcon, TripletIcon } from '../ui/icons';
import { useOutsideClose } from '../ui/useOutsideClose';
import { ApplyControl } from './ApplyRender';
import { MarkersControl } from './MarkersPanel';
import { accelerationText, MetronomeControl } from './MetronomePanel';
import { TuningPanel } from './TuningPanel';

/** The sub-grid steps, coarsest first: half, quarter, eighth, sixteenth and thirty-second notes. */
export const SUBDIVISIONS: Subdivision[] = [0.5, 1, 2, 4, 8];

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
        <ApplyControl />
        <MetronomeControl />
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
  const countRef = useRef<HTMLSpanElement>(null);
  const loopText = useApp((s) => (s.loop.enabled && s.loop.region ? formatLoop(s.tempoMap, s.loop.region).text : null));
  const loopLong = useApp((s) => (s.loop.enabled && s.loop.region ? formatLoop(s.tempoMap, s.loop.region).long : undefined));
  const loopWhole = useApp((s) => s.loop.region !== null && formatLoop(s.tempoMap, s.loop.region).whole);
  const engineError = useApp((s) => (s.transport.engine === 'error' ? (s.transport.error?.code ?? 'runtime') : null));

  useFrame(() => {
    const position = getEngine().getPosition();
    const time = formatClock(position, decimalSeparator());
    const { bar, beat } = formatPosition(appStore.getState().tempoMap, position);
    // Touch the DOM only when the text changes.
    for (const [el, text] of [[timeRef.current, time], [barRef.current, bar], [beatRef.current, beat]] as const) {
      if (el && el.textContent !== text) el.textContent = text;
    }
    // Lot 4: the count-in before the music, « décompte · 3 », while the position waits.
    const left = getEngine().getMetronomeStatus().countInLeft;
    const count = countRef.current;
    if (count) {
      const text = left > 0 ? t('metronome.countingIn', { n: left }) : '';
      if (count.textContent !== text) count.textContent = text;
      if (count.hidden !== (left === 0)) count.hidden = left === 0;
    }
  });

  return (
    <div className="position">
      <span className="temps" ref={timeRef} data-testid="temps" />
      <span className="decompte" ref={countRef} data-testid="decompte-en-cours" role="status" hidden />
      {engineError ? (
        <span className="ou" role="alert">
          {t(
            engineError === 'load'
              ? 'engine.errorLoad'
              : engineError === 'unsupported'
                ? 'engine.errorUnsupported'
                : engineError === 'context' || engineError === 'runtime'
                  ? 'engine.errorDevice'
                  : 'engine.error',
          )}
        </span>
      ) : (
        <span className="ou">
          {t('pos.bar')} <b ref={barRef} /> · {t('pos.beat')} <b ref={beatRef} />
          {loopText && (
            // Whole bars read in line (« boucle 5–8 »); a longer reading goes under the position.
            <span className={`boucle-texte${loopWhole ? '' : ' hors-ligne'}`} data-testid="boucle-texte" title={loopLong}>
              {loopWhole ? ' · ' : ''}
              {t('pos.loop')} <b>{loopText}</b>
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/** The list of sub-grid steps (shared with the tab « Tempo et analyse » of « Réglages »). */
export function SubdivisionSelect({ id }: { id?: string }) {
  const subdivision = useApp((s) => s.view.subdivision);
  return (
    <select id={id} value={subdivision} onChange={(e) => setSubdivision(Number(e.target.value) as Subdivision)}>
      {SUBDIVISIONS.map((n) => (
        <option key={n} value={n}>
          {t(`sub.${n}`)}
        </option>
      ))}
    </select>
  );
}

function SubGridControls() {
  const triplets = useApp((s) => s.view.triplets);
  return (
    <div className="sous-grille" role="group" aria-label={t('sub.label')}>
      <label className="choix">
        <span className="reglage-nom">{t('sub.label')}</span>
        <SubdivisionSelect />
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
  // After the audio output failed (`context`, `runtime`), Lecture stays available: pressing it is a new try.
  const ready = useApp(
    (s) =>
      s.transport.engine === 'ready' ||
      s.transport.engine === 'playing' ||
      (s.transport.engine === 'error' && s.project !== null && (s.transport.error?.code === 'context' || s.transport.error?.code === 'runtime')),
  );
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
      <MarkersControl />
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

  // With a known key, as in the mockup: « A♭ · original », « A♭ → D♭ » (concert pitch, the instrument is the chart's business).
  // C10: the key of the place being played; the frame loop only re-renders when the playhead crosses a modulation.
  const passages = useApp(keyPassages);
  const passage = usePassageAtPlayhead(passages);
  const key = passages[passage]?.key ?? passages[0]?.key ?? null;
  const minor = useApp((s) => s.settings.minorNotation);
  const keyDetail = key
    ? semitones === 0
      ? `${keyLabel(key, minor)} · ${t('key.original')}`
      : `${keyLabel(key, minor)} → ${keyLabel(transposeKey(key, semitones), minor)}`
    : null;
  const detail = cents !== 0 ? t('key.cents', { cents: formatSigned(cents) }) : (keyDetail ?? (semitones === 0 ? t('key.original') : t('key.semitones')));
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
        <small data-testid="ton-detail">{withAccidentals(detail)}</small>
      </button>
      <button className="pas" aria-label={t('key.up')} disabled={semitones >= SEMITONES.max} onClick={() => stepSemitones(1)}>
        +
      </button>
      {open && <TuningPanel ref={panelRef} />}
    </div>
  );
}

/** Index in `passages` of the passage at the playhead, followed on every frame (state changes only on a crossing). */
function usePassageAtPlayhead(passages: readonly KeyPassage[]): number {
  const [index, setIndex] = useState(() => passageIndexAt(passages, getEngine().getPosition()));
  const current = useRef(index);
  const list = useRef(passages);
  list.current = passages;
  useFrame(() => {
    const i = passageIndexAt(list.current, getEngine().getPosition());
    if (i === current.current) return;
    current.current = i;
    setIndex(i);
  });
  // Read again at each render too (a modulation added or moved under the playhead shows at once).
  void index;
  const now = passageIndexAt(passages, getEngine().getPosition());
  current.current = now;
  return now;
}

/** The passage heard at `time` (the first one before its start). */
export function passageIndexAt(passages: readonly KeyPassage[], time: number): number {
  let found = 0;
  for (let i = 1; i < passages.length; i++) {
    if (passages[i]!.time <= time + 1e-6) found = i;
    else break;
  }
  return found;
}

function TempoControl() {
  const ratio = useApp((s) => s.playback.tempoRatio);
  const target = useApp((s) => targetBpm(s));
  const original = target === null ? null : target / ratio;
  const value = target === null ? t('tempo.percent', { n: Math.round(ratio * 100) }) : formatNumber(Math.round(target), 0);
  const detail = original === null ? t('tempo.speed') : t('tempo.original', { bpm: formatNumber(original, 1) });
  // Lot 4: during a progressive acceleration the small line says the step heard (« palier 2/7 · 75 % »).
  const accelerating = useApp((s) => s.metronome.acceleration.enabled && s.loop.enabled && s.loop.region !== null);
  const detailRef = useRef<HTMLElement>(null);
  useFrame(() => {
    const el = detailRef.current;
    if (!el || !accelerating) return;
    const text = accelerationText(appStore.getState().metronome.acceleration, getEngine().getMetronomeStatus().accelerationStep, true);
    if (el.textContent !== text) el.textContent = text;
  });
  return (
    <div className="reglage" role="group" aria-label={t('tempo.label')}>
      <span className="reglage-nom">{t('tempo.label')}</span>
      <button className="pas" aria-label={t('tempo.slower')} disabled={ratio <= TEMPO_RATIO.min} onClick={() => stepTempo(-1)}>
        −
      </button>
      <button className="valeur" title={t('tempo.reset')} aria-label={`${value}, ${t('tempo.reset')}`} disabled={ratio === 1} onClick={resetTempo}>
        <strong data-testid="tempo">{value}</strong>
        {accelerating ? <small ref={detailRef} data-testid="tempo-palier" /> : <small>{detail}</small>}
      </button>
      <button className="pas" aria-label={t('tempo.faster')} disabled={ratio >= TEMPO_RATIO.max} onClick={() => stepTempo(1)}>
        +
      </button>
    </div>
  );
}


