// « Changer la signature rythmique » (C13). Opened from the bar menu (`ui/barDialogs.ts#openMeterDialog`): a
// small window with two boxes one over the other, separated by a line, like a written signature (a number from
// 1 to 64 over 4, 8, 16 or 32), then « Changement permanent à partir de cette mesure » or « Changement
// uniquement pour cette mesure ». What it asks is one undo step (`ui/meterForm.ts`, `store/meterActions.ts`).
// On a phone it is a sheet at the bottom of the screen, as the other windows.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import { formatBarNumber } from '../grid/format';
import { t } from '../i18n';
import { selectMeterAtBar, selectMeterChangeAt } from '../store/meterActions';
import { appStore, useApp } from '../store/store';
import { closeMeterDialog, meterDialog } from '../ui/barDialogs';
import { CloseIcon } from '../ui/icons';
import { MEASURE_DENOMINATORS, applyMeter, meterOfForm, quarterLengthText, quartersPerBar, removeMeterChange, showsQuarterHint, type MeterScope } from '../ui/meterForm';
import '../styles/meterDialog.css';

export function MeterDialog() {
  const at = useStore(meterDialog, (s) => s.at);
  if (!at) return null;
  return <MeterBox key={at.bar} bar={at.bar} />;
}

const FOCUSABLE = 'input:not(:disabled), select:not(:disabled), button:not(:disabled)';

function MeterBox({ bar }: { bar: number }) {
  const first = useApp((s) => s.tempoMap.meters[0]!.meter);
  const change = useApp((s) => selectMeterChangeAt(s, bar));
  // The signature in force at the bar when the window opened: the boxes start there.
  const [start] = useState(() => selectMeterAtBar(appStore.getState(), bar));
  const [numerator, setNumerator] = useState(String(start.numerator));
  const [denominator, setDenominator] = useState(start.denominator);
  const [scope, setScope] = useState<MeterScope>('from');
  const box = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  // Where the focus was when the window opened (the bar menu's entry, gone by now): it goes back there if it can.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(() => {
    numberRef.current?.focus({ preventScroll: true });
    numberRef.current?.select();
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);

  const meter = meterOfForm(numerator, denominator);
  const hint = meter !== null && showsQuarterHint(meter, first);
  const quarters = meter ? quartersPerBar(meter) : 0;

  const confirm = () => {
    if (!meter) return;
    applyMeter(bar, meter, scope);
    closeMeterDialog();
  };
  const remove = () => {
    removeMeterChange(bar);
    closeMeterDialog();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Space and Escape are this window's: they must not reach the shortcuts of the page behind it.
    if (e.key === ' ' || e.code === 'Space') e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMeterDialog();
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing && target.tagName !== 'BUTTON') {
      e.preventDefault();
      confirm();
    } else if (e.key === 'Tab') {
      const items = [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      // The window is modal: Tab goes round inside it.
      const edge = e.shiftKey ? items[0] : items[items.length - 1];
      if (target === edge) {
        e.preventDefault();
        (e.shiftKey ? items[items.length - 1] : items[0])?.focus();
      }
    }
  };

  return (
    <div
      className="voile ouverte voile-signature"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signature-titre"
      data-testid="signature"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeMeterDialog();
      }}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.code === 'Space') e.stopPropagation();
      }}
    >
      <div className="accueil fenetre-signature" ref={box}>
        <div className="accueil-entete">
          <h2 id="signature-titre">{t('meterDialog.title')}</h2>
          <button className="fermer" aria-label={t('meterDialog.close')} onClick={closeMeterDialog}>
            <CloseIcon />
          </button>
        </div>
        <p className="signature-mesure" data-testid="signature-mesure">
          {t('meterDialog.bar', { bar: formatBarNumber(bar) })}
        </p>

        <div className="signature-saisie" role="group" aria-label={t('meterDialog.figures')}>
          <input
            ref={numberRef}
            className="signature-haut"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={3}
            value={numerator}
            aria-label={t('meterDialog.numerator')}
            aria-invalid={meter === null}
            aria-describedby="signature-erreur"
            data-testid="signature-haut"
            onChange={(e) => setNumerator(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
          <div className="signature-trait" aria-hidden="true" />
          <select className="signature-bas" value={denominator} aria-label={t('meterDialog.denominator')} data-testid="signature-bas" onChange={(e) => setDenominator(Number(e.target.value))}>
            {MEASURE_DENOMINATORS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <p id="signature-erreur" className="signature-erreur" role="status" data-testid="signature-erreur">
          {meter === null ? t('meterDialog.invalid') : ''}
        </p>

        <div className="signature-portee" role="radiogroup" aria-label={t('meterDialog.scope')}>
          {(['from', 'bar'] as const).map((id) => (
            <label key={id} className="signature-choix">
              <input type="radio" name="signature-portee" value={id} checked={scope === id} data-testid={`signature-portee-${id}`} onChange={() => setScope(id)} />
              <span>{t(id === 'from' ? 'meterDialog.permanent' : 'meterDialog.single')}</span>
            </label>
          ))}
        </div>

        {hint && meter && (
          <p className="accueil-avis signature-note" data-testid="signature-noire">
            {t('meterDialog.quarter', { n: meter.numerator, d: meter.denominator, len: quarterLengthText(quarters) })}
          </p>
        )}

        {change && (
          <button className="lien signature-retrait" data-testid="signature-retirer" onClick={remove}>
            {t('meterDialog.remove')}
          </button>
        )}

        <div className="import-actions">
          <button className="bouton-cadre" data-testid="signature-annuler" onClick={closeMeterDialog}>
            {t('meterDialog.cancel')}
          </button>
          <button className="plein" data-testid="signature-valider" disabled={meter === null} onClick={confirm}>
            {t('meterDialog.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
