// A chord as an HTML string, for the ruler's chord row (drawn outside React).
// It is exactly the markup `<ChordSymbol>` renders (harmony/ChordSymbol.tsx),
// and `chordMarkup.test.ts` checks it against that component for every
// quality, so the row and the chart share the same classes (`styles/chords.css`)
// and therefore the same typography: triangle for the major 7, raised
// extensions, tight accidentals, « m » or « – », a quiet doubtful chord.

import { t } from '../i18n';
import { NO_CHORD_TEXT, type ChordParts } from '../harmony/chord';
import { displayChord, displayChordText, type DisplayContext } from '../harmony/display';
import { FLAT, SHARP, type NoteName } from '../harmony/pitch';
import type { ChordSymbol } from '../model/harmony';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
const escape = (text: string): string => text.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

/** Wraps every ♭ and ♯ in `.alt` (the music font), as `withAccidentals`. */
function accidentals(text: string): string {
  return text
    .split(/([♭♯])/)
    .map((p) => (p === FLAT || p === SHARP ? `<span class="alt">${p}</span>` : escape(p)))
    .join('');
}

function note(n: NoteName): string {
  return `${n.letter}${n.accidental === 0 ? '' : `<span class="alt">${n.accidental < 0 ? FLAT : SHARP}</span>`}`;
}

function triangle(): string {
  return (
    `<svg class="tri" viewBox="0 0 10 9" role="img" aria-label="${escape(t('chord.major7'))}">` +
    '<path d="M5 0.9 9.2 8.2H0.8z" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"></path></svg>'
  );
}

export function chordPartsMarkup(parts: ChordParts, className?: string, title?: string): string {
  const quality = parts.quality.map((q) => (q.kind === 'triangle' ? triangle() : `<span class="q">${accidentals(q.text)}</span>`)).join('');
  const extensions = parts.extensions.length > 0 ? `<span class="ext">${accidentals(parts.extensions.join(' '))}</span>` : '';
  const bass = parts.bass ? `<span class="ch-basse">/${note(parts.bass)}</span>` : '';
  const cls = className ? `ch ${className}` : 'ch';
  return `<span class="${cls}"${title === undefined ? '' : ` title="${escape(title)}"`}>${note(parts.root)}${quality}${extensions}${bass}</span>`;
}

/** The markup of `<ChordSymbol chord ctx doubtful />`. */
export function chordMarkup(chord: ChordSymbol | null, ctx: DisplayContext, doubtful: boolean): string {
  if (chord === null) return `<span class="ch sans-accord"><span class="q">${NO_CHORD_TEXT}</span></span>`;
  const { parts } = displayChord(chord, ctx);
  const title = doubtful ? t('chord.doubtful', { chord: displayChordText(chord, ctx) }) : undefined;
  return chordPartsMarkup(parts, doubtful ? 'douteux' : undefined, title);
}
