// « Grille complète simplifiée » on screen (C14): the form line (« Forme : Intro, Thème 1 (AABC), Solo (Piano)
// (AABC)… »), then one block per written section (its heading, its bars four to a line in the chart's own language, a
// repeat bracket and « ×2 » where the passage is played twice in a row, « % » for a bar that goes on, a double bar
// at the very end). The bars carry no number: a written bar stands for several played bars.
//
// It follows the audio (`useWrittenPlayhead`: the written bar that is playing is filled by the ember hairline, its
// block says which time it is), a click on a written bar goes to its NEXT occurrence, a drag selects the played bars of
// the next occurrence when they follow one another. What acts on played bars (the chord editor, the bar menu, the
// modulation window) is not opened from here: « Affichage complet » is where the chart is corrected, said once in a quiet
// line under the form line.
//
// The cells are the full chart's own (`.case`, `.accord-case`, `ChordSymbol`, the fit of `useFitChords`): same look,
// one size for the whole chart.

import { useCallback, useMemo, useRef, type CSSProperties, type RefObject } from 'react';
import { getEngine } from '../audio';
import { barStartTime } from '../grid/tempoMap';
import { loopFromBars } from '../grid/lines';
import { ChordSymbol, withAccidentals } from '../harmony/ChordSymbol';
import { displayChordText } from '../harmony/display';
import { keyLabel } from '../harmony/key';
import { t } from '../i18n';
import { PART_TYPE_KEYS, partName } from '../model/structureLabels';
import { seek, setLoopRegion } from '../store/actions';
import { selectBarContexts, selectDisplayContext } from '../store/chartSelectors';
import { appStore, useApp } from '../store/store';
import { structureInForce } from '../store/structureSelectors';
import type { SimplifiedChart, WrittenBar } from '../structure';
import { barProgress, loopBars, loopedPart, loopFromKey, loopKey } from './layout';
import { formItems, headingLetterText, lastWrittenIndex, loopRange, placeOf, playedInside, seekTarget, writtenBlocks, type WrittenBlock, type WrittenLine } from './simplifiedLayout';
import { useChartGestures, type WrittenGestures } from './useChartGestures';
import { useFitChords } from './useFitChords';
import { useFollowLine } from './useFollowLine';
import { useWrittenPlayhead } from './useWrittenPlayhead';

export function SimplifiedGrid({ chart, scroller }: { chart: SimplifiedChart; scroller: RefObject<HTMLElement | null> }) {
  const root = useRef<HTMLDivElement>(null);
  const ctx = useApp(selectDisplayContext);
  // C10: each bar spelled in the key of its passage.
  const contexts = useApp(selectBarContexts);
  const loopText = useApp((s) => loopKey(loopBars(s.tempoMap, s.loop.region, s.loop.enabled)));
  const loop = loopFromKey(loopText);
  const blocks = useMemo(() => writtenBlocks(chart), [chart]);
  const last = lastWrittenIndex(chart);

  useWrittenPlayhead(root, chart);
  // One size for every chord of the whole simplified chart (chart/fit.ts, measured on screen).
  useFitChords(root, [chart, contexts]);
  const target = useCallback(
    (bar: number) => {
      const place = placeOf(chart, bar);
      return place ? { key: place.written, selector: `[data-ecrite="${place.written}"]` } : null;
    },
    [chart],
  );
  const follow = useFollowLine(scroller, root, target);

  // Where the playhead was when a gesture began: the next occurrence is taken from there for the whole gesture.
  const from = useRef(0);
  const gestures = useMemo<WrittenGestures>(
    () => ({
      begin: () => {
        const s = appStore.getState();
        from.current = barProgress(s.tempoMap, getEngine().getPosition()).bar;
      },
      seek: (written) => {
        const played = seekTarget(chart, written, from.current);
        if (played !== null) seek(Math.max(0, barStartTime(appStore.getState().tempoMap, played)));
      },
      select: (a, b) => {
        const range = loopRange(chart, a, b, from.current);
        if (!range) return false;
        setLoopRegion(loopFromBars(appStore.getState().tempoMap, range.first, range.last));
        return true;
      },
    }),
    [chart],
  );
  useChartGestures({ grid: root, scroller, onEdit: noop, onSeek: follow.resume, written: gestures });

  return (
    <>
      <FormLine chart={chart} onGo={follow.resume} />
      <p className="ecrite-aide" data-testid="ecrite-aide">
        {t('simplified.help')}
      </p>
      <div className="grille grille-ecrite" ref={root} data-testid="grille-simplifiee" role="group" aria-label={t('simplified.label')}>
        {blocks.map((block) => (
          <Block key={block.section.id} block={block} chart={chart} contexts={contexts} fallback={ctx} loop={loop} last={last} />
        ))}
      </div>
    </>
  );
}

const noop = () => {};

/** « Forme : Intro, Thème 1 (AABC), … » — each entry takes the playhead to the start of its part. */
function FormLine({ chart, onGo }: { chart: SimplifiedChart; onGo: () => void }) {
  const parts = useApp((s) => structureInForce(s).parts);
  const items = formItems(chart.form, parts, (p) => partName(p, t));
  if (items.length === 0) return null;
  return (
    <p className="ecrite-forme" data-testid="ecrite-forme">
      <span className="forme-mot">{t('simplified.form')}</span>{' '}
      {items.map((item, i) => (
        <span key={`${item.partId}:${i}`}>
          {i > 0 && ', '}
          <button
            type="button"
            className="forme-partie"
            data-partie={item.partId}
            title={t('simplified.formGo', { name: item.text })}
            onClick={() => {
              const part = structureInForce(appStore.getState()).parts.find((p) => p.id === item.partId);
              if (!part) return;
              seek(part.start);
              onGo();
            }}
          >
            {item.text}
          </button>
        </span>
      ))}
    </p>
  );
}

function Block({ block, chart, contexts, fallback, loop, last }: { block: WrittenBlock; chart: SimplifiedChart; contexts: ReturnType<typeof selectBarContexts>; fallback: ReturnType<typeof selectDisplayContext>; loop: ReturnType<typeof loopFromKey>; last: number }) {
  const { heading, times } = block;
  const name = heading.kind === 'letter' ? headingLetterText(heading) : t(PART_TYPE_KEYS[heading.part]);
  return (
    <section className="bloc" data-bloc={block.section.id} data-times={times} data-testid="bloc" aria-label={t('simplified.section', { name })}>
      <header className="bloc-tete">
        {heading.kind === 'letter' ? (
          <span className="bloc-lettre" data-testid="bloc-titre">
            {name}
          </span>
        ) : (
          <span className="bloc-nom" data-testid="bloc-titre">
            {name}
          </span>
        )}
        <span className="bloc-fois" data-testid="ecrite-fois" />
      </header>
      {block.lines.map((line, i) => (
        <Line key={i} line={line} times={times} chart={chart} contexts={contexts} fallback={fallback} loop={loop} last={last} />
      ))}
    </section>
  );
}

function Line({ line, times, chart, contexts, fallback, loop, last }: { line: WrittenLine; times: number; chart: SimplifiedChart; contexts: ReturnType<typeof selectBarContexts>; fallback: ReturnType<typeof selectDisplayContext>; loop: ReturnType<typeof loopFromKey>; last: number }) {
  return (
    <div className="ligne ligne-ecrite">
      {line.bars.map((bar, k) => (
        <WrittenCell
          key={bar.index}
          bar={bar}
          ctx={contexts.get(bar.played[0] ?? -1) ?? fallback}
          loop={loop}
          opens={times > 1 && line.first && k === 0}
          closes={times > 1 && line.last && k === line.bars.length - 1}
          times={times}
          final={bar.index === last}
          passes={chart.places.get(bar.played[0] ?? -1)?.passes ?? bar.played.length}
        />
      ))}
    </div>
  );
}

function WrittenCell({ bar, ctx, loop, opens, closes, times, final, passes }: { bar: WrittenBar; ctx: ReturnType<typeof selectDisplayContext>; loop: ReturnType<typeof loopFromKey>; opens: boolean; closes: boolean; times: number; final: boolean; passes: number }) {
  const n = bar.chords.length;
  // The loop veil: the bar is veiled when one of the played bars it stands for is inside the loop.
  const inside = loop ? playedInside(bar.played, loop.first, loop.last) : null;
  const looped = loop && inside !== null ? loopedPart(loop, inside) : null;
  const cls = ['case', 'ecrite-case', bar.signature ? 'signee' : '', bar.keyChange ? 'modulee' : '', opens ? 'rep-ouvre' : '', closes ? 'rep-clot' : '', final && !closes ? 'finale-ecrite' : '', looped ? (looped.from === 0 && looped.to === 1 ? 'dans-boucle' : 'dans-boucle partielle') : '']
    .filter(Boolean)
    .join(' ');
  const key = bar.keyChange ? keyLabel(ctx.key ?? bar.keyChange, ctx.minor) : '';
  return (
    <div
      className={cls}
      data-ecrite={bar.index}
      data-temps={n > 0 ? bar.beats : undefined}
      data-accords={n}
      data-jouee-fois={passes}
      role="group"
      aria-label={passes > 1 ? t('simplified.bar', { n: passes }) : t('simplified.barOnce')}
      style={looped && looped.to - looped.from < 1 ? ({ '--boucle-de': looped.from, '--boucle-a': looped.to } as CSSProperties) : undefined}
    >
      {opens && <i className="rep rep-debut" aria-label={t('simplified.repeatStart')} role="img" />}
      {bar.keyChange && (
        // C10: the new key, quiet, above the bar (nothing opens from here: the mark is only read).
        <div className="case-tete">
          <span className="modulation modulation-lue" data-cle={key}>
            <span className="modulation-mot">{t('modulation.label')}</span>{' '}
            <span className="modulation-cle">{withAccidentals(key)}</span>
          </span>
        </div>
      )}
      {bar.signature && (
        <span className="signature" data-signature={`${bar.signature.numerator}/${bar.signature.denominator}`} role="img" aria-label={t('chart.signature', { n: bar.signature.numerator, d: bar.signature.denominator })}>
          <span>{bar.signature.numerator}</span>
          <span>{bar.signature.denominator}</span>
        </span>
      )}
      {bar.chords.map((c, i) => (
        <span
          key={i}
          className="accord-case lue"
          data-debut={c.beat}
          data-rang={i % 2}
          aria-label={displayChordText(c.chord, ctx)}
          style={{ '--debut': c.beat / bar.beats } as CSSProperties}
        >
          <ChordSymbol chord={c.chord} ctx={ctx} />
        </span>
      ))}
      {n === 0 && bar.simile && (
        <span className="accord-case libre lue repetition">
          <span className="repete" role="img" aria-label={t('chord.repeat')}>
            𝄎
          </span>
        </span>
      )}
      {closes && (
        <>
          <i className="rep rep-ferme" aria-label={t('simplified.repeatEnd')} role="img" />
          <span className="rep-fois" data-testid="ecrite-fois-n" aria-label={t('simplified.timesAria', { n: times })}>
            {t('simplified.times', { n: times })}
          </span>
        </>
      )}
      {final && !closes && <i className="rep rep-final" aria-hidden="true" />}
    </div>
  );
}
