// « Clic » and its panel (lot 4), at the right of the transport (DESIGN.md).
// The Clic button stays the one-touch switch; the small button beside it
// opens the panel: volume and count-in on top (what anyone may want), the
// meter and its grouping, then, folded, the strong and weak beats and the
// progressive acceleration of the loop.

import { useCallback, useMemo, useRef, useState, type Ref } from 'react';
import { getEngine } from '../audio';
import { accelerationStatus, COMMON_METERS, firstMeter, groupingChoices, groupingText, meterKey, patternFor } from '../grid/metronome';
import { t } from '../i18n';
import { ACCELERATION_LIMITS, COUNT_IN_BARS, type AccelerationPlan, type BeatLevel } from '../model/metronome';
import type { Meter } from '../model/tempoMap';
import { selectMeterChanges } from '../store/meterActions';
import { closePanel, openSettings, toggleMetronome, togglePanel } from '../store/actions';
import { targetBpm } from '../store/derived';
import {
  cycleBeatLevel,
  resetPattern,
  restartAcceleration,
  setAcceleration,
  setCountInBars,
  setGrouping,
  setMeter,
  setMetronomeVolume,
  toggleAcceleration,
} from '../store/metronomeActions';
import { appStore, useApp } from '../store/store';
import { useFrame } from '../ui/frameLoop';
import { MetronomeIcon, SlidersIcon } from '../ui/icons';
import { useFitPanel } from '../ui/useFitPanel';
import { useOutsideClose } from '../ui/useOutsideClose';

/** The Clic switch and the button that opens its panel. */
export function MetronomeControl() {
  const on = useApp((s) => s.playback.metronome);
  const open = useApp((s) => s.ui.panel === 'metronome');
  const hasProject = useApp((s) => s.project !== null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const refs = useRef([buttonRef, panelRef]).current;
  useOutsideClose(open, refs, useCallback(() => closePanel(), []));
  return (
    <div className="clic">
      <button className="metronome" aria-pressed={on} aria-label={t('metronome.label')} onClick={toggleMetronome}>
        <MetronomeIcon />
        {t('metronome.short')}
      </button>
      <button
        ref={buttonRef}
        className="clic-reglages"
        data-testid="clic-reglages"
        aria-label={t('metronome.settings')}
        title={t('metronome.settings')}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={!hasProject}
        onClick={() => togglePanel('metronome')}
      >
        <SlidersIcon />
      </button>
      {open && <MetronomePanel ref={panelRef} />}
    </div>
  );
}

function MetronomePanel({ ref }: { ref: Ref<HTMLDivElement> }) {
  const on = useApp((s) => s.playback.metronome);
  const fitRef = useFitPanel(ref, true);
  return (
    <div ref={fitRef} className="fenetre panneau-metronome" role="dialog" aria-label={t('metronome.title')} data-testid="panneau-metronome">
      <div className="metro-tete">
        <h2 className="libelle">{t('metronome.title')}</h2>
        <button className="bascule" aria-pressed={on} data-testid="clic-panneau" onClick={toggleMetronome}>
          <MetronomeIcon />
          {t('metronome.on')}
        </button>
      </div>

      <MetronomeSettingsBody />
      <p className="panneau-note panneau-tous">
        <button className="lien discret" data-testid="tous-reglages-metronome" onClick={() => openSettings('metronome')}>
          {t('settingsWin.allSettings')}
        </button>
      </p>
    </div>
  );
}

/**
 * Volume, count-in, signature and grouping, strong and weak beats, progressive acceleration: the panel's
 * settings, shared with the tab « Métronome » of « Réglages ».
 */
export function MetronomeSettingsBody() {
  const volume = useApp((s) => s.metronome.volume);
  const edited = useEditedMeter();
  const countIn = useApp((s) => s.metronome.countInBars);
  return (
    <>
      <label className="metro-ligne">
        <span>{t('metronome.volume')}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(volume * 100)}
          data-testid="clic-volume"
          aria-valuetext={`${Math.round(volume * 100)} %`}
          onChange={(e) => setMetronomeVolume(Number(e.target.value) / 100)}
        />
      </label>

      <div className="metro-bloc" role="group" aria-labelledby="metro-decompte">
        <span id="metro-decompte" className="metro-nom">
          {t('metronome.countIn')}
        </span>
        <div className="metro-choix" data-testid="decompte">
          {COUNT_IN_BARS.map((n) => (
            <button key={n} aria-pressed={countIn === n} onClick={() => setCountInBars(n)}>
              {t(`metronome.countIn.${n}`)}
            </button>
          ))}
        </div>
        <p className="panneau-note">{t('metronome.countInHint')}</p>
      </div>

      <MeterChoice edited={edited} />
      <BeatLevels edited={edited} />
      <Acceleration />
    </>
  );
}

/** The signature whose grouping and accents are being set, among those of the piece. */
interface EditedMeter {
  /** Distinct signatures of the piece, in order of appearance (one when the piece has a single signature). */
  all: Meter[];
  meter: Meter;
  choose: (m: Meter) => void;
}

function useEditedMeter(): EditedMeter {
  const changes = useApp(selectMeterChanges);
  const [picked, setPicked] = useState<string | null>(null);
  const all = useMemo(() => {
    const seen = new Set<string>();
    const out: Meter[] = [];
    for (const c of changes) if (!seen.has(meterKey(c.meter))) (seen.add(meterKey(c.meter)), out.push(c.meter));
    return out;
  }, [changes]);
  // A choice that is no longer in the piece (the change was undone, removed) falls back on the first signature.
  const meter = all.find((m) => meterKey(m) === picked) ?? all[0]!;
  return { all, meter, choose: (m) => setPicked(meterKey(m)) };
}

function MeterChoice({ edited }: { edited: EditedMeter }) {
  const first = useApp((s) => firstMeter(s.tempoMap));
  const meter = edited.meter;
  const patterns = useApp((s) => s.metronome.patterns);
  const pattern = useMemo(() => patternFor(patterns, meter), [patterns, meter]);
  const key = meterKey(first);
  const list = COMMON_METERS.some((m) => meterKey(m) === key) ? COMMON_METERS : [...COMMON_METERS, first];
  const choices = groupingChoices(meter);
  const current = groupingText(pattern.grouping);
  return (
    <div className="metro-bloc">
      <label className="metro-ligne">
        <span>{t('metronome.meter')}</span>
        <select
          value={key}
          data-testid="mesure-metrique"
          onChange={(e) => {
            const m = list.find((x) => meterKey(x) === e.target.value);
            if (m) setMeter(m);
          }}
        >
          {list.map((m) => (
            <option key={meterKey(m)} value={meterKey(m)}>
              {meterKey(m)}
            </option>
          ))}
        </select>
      </label>
      {edited.all.length > 1 && (
        <div className="metro-ligne" role="group" aria-label={t('metronome.edited')}>
          <span>{t('metronome.edited')}</span>
          <div className="metro-choix" data-testid="signature-reglee">
            {edited.all.map((m) => (
              <button key={meterKey(m)} aria-pressed={meterKey(m) === meterKey(meter)} data-meter={meterKey(m)} onClick={() => edited.choose(m)}>
                {meterKey(m)}
              </button>
            ))}
          </div>
        </div>
      )}
      {choices.length > 1 && (
        <div className="metro-ligne" role="group" aria-label={t('metronome.grouping')}>
          <span>{t('metronome.grouping')}</span>
          <div className="metro-choix" data-testid="regroupement">
            {choices.map((g) => (
              <button key={groupingText(g)} aria-pressed={current === groupingText(g)} aria-label={t('metronome.groupingName', { g: groupingText(g) })} onClick={() => setGrouping(meter, g)}>
                {groupingText(g)}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="panneau-note">{t(edited.all.length > 1 ? 'metronome.editedHint' : 'metronome.meterHint')}</p>
    </div>
  );
}

const LEVEL_MARK: Record<BeatLevel, string> = { accent: '>', normal: '•', soft: '·', silent: '' };

/** « Temps forts et faibles », folded (an advanced setting). */
function BeatLevels({ edited }: { edited: EditedMeter }) {
  const [open, setOpen] = useState(false);
  const meter = edited.meter;
  const patterns = useApp((s) => s.metronome.patterns);
  const pattern = useMemo(() => patternFor(patterns, meter), [patterns, meter]);
  const custom = patterns[meterKey(meter)] !== undefined;
  return (
    <div className="avance">
      <button className="option avance-titre" aria-expanded={open} data-testid="temps-forts" onClick={() => setOpen((o) => !o)}>
        <span>{t('metronome.beats')}</span>
        <span className="chevron" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="avance-corps">
          <p className="panneau-note">{t('metronome.beatsHint')}</p>
          <BeatRow meter={meter} levels={pattern.levels} grouping={pattern.grouping} />
          <div className="remise">
            <button className="lien" disabled={!custom} onClick={() => resetPattern(meter)}>
              {t('metronome.resetBeats')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BeatRow({ meter, levels, grouping }: { meter: Meter; levels: BeatLevel[]; grouping: number[] }) {
  // the first beat of each group starts a little apart, so the grouping is seen
  const groupStart = new Set<number>();
  let at = 0;
  for (const g of grouping) {
    groupStart.add(at);
    at += g;
  }
  return (
    <div className="temps-rangee" data-testid="temps-rangee">
      {levels.map((level, i) => (
        <button
          key={i}
          className={`temps-bouton ${level}${groupStart.has(i) && i > 0 ? ' groupe' : ''}`}
          data-level={level}
          aria-label={t('metronome.beat', { n: i + 1, level: t(`metronome.level.${level}`) })}
          title={t('metronome.beat', { n: i + 1, level: t(`metronome.level.${level}`) })}
          onClick={() => cycleBeatLevel(meter, i)}
        >
          <span className="temps-numero">{i + 1}</span>
          <span className="temps-force" aria-hidden="true">
            {LEVEL_MARK[level]}
          </span>
        </button>
      ))}
    </div>
  );
}

type AccelField = 'startPercent' | 'stepPercent' | 'everyRepeats' | 'targetPercent';

/** « Accélération progressive », folded. */
function Acceleration() {
  const plan = useApp((s) => s.metronome.acceleration);
  const [open, setOpen] = useState(plan.enabled);
  const hasLoop = useApp((s) => s.loop.enabled && s.loop.region !== null);
  const applied = useApp((s) => s.render.status === 'applied');
  return (
    <div className="avance">
      <button className="option avance-titre" aria-expanded={open} data-testid="acceleration" onClick={() => setOpen((o) => !o)}>
        <span>{t('accel.title')}</span>
        <span className="chevron" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="avance-corps">
          <label className="option option-ligne">
            <input type="checkbox" checked={plan.enabled} data-testid="acceleration-active" onChange={toggleAcceleration} />
            <span>{t('accel.toggle')}</span>
          </label>
          <div className="accel-grille">
            <Stepper plan={plan} field="startPercent" label={t('accel.start')} text={t('accel.percent', { n: plan.startPercent })} step={5} />
            <Stepper plan={plan} field="stepPercent" label={t('accel.step')} text={`+ ${t('accel.percent', { n: plan.stepPercent })}`} step={1} />
            <Stepper
              plan={plan}
              field="everyRepeats"
              label={t('accel.every')}
              text={plan.everyRepeats === 1 ? t('accel.everyUnitOne') : t('accel.everyUnit', { n: plan.everyRepeats })}
              step={1}
            />
            <Stepper plan={plan} field="targetPercent" label={t('accel.target')} text={t('accel.percent', { n: plan.targetPercent })} step={5} />
          </div>
          <p className="panneau-note">{t('accel.ofTempo')}</p>
          {plan.enabled && (hasLoop ? <AccelStatus plan={plan} /> : <p className="panneau-note" data-testid="accel-sans-boucle">{t('accel.noLoop')}</p>)}
          {plan.enabled && applied && <p className="panneau-note">{t('accel.quality')}</p>}
        </div>
      )}
    </div>
  );
}

function Stepper({ plan, field, label, text, step }: { plan: AccelerationPlan; field: AccelField; label: string; text: string; step: number }) {
  const lim = ACCELERATION_LIMITS[field];
  const v = plan[field];
  const lo = field === 'targetPercent' ? Math.max(lim.min, plan.startPercent + 1) : lim.min;
  const hi = field === 'startPercent' ? Math.min(lim.max, plan.targetPercent - 1) : lim.max;
  return (
    <div className="accel-reglage" role="group" aria-label={label} data-testid={`accel-${field}`}>
      <span className="metro-nom">{label}</span>
      <div className="saisie">
        <button aria-label={t('accel.less', { what: label })} disabled={v <= lo} onClick={() => setAcceleration({ [field]: Math.max(lo, v - step) })}>
          −
        </button>
        <strong>{text}</strong>
        <button aria-label={t('accel.more', { what: label })} disabled={v >= hi} onClick={() => setAcceleration({ [field]: Math.min(hi, v + step) })}>
          +
        </button>
      </div>
    </div>
  );
}

/** The step heard now, read from the engine every frame (never through React). */
function AccelStatus({ plan }: { plan: AccelerationPlan }) {
  const textRef = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    const el = textRef.current;
    if (!el) return;
    const text = accelerationText(plan, getEngine().getMetronomeStatus().accelerationStep);
    if (el.textContent !== text) el.textContent = text;
  });
  return (
    <div className="accel-etat" role="status">
      <span ref={textRef} data-testid="accel-etat" />
      <button className="lien" onClick={restartAcceleration}>
        {t('accel.restart')}
      </button>
    </div>
  );
}

/** « Palier 2 sur 7 · 75 % » (the engine's step; −1 reads as the first step). */
export function accelerationText(plan: AccelerationPlan, engineStep: number, short = false): string {
  const st = accelerationStatus(plan, Math.max(0, engineStep));
  if (short) return t('accel.transport', { k: st.step + 1, n: st.steps, p: st.percent });
  return st.atTarget ? t('accel.reached', { p: st.percent }) : t('accel.status', { k: st.step + 1, n: st.steps, p: st.percent });
}

/** The tempo heard during an acceleration, for the transport: the set tempo times the step. */
export function acceleratedBpm(engineStep: number): number | null {
  const s = appStore.getState();
  const bpm = targetBpm(s);
  if (bpm === null || engineStep < 0) return null;
  return (bpm * accelerationStatus(s.metronome.acceleration, engineStep).percent) / 100;
}
