// The bar menu: a right click (a long press on a touch screen, the context-menu
// key or Shift+F10 from the keyboard) on a bar of the ruler (« Pistes ») or of
// the chord chart opens it at that bar, with exactly the owner's two entries:
// « Corriger un changement de tempo indésirable » and « Réanalyser le tempo à
// partir de cette mesure », each with one calm line saying what it assumes;
// and, on a bar where such an action starts, « Revenir à l'analyse ».
// What they compute: `analysis/engine/tempoFix.ts`; how they are kept:
// `store/tempoFixActions.ts`.

import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import { runTempoFix } from '../analysis/runner';
import { formatBarNumber } from '../grid/format';
import { barStartTime, timeToBar } from '../grid/tempoMap';
import { t } from '../i18n';
import { useApp, type AppState } from '../store/store';
import { tempoFixAt, undoTempoFix } from '../store/tempoFixActions';
import { useOutsideClose } from '../ui/useOutsideClose';
import { closeTempoMenu, tempoMenuStore } from '../ui/tempoMenu';
import '../styles/tempoMenu.css';

const MARGIN = 8;

export function TempoFixMenu() {
  const at = useStore(tempoMenuStore, (s) => s.at);
  const hasAnalysis = useApp((s) => s.analysis !== null);
  const busy = useApp((s) => s.analysisRun.status === 'running');
  const fix = useApp((s) => (at ? tempoFixAt(s.corrections.tempoFixes, barStartTime(s.tempoMap, at.bar)) : null));
  const ref = useRef<HTMLDivElement>(null);
  const refs = useRef([ref]).current;
  useOutsideClose(at !== null, refs, useCallback(() => closeTempoMenu(), []));

  // Inside the window, near the point.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !at) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const x = Math.max(MARGIN, Math.min(at.x, window.innerWidth - w - MARGIN));
    const y = at.y + h + MARGIN > window.innerHeight ? Math.max(MARGIN, at.y - h) : at.y;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  }, [at]);

  useEffect(() => {
    if (!at) return;
    const close = () => closeTempoMenu();
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  }, [at]);

  if (!at) return null;
  const enabled = hasAnalysis && !busy;
  const note = !hasAnalysis ? t('tempoMenu.needsAnalysis') : busy ? t('tempoMenu.busy') : null;
  const run = (kind: 'continuity' | 'fresh') => {
    closeTempoMenu();
    void runTempoFix(kind, at.bar);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      closeTempoMenu();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
      next?.focus();
    }
  };
  return (
    <div
      ref={ref}
      className="fenetre menu-tempo"
      role="menu"
      aria-label={t('tempoMenu.label', { bar: formatBarNumber(at.bar) })}
      data-testid="menu-tempo"
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <p className="libelle">{t('tempoMenu.label', { bar: formatBarNumber(at.bar) })}</p>
      <button className="option" role="menuitem" data-action="continuity" disabled={!enabled} onClick={() => run('continuity')}>
        <span>{t('tempoMenu.continuity')}</span>
        <small>{t('tempoMenu.continuityHint')}</small>
      </button>
      <button className="option" role="menuitem" data-action="fresh" disabled={!enabled} onClick={() => run('fresh')}>
        <span>{t('tempoMenu.fresh')}</span>
        <small>{t('tempoMenu.freshHint')}</small>
      </button>
      {fix && (
        <button
          className="option retour"
          role="menuitem"
          data-action="undo"
          disabled={busy}
          onClick={() => {
            closeTempoMenu();
            undoTempoFix(fix.time);
          }}
        >
          <span>{t('tempoMenu.undo')}</span>
          <small>{t('tempoMenu.undoHint')}</small>
        </button>
      )}
      {note && <p className="menu-tempo-note">{note}</p>}
    </div>
  );
}

/** The bars where a manual tempo action starts, as bar indices of the grid in force (for the marks). */
export function tempoFixBars(s: Pick<AppState, 'tempoMap' | 'corrections'>): number[] {
  return s.corrections.tempoFixes.map((f) => timeToBar(s.tempoMap, f.time + 1e-4).bar);
}
