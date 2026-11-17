// « Modifier la partie » / « Ajouter une partie » (C14): a small window, opened from the structure column
// (`ui/partDialog.ts`), to change the type, the number, the instrument and the limits (first and last bar, as
// bar numbers) of a part, or to delete it. Every change is one undo step (`store/structureActions.ts`).
// On a phone it is a sheet at the bottom of the screen, as the other windows. Model: `MeterDialog.tsx`.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import { chartBounds, defaultNewLimits, partBars } from '../chart/structureDisplay';
import { getEngine } from '../audio';
import { t } from '../i18n';
import { PART_INSTRUMENTS, type PartType } from '../model/structure';
import { instrumentName, PART_TYPE_KEYS } from '../model/structureLabels';
import { changePart, deletePart } from '../store/chartDisplay';
import { selectChartBars } from '../store/chartSelectors';
import { addPart } from '../store/structureActions';
import { appStore } from '../store/store';
import { structureInForce } from '../store/structureSelectors';
import { closePartDialog, partDialog } from '../ui/partDialog';
import { CloseIcon } from '../ui/icons';
import { formOfPart, numberChoices, patchOf, readForm, typesInOrder, type FormContext, type PartForm } from '../ui/partForm';
import '../styles/partDialog.css';

export function PartDialog() {
  const at = useStore(partDialog, (s) => s.at);
  if (!at) return null;
  return <PartBox key={at.id ?? 'new'} id={at.id} />;
}

const FOCUSABLE = 'input:not(:disabled), select:not(:disabled), button:not(:disabled)';

/** What the window starts from: the part in force, or the defaults of a new one. */
function startOf(id: string | null): { form: PartForm; ctx: FormContext; byHand: boolean; mode: 'jazz' | 'pop'; oldRange: ReturnType<typeof partBars> | null } | null {
  const s = appStore.getState();
  const bars = selectChartBars(s);
  const bounds = chartBounds(bars);
  if (!bounds || !s.project) return null;
  const duration = s.project.duration;
  const ctx: FormContext = { map: s.tempoMap, duration, chart: bounds };
  const st = structureInForce(s);
  if (id !== null) {
    const part = st.parts.find((p) => p.id === id);
    if (!part) return null;
    const range = partBars(s.tempoMap, part, duration, bounds.lastBar);
    return { form: formOfPart(part, range), ctx, byHand: part.origin === 'manual', mode: st.mode, oldRange: range };
  }
  const limits = defaultNewLimits({
    map: s.tempoMap,
    loop: s.loop.enabled && s.loop.region ? s.loop.region : null,
    position: getEngine().getPosition(),
    parts: st.parts,
    duration,
    lastBar: bounds.lastBar,
  });
  const range = partBars(s.tempoMap, limits, duration, bounds.lastBar);
  const type: PartType = typesInOrder(st.mode).first.find((x) => x === 'theme' || x === 'verse') ?? 'theme';
  return { form: formOfPart({ type, number: null, instrument: null }, range), ctx, byHand: false, mode: st.mode, oldRange: null };
}

function PartBox({ id }: { id: string | null }) {
  const [start] = useState(() => startOf(id));
  // The bar-less case (the piece closed under the window): nothing to edit.
  useEffect(() => {
    if (!start) closePartDialog();
  }, [start]);
  const [form, setForm] = useState<PartForm | null>(start?.form ?? null);
  const box = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  // Where the focus was when the window opened: it goes back there if it can.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);

  if (!start || !form) return null;
  const { ctx } = start;
  const adding = id === null;
  const next = readForm(form, ctx);
  const set = (patch: Partial<PartForm>) => setForm({ ...form, ...patch });
  const types = typesInOrder(start.mode);

  const confirm = () => {
    if (!next) return;
    if (adding) {
      addPart(next);
    } else {
      const old = appStore.getState();
      const part = structureInForce(old).parts.find((p) => p.id === id);
      if (part && start.oldRange) {
        const patch = patchOf(part, start.oldRange, form, next);
        if (Object.keys(patch).length > 0) changePart(id, patch);
      }
    }
    closePartDialog();
  };
  const remove = () => {
    if (id !== null) deletePart(id);
    closePartDialog();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Space and Escape are this window's: they must not reach the shortcuts of the page behind it.
    if (e.key === ' ' || e.code === 'Space') e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closePartDialog();
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing && target.tagName === 'INPUT') {
      e.preventDefault();
      confirm();
    } else if (e.key === 'Tab') {
      const items = [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      const edge = e.shiftKey ? items[0] : items[items.length - 1];
      if (target === edge) {
        e.preventDefault();
        (e.shiftKey ? items[items.length - 1] : items[0])?.focus();
      }
    }
  };

  const chip = (type: PartType, first = false) => (
    <button
      key={type}
      ref={first ? firstRef : undefined}
      className="puce"
      aria-pressed={form.type === type}
      data-testid={`partie-type-${type}`}
      onClick={() => set({ type })}
    >
      {t(PART_TYPE_KEYS[type])}
    </button>
  );
  const firstNumber = ctx.chart.firstBar + 1;
  const lastNumber = ctx.chart.lastBar + 1;

  return (
    <div
      className="voile ouverte voile-partie"
      role="dialog"
      aria-modal="true"
      aria-labelledby="partie-titre"
      data-testid="partie-dialogue"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closePartDialog();
      }}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.code === 'Space') e.stopPropagation();
      }}
    >
      <div className="accueil fenetre-partie" ref={box}>
        <div className="accueil-entete">
          <h2 id="partie-titre">{t(adding ? 'partDialog.title.add' : 'partDialog.title.edit')}</h2>
          <button className="fermer" aria-label={t('partDialog.close')} onClick={closePartDialog}>
            <CloseIcon />
          </button>
        </div>
        {start.byHand && <p className="partie-main">{t('partDialog.byHand')}</p>}

        <div className="partie-groupe">
          <span className="libelle" id="partie-type-label">
            {t('partDialog.type')}
          </span>
          <div className="partie-puces" role="group" aria-labelledby="partie-type-label">
            {types.first.map((p, i) => chip(p, i === 0))}
            <span className="partie-sep" aria-hidden="true" />
            {types.others.map((p) => chip(p))}
          </div>
        </div>

        <div className="partie-ligne">
          <label className="partie-champ">
            <span className="libelle">{t('partDialog.number')}</span>
            <select value={form.number} data-testid="partie-numero" onChange={(e) => set({ number: e.target.value })}>
              <option value="">{t('partDialog.numberNone')}</option>
              {numberChoices(form.number).map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="partie-champ">
            <span className="libelle">{t('partDialog.instrument')}</span>
            <select value={form.instrument} data-testid="partie-instrument" onChange={(e) => set({ instrument: e.target.value })}>
              <option value="">{t('partDialog.instrumentNone')}</option>
              {PART_INSTRUMENTS.map((i) => (
                <option key={i} value={i}>
                  {instrumentName(i, t) ?? i}
                </option>
              ))}
              {form.instrument !== '' && !PART_INSTRUMENTS.includes(form.instrument) && <option value={form.instrument}>{form.instrument}</option>}
            </select>
          </label>
        </div>

        <div className="partie-groupe">
          <span className="libelle">{t('partDialog.limits')}</span>
          <div className="partie-limites">
            <label>
              <span>{t('partDialog.from')}</span>
              <input type="text" inputMode="numeric" autoComplete="off" maxLength={5} value={form.first} aria-invalid={next === null} data-testid="partie-de" onChange={(e) => set({ first: e.target.value })} onFocus={(e) => e.target.select()} />
            </label>
            <label>
              <span>{t('partDialog.to')}</span>
              <input type="text" inputMode="numeric" autoComplete="off" maxLength={5} value={form.last} aria-invalid={next === null} data-testid="partie-a" onChange={(e) => set({ last: e.target.value })} onFocus={(e) => e.target.select()} />
            </label>
          </div>
        </div>
        <p className="partie-erreur" role="status" data-testid="partie-erreur">
          {next === null ? t('partDialog.invalid', { min: firstNumber, max: lastNumber }) : ''}
        </p>

        {!adding && (
          <button className="lien-encre partie-supprimer" data-testid="partie-supprimer" onClick={remove}>
            {t('partDialog.delete')}
          </button>
        )}

        <div className="import-actions">
          <button className="bouton-cadre" data-testid="partie-annuler" onClick={closePartDialog}>
            {t('partDialog.cancel')}
          </button>
          <button className="plein" data-testid="partie-valider" disabled={next === null} onClick={confirm}>
            {t(adding ? 'partDialog.confirmAdd' : 'partDialog.confirmEdit')}
          </button>
        </div>
      </div>
    </div>
  );
}
