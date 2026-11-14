// <ChordSymbol>: one chord written as on a jazz chart, with exactly the markup
// of the mockup (`web/maquette/app.js#chordHTML`) and the styles of
// `styles/chords.css`:
//
//   <span class="ch">A<span class="alt">♭</span><svg class="tri">…</svg><span class="ext">13</span></span>
//
// The root is full size, the quality at 74 % (`.q`), the major 7 a triangle
// (`.tri`), extensions raised (`.ext`), ♭ and ♯ in the music font (`.alt`).
// A doubtful chord adds the class `douteux` (quiet: softer ink and a dotted
// rule, never the ember). The size comes from the parent's font-size.

import { Fragment, type ReactNode } from 'react';
import { t } from '../i18n';
import type { ChordSymbol as Chord } from '../model/harmony';
import { NO_CHORD_TEXT, type ChordParts } from './chord';
import { displayChord, displayChordText, type DisplayContext } from './display';
import { FLAT, SHARP, type NoteName } from './pitch';

/** Wraps every ♭ and ♯ of `text` in `.alt`, as the mockup's `accidentals()`. */
export function withAccidentals(text: string): ReactNode {
  const parts = text.split(/([♭♯])/);
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    p === FLAT || p === SHARP ? (
      <span key={i} className="alt">
        {p}
      </span>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

function Note({ note }: { note: NoteName }) {
  return (
    <>
      {note.letter}
      {note.accidental !== 0 && <span className="alt">{note.accidental < 0 ? FLAT : SHARP}</span>}
    </>
  );
}

/** The major-7 triangle of the mockup (stroke in the text colour). */
export function Triangle() {
  return (
    <svg className="tri" viewBox="0 0 10 9" role="img" aria-label={t('chord.major7')}>
      <path d="M5 0.9 9.2 8.2H0.8z" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
    </svg>
  );
}

/** Renders already computed parts (for callers that transposed themselves). */
export function ChordPartsView({ parts, className, title }: { parts: ChordParts; className?: string; title?: string }) {
  return (
    <span className={className ? `ch ${className}` : 'ch'} title={title}>
      <Note note={parts.root} />
      {parts.quality.map((q, i) =>
        q.kind === 'triangle' ? (
          <Triangle key={i} />
        ) : (
          <span key={i} className="q">
            {withAccidentals(q.text)}
          </span>
        ),
      )}
      {parts.extensions.length > 0 && <span className="ext">{withAccidentals(parts.extensions.join(' '))}</span>}
      {parts.bass && (
        <span className="ch-basse">
          /<Note note={parts.bass} />
        </span>
      )}
    </span>
  );
}

export interface ChordSymbolProps {
  /** The stored chord (concert pitch, original key); null for « N.C. ». */
  chord: Chord | null;
  /** Transposition, instrument, key and minor notation (`harmony/display.ts#displayContext`). */
  ctx: DisplayContext;
  /** Shown quietly as uncertain. */
  doubtful?: boolean;
}

export function ChordSymbol({ chord, ctx, doubtful = false }: ChordSymbolProps) {
  if (chord === null) {
    return (
      <span className="ch sans-accord">
        <span className="q">{NO_CHORD_TEXT}</span>
      </span>
    );
  }
  const { parts } = displayChord(chord, ctx);
  const title = doubtful ? t('chord.doubtful', { chord: displayChordText(chord, ctx) }) : undefined;
  return <ChordPartsView parts={parts} className={doubtful ? 'douteux' : undefined} title={title} />;
}
