// The timeline of the « Pistes » view: everything drawn along time.
//
// Contract with the shell (see app/README.md):
//   - It fills the second column of `.plan`, inside the vertical scroller
//     `.travail` (passed as `scroller`). That scroller never scrolls
//     horizontally: the horizontal scroll is virtual (`controller.ts` draws
//     the visible time range on canvases as big as the viewport), which also
//     keeps the ruler sticky.
//   - Ruler rows: `rulerRows()` from ./layout, the same list the header column
//     uses; the ruler has a 1 px bottom rule and stays sticky at top 0.
//   - Lanes: one per track, in store order, `view.trackHeight` px high
//     (CSS var --piste) including a 1 px bottom rule (--trait-fin).
//
// React renders only this skeleton. Canvases, loop band and veil, playhead and
// scrollbar are driven by `TimelineController`, outside React.

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { t } from '../i18n';
import { useApp } from '../store/store';
import { TimelineController } from './controller';
import { rulerRows } from './layout';
import './timeline.css';

export interface TimelineProps {
  /** The vertical scroller that contains both columns. */
  scroller: RefObject<HTMLDivElement | null>;
}

export function Timeline({ scroller }: TimelineProps) {
  // « id:role:dimmed » of each lane, as one string so a volume change does not render.
  const lanesKey = useApp((s) => {
    const anySolo = s.tracks.some((tr) => tr.solo);
    return s.tracks.map((tr) => `${tr.id}:${tr.role}:${(anySolo ? !tr.solo : tr.mute) ? 1 : 0}`).join(',');
  });
  const root = useRef<HTMLDivElement>(null);
  const controller = useRef<TimelineController | null>(null);
  const rows = rulerRows({ hasChords: false });
  const lanes = lanesKey ? lanesKey.split(',').map((entry) => entry.split(':') as [string, string, string]) : [];

  useLayoutEffect(() => {
    // A parent's ref is not attached yet when a child's layout effect runs: fall back on the DOM.
    const scrolling = scroller.current ?? root.current?.closest<HTMLElement>('.travail') ?? null;
    if (!root.current || !scrolling) return;
    const c = new TimelineController(root.current, scrolling);
    controller.current = c;
    return () => {
      c.dispose();
      controller.current = null;
    };
  }, [scroller]);

  // Lanes added, removed or re-ordered.
  const ids = lanes.map((l) => l[0]).join(',');
  useEffect(() => {
    controller.current?.lanesChanged();
  }, [ids]);

  return (
    <div className="frise" ref={root} role="group" aria-label={t('timeline.label')}>
      <div className="frise-regle">
        {rows.map((r) => (
          <div key={r.id} className={`frise-rang ${r.id}`} style={{ height: r.height }}>
            {r.id === 'mesures' && <div className="frise-bande" hidden />}
          </div>
        ))}
        <canvas className="frise-regle-toile" aria-hidden="true" />
        <div className="frise-lecture" aria-hidden="true" />
      </div>
      <div className="frise-corps">
        <canvas className="frise-grille" aria-hidden="true" />
        <div className="frise-voies">
          {lanes.map(([id, role, dimmed]) => (
            <div
              key={id}
              className={`frise-voie${dimmed === '1' ? ' eteinte' : ''}`}
              data-track={id}
              style={{ '--teinte': `var(--${role})` } as CSSProperties}
            >
              <canvas aria-hidden="true" />
            </div>
          ))}
        </div>
        <div className="frise-voile" hidden />
        <div className="frise-lecture" aria-hidden="true" />
      </div>
      <div className="frise-defile inutile" role="scrollbar" aria-orientation="horizontal" aria-label={t('timeline.scrollbar')} tabIndex={-1}>
        <div className="frise-pouce" />
      </div>
    </div>
  );
}
