import { useCallback, useRef } from 'react';
import { formatNumber, t } from '../i18n';
import { isTempoKnown, originalBpm } from '../store/derived';
import { closePanel, togglePanel } from '../store/actions';
import { selectHasChords } from '../store/chartSelectors';
import { useApp } from '../store/store';
import { rulerRows } from '../timeline/layout';
import { ChevronIcon } from '../ui/icons';
import { useOutsideClose } from '../ui/useOutsideClose';
import { GridPanel } from './GridPanel';

/** Left part of the sticky ruler: Tempo (opens the manual grid entry), [Accords], Mesures. */
export function RulerHeads() {
  const known = useApp((s) => isTempoKnown(s.tempoMap));
  const bpm = useApp((s) => originalBpm(s));
  const open = useApp((s) => s.ui.panel === 'grid');
  const hasChords = useApp(selectHasChords);
  const variable = useApp((s) => s.tempoMap.segments.length > 1);
  const hasProject = useApp((s) => s.project !== null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const refs = useRef([buttonRef, panelRef]).current;
  useOutsideClose(open, refs, useCallback(() => closePanel(), []));

  const label = known && bpm !== null ? t(variable ? 'ruler.tempoApprox' : 'ruler.tempoValue', { bpm: formatNumber(bpm, 1) }) : t('ruler.tempoUnset');
  return (
    <div className="regle-tetes">
      {rulerRows({ hasChords }).map((row) => {
        if (row.id === 'tempo') {
          return (
            <button
              key={row.id}
              ref={buttonRef}
              className="rang-tete tempo"
              aria-expanded={open}
              aria-haspopup="dialog"
              title={t('ruler.tempoEdit')}
              disabled={!hasProject}
              onClick={() => togglePanel('grid')}
            >
              <span className="texte">{label}</span>
              <ChevronIcon />
            </button>
          );
        }
        if (row.id === 'accords') return <ChordsHead key={row.id} />;
        return (
          <div key={row.id} className="rang-tete mesures">
            {t('ruler.bars')}
          </div>
        );
      })}
      {open && <GridPanel ref={panelRef} />}
    </div>
  );
}

/** Head of the chords row: rendered only once the project has chords (lot 2). */
export function ChordsHead() {
  return <div className="rang-tete accords">{t('ruler.chords')}</div>;
}
