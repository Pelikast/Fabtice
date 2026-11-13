// Tiny translation helper. Only French exists; the structure is ready for
// English: add `en.ts` with the same keys and pick it in `setLanguage()`.

import { fr, type Messages } from './fr';

export type MessageKey = keyof Messages;
export type Language = 'fr';

const dictionaries: Record<Language, Messages> = { fr };
let current: Messages = fr;

export function setLanguage(language: Language): void {
  current = dictionaries[language];
  if (typeof document !== 'undefined') document.documentElement.lang = language;
}

/** Text for a key, with `{name}` placeholders replaced. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const text: string = current[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** Number in the interface language (« 118,4 »), at most `decimals` decimals. */
export function formatNumber(n: number, decimals = 1): string {
  return new Intl.NumberFormat(current['meta.locale'], { maximumFractionDigits: decimals, useGrouping: false }).format(n).replace('-', '−');
}

/** Decimal separator of the interface language. */
export function decimalSeparator(): string {
  return current['meta.decimal'];
}
