// What the check step of « Correction de la courbe en tapant le tempo » says about the way the user tapped, in
// one calm line of simple French (nothing technical): the usual advance or delay when it is 30 ms or more (it is
// compensated), and the beats forgotten (added) or taps in excess (set aside). Null when there is nothing to say.

import type { TapsReading } from '../analysis/tapFix';
import { t } from '../i18n';

/** An advance or a delay smaller than this is not worth saying (s). */
export const OFFSET_SAID = 0.03;

export function tapsReadingText(reading: Pick<TapsReading, 'offset' | 'filled' | 'dropped'>): string | null {
  const parts: string[] = [];
  if (Math.abs(reading.offset) >= OFFSET_SAID) {
    parts.push(t(reading.offset < 0 ? 'tapFix.reading.before' : 'tapFix.reading.after', { ms: Math.round(Math.abs(reading.offset) * 1000) }));
  }
  const excess: string[] = [];
  if (reading.filled > 0) excess.push(reading.filled === 1 ? t('tapFix.reading.filled.one') : t('tapFix.reading.filled.many', { n: reading.filled }));
  if (reading.dropped > 0) excess.push(reading.dropped === 1 ? t('tapFix.reading.dropped.one') : t('tapFix.reading.dropped.many', { n: reading.dropped }));
  if (excess.length > 0) {
    const text = `${excess.join(', ')}.`;
    parts.push(text.charAt(0).toUpperCase() + text.slice(1));
  }
  return parts.length > 0 ? parts.join(' ') : null;
}
