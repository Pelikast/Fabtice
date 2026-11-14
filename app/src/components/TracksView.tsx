import { useRef, type CSSProperties } from 'react';
import { useApp } from '../store/store';
import { Timeline } from '../timeline';
import { RulerHeads } from './RulerHeads';
import { SeparationEntry } from './SeparationPanel';
import { ToolsBar } from './ToolsBar';
import { TrackHeader } from './TrackHeader';

/** « Pistes »: header column on the left, the timeline on the right, tools at the bottom right. */
export function TracksView() {
  const tracks = useApp((s) => s.tracks);
  const trackHeight = useApp((s) => s.view.trackHeight);
  const scroller = useRef<HTMLDivElement>(null);
  const anySolo = tracks.some((tr) => tr.solo);
  return (
    <>
      <div className="vue travail" ref={scroller} style={{ '--piste': `${trackHeight}px` } as CSSProperties}>
        <div className="plan">
          <div className="tetes">
            <RulerHeads />
            {tracks.map((tr) => (
              <TrackHeader key={tr.id} track={tr} silenced={anySolo ? !tr.solo : tr.mute} />
            ))}
            <SeparationEntry />
          </div>
          <Timeline scroller={scroller} />
        </div>
      </div>
      <ToolsBar />
    </>
  );
}
