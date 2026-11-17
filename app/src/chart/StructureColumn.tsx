// The structure of the piece beside « Grille d'accords » (C14).
//
//   Computer: a column of 20 % on the left of the chart, with the global form,
//   the mode, the displays (« Affichage complet », « Grille complète
//   simplifiée »), then the parts of the piece, each with its « Boucle » and a
//   quiet pencil that opens its window (`components/PartDialog.tsx`).
//   Phone: the same list in a sheet from the bottom, opened from a quiet bar
//   under the chart's title (`StructureBar`).
//
// A click on a part shows its bars alone and puts the playhead at its start
// (`store/chartDisplay.ts`). The part being played is marked in the list by the
// frame loop (`usePlayingPart`), never by React.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import { partName } from '../model/structureLabels';
import { loopPart, selectChartDisplay, showFullChart, showPart, showSimplifiedChart } from '../store/chartDisplay';
import { useApp } from '../store/store';
import { lettersAreByHand, structureInForce, type PartInForce } from '../store/structureSelectors';
import { resetSectionLetters, resetStructure, setStructureMode } from '../store/structureActions';
import { openAddPartDialog, openPartDialog } from '../ui/partDialog';
import { ChevronIcon, PencilIcon } from '../ui/icons';
import type { ChartDisplay } from '../store/store';
import { usePlayingPart } from './usePlayingPart';

/** « Forme globale : AABC », or the dash when the form is not known. */
function formText(form: string): string {
  return t('structure.form', { form: form || t('structure.formUnknown') });
}

/** What the chart shows, in words (the phone bar's second half). */
export function displayName(display: ChartDisplay, parts: readonly PartInForce[]): string {
  if (display.kind === 'full') return t('structure.display.full');
  if (display.kind === 'simplified') return t('structure.display.simplified');
  const part = parts.find((p) => p.id === display.id);
  return part ? partName(part, t) : t('structure.display.full');
}

// ---------------------------------------------------------------- the list

/** The list itself: shared by the column and the phone sheet. `onDone` is called after a choice (the sheet closes). */
function StructureList({ onDone }: { onDone?: () => void }) {
  const st = useApp((s) => structureInForce(s));
  const display = useApp(selectChartDisplay);
  const handMode = useApp((s) => s.corrections.structure.mode);
  const byHand = useApp((s) => {
    const c = s.corrections.structure;
    return c.mode !== 'auto' || c.parts.length > 0 || c.spans.length > 0;
  });
  const lettersByHand = useApp((s) => s.analysis?.structure != null && lettersAreByHand(s.corrections));
  const loop = useApp((s) => (s.loop.enabled ? s.loop.region : null));
  const done = onDone ?? (() => {});
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;

  return (
    <>
      <h2 className="structure-forme" data-testid="structure-forme">
        {formText(st.form)}
      </h2>

      <div className="structure-mode" role="group" aria-label={t('structure.mode')} data-testid="structure-mode">
        <span className="libelle">{t('structure.mode')}</span>
        <span className="duo">
          {(['jazz', 'pop'] as const).map((m) => (
            <button key={m} aria-pressed={st.mode === m} data-testid={`structure-mode-${m}`} onClick={() => setStructureMode(m)}>
              {t(`structure.mode.${m}`)}
            </button>
          ))}
        </span>
        <button
          className="puce structure-auto"
          aria-pressed={handMode === 'auto'}
          title={handMode === 'auto' ? t('structure.mode.autoOn') : t('structure.mode.autoHint')}
          data-testid="structure-mode-auto"
          onClick={() => setStructureMode('auto')}
        >
          {t('structure.mode.auto')}
        </button>
      </div>

      <ul className="structure-affichages" data-testid="structure-affichages">
        <li>
          <button className="structure-affichage" aria-current={display.kind === 'full' || undefined} data-testid="structure-affichage-complet" onClick={() => { showFullChart(); done(); }}>
            {t('structure.display.full')}
          </button>
        </li>
        <li>
          <button className="structure-affichage" aria-current={display.kind === 'simplified' || undefined} data-testid="structure-affichage-simplifie" onClick={() => { showSimplifiedChart(); done(); }}>
            {t('structure.display.simplified')}
          </button>
        </li>
      </ul>

      <h3 className="libelle structure-titre">{t('structure.sections')}</h3>
      {st.parts.length === 0 ? (
        <p className="structure-vide" data-testid="structure-vide">
          {t('structure.none')}
        </p>
      ) : (
        <ul className="structure-parties" data-testid="structure-parties">
          {st.parts.map((p) => {
            const name = partName(p, t);
            const letters = p.letters.join('');
            const looped = loop !== null && same(loop.start, p.start) && same(loop.end, p.end);
            return (
              <li key={p.id} className="structure-partie" data-part={p.id} data-origine={p.origin} data-choisie={(display.kind === 'part' && display.id === p.id) || undefined} data-testid="structure-partie">
                <button className="structure-nom" aria-current={(display.kind === 'part' && display.id === p.id) || undefined} title={t('structure.partHint')} data-testid="structure-partie-nom" onClick={() => { showPart(p.id); done(); }}>
                  <span className="structure-nom-texte">{name}</span>
                  {letters && <span className="structure-lettres"> · {letters}</span>}
                </button>
                <button className="structure-boucle" aria-pressed={looped} aria-label={t('structure.loopHint', { name })} data-testid="structure-boucle" onClick={() => { loopPart(p.id); done(); }}>
                  {t('structure.loop')}
                </button>
                <button className="structure-crayon" aria-label={t('structure.edit', { name })} title={t('structure.edit', { name })} data-testid="structure-modifier" onClick={() => { openPartDialog(p.id); done(); }}>
                  <PencilIcon />
                </button>
                {p.origin === 'manual' && <span className="structure-main">{t('structure.byHand')}</span>}
              </li>
            );
          })}
        </ul>
      )}

      <div className="structure-actions">
        <button className="lien-encre" data-testid="structure-ajouter" onClick={() => { openAddPartDialog(); done(); }}>
          {t('structure.add')}
        </button>
        {byHand && (
          <button className="lien-encre" data-testid="structure-revenir" onClick={() => resetStructure()}>
            {t('structure.resetStructure')}
          </button>
        )}
        {lettersByHand && (
          <button className="lien-encre" data-testid="structure-lettres-revenir" onClick={() => resetSectionLetters()}>
            {t('structure.resetLetters')}
          </button>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- computer: the column

export function StructureColumn() {
  const root = useRef<HTMLElement>(null);
  usePlayingPart(root);
  return (
    <aside ref={root} className="structure" aria-label={t('structure.column')} data-testid="structure-colonne">
      <StructureList />
    </aside>
  );
}

// ---------------------------------------------------------------- phone: the bar and its sheet

const FOCUSABLE = 'button:not(:disabled)';

/** The quiet bar under the chart's title: « Forme globale : AABC · Thème 1 » and a chevron; a touch opens the sheet. */
export function StructureBar() {
  const st = useApp((s) => structureInForce(s));
  const display = useApp(selectChartDisplay);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button className="structure-barre" aria-expanded={open} aria-haspopup="dialog" aria-label={t('structure.phone.open')} data-testid="structure-barre" onClick={() => setOpen(true)}>
        <span className="structure-barre-texte">
          <strong>{formText(st.form)}</strong>
          <span> · {displayName(display, st.parts)}</span>
        </span>
        <ChevronIcon />
      </button>
      {open && <StructureSheet onClose={close} />}
    </>
  );
}

function StructureSheet({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  usePlayingPart(box);
  useEffect(() => {
    const first = box.current?.querySelector<HTMLElement>('[aria-current="true"], .structure-affichage');
    first?.focus({ preventScroll: true });
  }, []);
  return createPortal(
    <div
      className="structure-voile"
      data-testid="structure-voile"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={box}
        className="structure-feuille"
        role="dialog"
        aria-modal="true"
        aria-label={t('structure.sheet.title')}
        data-testid="structure-feuille"
        onKeyDown={(e) => {
          if (e.key === ' ' || e.code === 'Space') e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          } else if (e.key === 'Tab') {
            const items = [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
            const edge = e.shiftKey ? items[0] : items[items.length - 1];
            if (e.target === edge) {
              e.preventDefault();
              (e.shiftKey ? items[items.length - 1] : items[0])?.focus();
            }
          }
        }}
      >
        <div className="structure-feuille-tete">
          <span className="libelle">{t('structure.sheet.title')}</span>
          <button className="structure-fermer" aria-label={t('structure.sheet.close')} data-testid="structure-fermer" onClick={onClose}>
            <ChevronIcon />
          </button>
        </div>
        <StructureList onDone={onClose} />
      </div>
    </div>,
    document.body,
  );
}
