// PLACEHOLDER. The timeline module owns everything drawn along time in the
// Pistes view: ruler contents (tempo curve, chord names, bar numbers, loop
// band), waveforms, bar lines and sub-grid, loop veil, playhead, horizontal
// scroll and zoom (including « Auto » fitting and following the playhead),
// and pointer interactions (seek with snapping, bar selection for the loop,
// pinch on phones). This placeholder only lays out empty rows with the right
// heights so the shell can be built around it.
//
// Contract with the shell (see app/README.md):
//   - It fills the second column of `.plan`, inside the vertical scroller
//     `.travail` (passed as `scroller`). That scroller never scrolls
//     horizontally: horizontal scrolling must be virtual (draw the visible
//     time range on canvases sized to the viewport), which also keeps the
//     ruler sticky. A native horizontal scroll container here would break it.
//   - Ruler rows: `rulerRows()` from ./layout, the same list the header column
//     uses; each row is `height` px, the ruler has a 1 px bottom rule and must
//     stay sticky at top 0.
//   - Lanes: one per track, in store order, `view.trackHeight` px high
//     (CSS var --piste) including a 1 px bottom rule (--trait-fin).
//   - Reads from the store: tracks (role -> hue `var(--<role>)`, mute/solo for
//     the 22 % opacity), tempoMap, loop, view (pxPerSecond, auto, subdivision,
//     triplets, snap, follow), project.duration.
//   - Reads the playhead with `getEngine().getPosition()` in `useFrame()`.
//   - Writes through actions only: `seek()`, `setLoopRegion()`, `setZoom()`,
//     `setTrackHeight()`, `applyAutoFit()`. Waveform samples come from
//     `audio/registry.ts` (`getAudio(track.audio.id)`).

import type { CSSProperties, RefObject } from 'react';
import { useApp } from '../store/store';
import { rulerRows } from './layout';
import './timeline.css';

export interface TimelineProps {
  /** The vertical scroller that contains both columns. */
  scroller: RefObject<HTMLDivElement | null>;
}

export function Timeline(_props: TimelineProps) {
  const tracks = useApp((s) => s.tracks);
  const rows = rulerRows({ hasChords: false });
  return (
    <div className="frise" data-placeholder="timeline">
      <div className="frise-regle">
        {rows.map((r) => (
          <div key={r.id} className={`frise-rang ${r.id}`} style={{ height: r.height }} />
        ))}
      </div>
      {tracks.map((tr) => (
        <div
          key={tr.id}
          className={`frise-voie${tr.mute ? ' eteinte' : ''}`}
          data-track={tr.id}
          style={{ '--teinte': `var(--${tr.role})` } as CSSProperties}
        />
      ))}
    </div>
  );
}
