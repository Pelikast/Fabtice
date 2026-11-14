// The bars of the chart, four per line, and everything done on them:
//   - mouse and touch gestures (`useChartGestures`): click or tap a bar to move
//     the playhead, drag (or press and hold, then drag, on a touch screen) to
//     select bars as the loop, click or tap a chord to edit it;
//   - the keyboard: arrow keys go from chord to chord, Enter opens the editor,
//     typing a chord symbol replaces the chord, Escape closes;
//   - the sheet following the line being played (`useFollowLine`);
//   - the loop veil and the current-bar hairline, as before.

import { useCallback, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
import { formatBarNumber } from '../grid/format';
import { ChordSymbol } from '../harmony/ChordSymbol';
import { displayChordText, type DisplayContext } from '../harmony/display';
import { t } from '../i18n';
import { selectDisplayContext } from '../store/chartSelectors';
import { useApp } from '../store/store';
import { ChordEditor } from './ChordEditor';
import { CLOSED, reduceEditor, startsChordSymbol, type EditorFocus, type OpenedBy } from './editor';
import { chartLines, loopBars, type ChartBar, type ChartLine } from './layout';
import { chordStops, moveStop, sameStop, stopKey, type Stop, type StopMove } from './stops';
import { useChartGestures } from './useChartGestures';
import { useFollowLine } from './useFollowLine';
import { usePlayheadBar } from './usePlayheadBar';

const ARROWS: Record<string, StopMove> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Home: 'first', End: 'last' };

export function ChartGrid({ bars, scroller }: { bars: ChartBar[]; scroller: RefObject<HTMLElement | null> }) {
  const root = useRef<HTMLDivElement>(null);
  const ctx = useApp(selectDisplayContext);
  // As one string: a new object each time would re-render forever.
  const loopKey = useApp((s) => {
    const l = loopBars(s.tempoMap, s.loop.region, s.loop.enabled);
    return l ? `${l.first}:${l.last}` : '';
  });
  const loop = loopKey ? { first: Number(loopKey.split(':')[0]), last: Number(loopKey.split(':')[1]) } : null;
  const [editor, dispatch] = useReducer(reduceEditor, CLOSED);
  const [active, setActive] = useState<Stop | null>(null);

  const stops = useMemo(() => chordStops(bars), [bars]);
  // The one chord reachable with Tab (roving): the last one touched, or the first.
  const tabStop = (active && stops.find((s) => sameStop(s, active))) ?? (active && stops.find((s) => s.bar === active.bar)) ?? stops[0] ?? null;

  usePlayheadBar(root);
  const follow = useFollowLine(scroller, root);

  const focusStop = useCallback((stop: Stop) => {
    root.current?.querySelector<HTMLElement>(`[data-stop="${stopKey(stop)}"]`)?.focus({ preventScroll: false });
  }, []);

  const open = useCallback((stop: Stop, by: OpenedBy, focus?: EditorFocus, seed?: string) => {
    setActive(stop);
    dispatch({ type: 'open', stop, by, focus, seed });
  }, []);

  useChartGestures({
    grid: root,
    scroller,
    onEdit: (bar, index, focus, by) => open({ bar, index }, by, focus === 'section' ? 'section' : 'panel'),
    onSeek: follow.resume,
    onSelect: () => dispatch({ type: 'close' }),
  });

  const closeEditor = useCallback(
    (refocus: boolean) => {
      dispatch({ type: 'close' });
      if (refocus && editor.target) focusStop(editor.target);
    },
    [editor.target, focusStop],
  );

  const onTyped = useCallback(() => {
    const from = editor.target;
    dispatch({ type: 'close' });
    if (!from) return;
    // On to the next chord: typing a whole chart is a letter, a symbol, Enter, and again.
    const next = moveStop(bars, from, 'right');
    setActive(next);
    requestAnimationFrame(() => focusStop(next));
  }, [bars, editor.target, focusStop]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && editor.target && (e.target as HTMLElement).closest('[data-stop]')) {
      closeEditor(false);
      return;
    }
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-stop]');
    if (!el || e.ctrlKey || e.metaKey || e.altKey) return;
    const [barPart, indexPart] = el.dataset.stop!.split(':');
    const here: Stop = { bar: Number(barPart), index: Number(indexPart) };
    const move = ARROWS[e.key];
    if (move) {
      e.preventDefault();
      const next = moveStop(bars, here, move);
      setActive(next);
      focusStop(next);
      // With the editor open, it follows to the next chord.
      if (editor.target) dispatch({ type: 'open', stop: next, by: 'keyboard', focus: 'panel' });
      return;
    }
    if (startsChordSymbol(e.key)) {
      e.preventDefault();
      open(here, 'keyboard', 'field', e.key.toUpperCase());
    }
  };

  const lines: ChartLine[] = chartLines(bars);
  const last = bars[bars.length - 1]?.bar;
  return (
    <div className="grille" ref={root} data-testid="grille" role="group" aria-label={t('chart.gridLabel')} onKeyDown={onKeyDown}>
      {lines.map((line) => (
        <div key={line.bars[0]!.bar} className={`ligne${line.pickup ? ' levee' : ''}`}>
          {line.bars.map((b) => (
            <BarCell
              key={b.bar}
              bar={b}
              ctx={ctx}
              inLoop={loop !== null && b.bar >= loop.first && b.bar <= loop.last}
              final={b.bar === last}
              tabStop={tabStop}
              editing={editor.target?.bar === b.bar ? editor.target.index : null}
              onFocusStop={setActive}
              onKeyboardOpen={(stop) => open(stop, 'keyboard', 'field')}
            />
          ))}
        </div>
      ))}
      {editor.target && <ChordEditor key={editor.target.bar} state={editor} dispatch={dispatch} grid={root} scroller={scroller} onClose={closeEditor} onTyped={onTyped} />}
    </div>
  );
}

function BarCell({
  bar,
  ctx,
  inLoop,
  final,
  tabStop,
  editing,
  onFocusStop,
  onKeyboardOpen,
}: {
  bar: ChartBar;
  ctx: DisplayContext;
  inLoop: boolean;
  final: boolean;
  tabStop: Stop | null;
  /** Rank of the chord being edited in this bar, or null. */
  editing: number | null;
  onFocusStop: (stop: Stop) => void;
  onKeyboardOpen: (stop: Stop) => void;
}) {
  const n = bar.chords.length;
  const cls = ['case', n === 2 ? 'deux' : n > 2 ? 'trois' : '', bar.doubleBar ? 'double' : '', inLoop ? 'dans-boucle' : '', final ? 'finale' : '']
    .filter(Boolean)
    .join(' ');
  const label = formatBarNumber(bar.bar);
  const stopProps = (index: number) => {
    const stop = { bar: bar.bar, index };
    return {
      type: 'button' as const,
      'data-stop': stopKey(stop),
      'data-accord': index,
      tabIndex: sameStop(tabStop, stop) ? 0 : -1,
      'aria-haspopup': 'dialog' as const,
      onFocus: () => onFocusStop(stop),
      // A click from the keyboard (Enter); mouse and touch go through the gestures.
      onClick: (e: React.MouseEvent) => {
        if (e.detail === 0) onKeyboardOpen(stop);
      },
    };
  };
  return (
    <div className={cls} data-mesure={bar.bar} role="group" aria-label={t('chart.bar', { n: label })}>
      {bar.section && <span className="section">{bar.section}</span>}
      <span className="numero">{label}</span>
      {bar.chords.map((c, i) => (
        <button
          key={i}
          {...stopProps(i)}
          className={`accord-case${c.origin === 'manual' ? ' main' : ''}${editing === i ? ' edite' : ''}`}
          data-origine={c.origin}
          aria-label={t('chart.chordAria', { chord: displayChordText(c.chord, ctx), n: label })}
          // A chord that does not start on the bar line sits where its beat is.
          style={i === 0 && c.beatInBar > 0 ? ({ '--debut': c.beatInBar / bar.beats } as CSSProperties) : undefined}
        >
          <ChordSymbol chord={c.chord} ctx={ctx} doubtful={c.doubtful} />
        </button>
      ))}
      {n === 0 && (
        <button
          {...stopProps(-1)}
          className={`accord-case libre${bar.repeat ? ' repetition' : ''}${editing === -1 ? ' edite' : ''}`}
          aria-label={t('chart.chordArea', { n: label })}
        >
          {bar.repeat && (
            <span className="repete" role="img" aria-label={t('chord.repeat')}>
              𝄎
            </span>
          )}
        </button>
      )}
    </div>
  );
}
