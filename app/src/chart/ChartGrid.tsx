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
import { tempoFixBars } from '../components/TempoFixMenu';
import { isMenuKey, openTempoMenu } from '../ui/tempoMenu';
import { displayChordText, type DisplayContext } from '../harmony/display';
import { t } from '../i18n';
import { selectBarContexts, selectDisplayContext } from '../store/chartSelectors';
import { useApp } from '../store/store';
import { ChordEditor } from './ChordEditor';
import { CLOSED, reduceEditor, startsChordSymbol, type EditorFocus, type OpenedBy } from './editor';
import { chartLines, loopBars, loopedPart, loopFromKey, loopKey, type ChartBar, type ChartLine } from './layout';
import { chordStops, moveStop, sameStop, stopKey, type Stop, type StopMove } from './stops';
import { useChartGestures } from './useChartGestures';
import { useFitChords } from './useFitChords';
import { useFollowLine } from './useFollowLine';
import { usePlayheadBar } from './usePlayheadBar';

const ARROWS: Record<string, StopMove> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Home: 'first', End: 'last' };

export function ChartGrid({ bars, scroller }: { bars: ChartBar[]; scroller: RefObject<HTMLElement | null> }) {
  const root = useRef<HTMLDivElement>(null);
  const ctx = useApp(selectDisplayContext);
  // C10: each bar spelled in the key of its passage (the same map while nothing it reads changes).
  const contexts = useApp(selectBarContexts);
  // As one string: a new object each time would re-render forever.
  const loopText = useApp((s) => loopKey(loopBars(s.tempoMap, s.loop.region, s.loop.enabled)));
  const loop = loopFromKey(loopText);
  const [editor, dispatch] = useReducer(reduceEditor, CLOSED);
  const [active, setActive] = useState<Stop | null>(null);

  const stops = useMemo(() => chordStops(bars), [bars]);
  // The one chord reachable with Tab (roving): the last one touched, or the first.
  const tabStop = (active && stops.find((s) => sameStop(s, active))) ?? (active && stops.find((s) => s.bar === active.bar)) ?? stops[0] ?? null;

  usePlayheadBar(root);
  // The chords are written where their beat is; a long symbol makes its bar's chords smaller (fit.ts).
  useFitChords(root, [bars, contexts]);
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
    onMenu: (bar, x, y) => {
      dispatch({ type: 'close' });
      openTempoMenu(bar, x, y, root.current?.querySelector<HTMLElement>(`[data-mesure="${bar}"] [data-stop]`) ?? null);
    },
  });
  // Bars where a manual tempo action starts: a discreet mark by their number (as one string: no re-render loop).
  const fixed = new Set(useApp((s) => tempoFixBars(s).join(',')).split(',').filter(Boolean).map(Number));

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
    if (isMenuKey(e)) {
      // The bar menu from the keyboard, under the focused chord.
      e.preventDefault();
      const r = el.getBoundingClientRect();
      openTempoMenu(here.bar, r.left, r.bottom, el);
      return;
    }
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
              ctx={contexts.get(b.bar) ?? ctx}
              looped={loopedPart(loop, b.bar)}
              final={b.bar === last}
              tempoFixed={fixed.has(b.bar)}
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
  looped,
  final,
  tabStop,
  editing,
  onFocusStop,
  onKeyboardOpen,
  tempoFixed,
}: {
  bar: ChartBar;
  /** A manual tempo action starts at this bar. */
  tempoFixed: boolean;
  ctx: DisplayContext;
  /** The part of the bar inside the loop, as fractions of its width (the whole bar: 0 to 1), or null. */
  looped: { from: number; to: number } | null;
  final: boolean;
  tabStop: Stop | null;
  /** Rank of the chord being edited in this bar, or null. */
  editing: number | null;
  onFocusStop: (stop: Stop) => void;
  onKeyboardOpen: (stop: Stop) => void;
}) {
  const n = bar.chords.length;
  const cls = ['case', bar.doubleBar ? 'double' : '', bar.signature ? 'signee' : '', looped ? (looped.from === 0 && looped.to === 1 ? 'dans-boucle' : 'dans-boucle partielle') : '', final ? 'finale' : ''].filter(Boolean).join(' ');
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
    <div
      className={cls}
      data-mesure={bar.bar}
      data-temps={n > 0 ? bar.beats : undefined}
      data-accords={n}
      role="group"
      aria-label={t('chart.bar', { n: label })}
      // A loop that starts or ends inside the bar veils that part only (styles/chart.css).
      style={looped && looped.to - looped.from < 1 ? ({ '--boucle-de': looped.from, '--boucle-a': looped.to } as CSSProperties) : undefined}
    >
      {bar.section && <span className="section">{bar.section}</span>}
      {/* The signature, written as on paper where it changes (C13). */}
      {bar.signature && (
        <span
          className="signature"
          data-signature={`${bar.signature.numerator}/${bar.signature.denominator}`}
          role="img"
          aria-label={t('chart.signature', { n: bar.signature.numerator, d: bar.signature.denominator })}
        >
          <span>{bar.signature.numerator}</span>
          <span>{bar.signature.denominator}</span>
        </span>
      )}
      <span className={tempoFixed ? 'numero tempo-corrige' : 'numero'} title={tempoFixed ? t('tempoMenu.mark', { bar: label }) : undefined}>
        {label}
      </span>
      {bar.chords.map((c, i) => (
        <button
          key={i}
          {...stopProps(i)}
          className={`accord-case${c.origin === 'manual' ? ' main' : ''}${editing === i ? ' edite' : ''}`}
          data-origine={c.origin}
          aria-label={t('chart.chordAria', { chord: displayChordText(c.chord, ctx), n: label })}
          // Every chord sits where its beat is: beat 3 of 4 in the middle of the bar, as in a Real Book.
          data-debut={c.beatInBar}
          data-rang={i % 2}
          style={{ '--debut': c.beatInBar / bar.beats } as CSSProperties}
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
