// The DOM of the ruler's markers row (« Repères », lot 4): the sections as
// boxed letters on their bar line, the named loops as a short name over a
// brass thread that spans them. Each is a real button (click or keyboard:
// it recalls the marker). Elements are kept by key and only moved while
// scrolling, as in `chordLayer.ts`.

import type { Seconds } from '../model/project';

export interface MarkerEntry {
  key: string;
  kind: 'section' | 'loop';
  /** Section bar or loop id, given back on click. */
  ref: string;
  text: string;
  /** Accessible name and tooltip. */
  title: string;
  /** Left edge, pixels from the left of the view. */
  x: number;
  /** Named loops: width of the thread, pixels. */
  width: number;
  /** No room for the text: only the tab and the thread. */
  compact: boolean;
  /** It is the loop (or the section) set now. */
  current: boolean;
}

interface Item {
  el: HTMLButtonElement;
  sig: string;
  x: number;
}

/** Pixels kept between two labels of the row. */
const GAP_PX = 6;

export interface MarkerSpan {
  kind: 'section' | 'loop';
  ref: string;
  text: string;
  title: string;
  start: Seconds;
  end: Seconds;
  current: boolean;
}

/**
 * Places the markers in view: sections first (they are few and short), then
 * named loops by start time; a label that would run into the one before is
 * written compact. Pure, so it is tested without a DOM.
 */
export function placeMarkers(spans: readonly MarkerSpan[], t0: Seconds, pps: number, viewW: number, widthOf: (text: string, kind: 'section' | 'loop') => number): MarkerEntry[] {
  const out: MarkerEntry[] = [];
  const taken: [number, number][] = [];
  const free = (a: number, b: number) => taken.every(([x0, x1]) => b + GAP_PX <= x0 || a >= x1 + GAP_PX);
  const sorted = [...spans].sort((a, b) => (a.kind === b.kind ? a.start - b.start : a.kind === 'section' ? -1 : 1));
  for (const s of sorted) {
    const x = (s.start - t0) * pps + (s.kind === 'section' ? 3 : 0);
    const xe = (s.end - t0) * pps;
    if (xe < 0 || x > viewW) continue;
    const w = widthOf(s.text, s.kind);
    const compact = !free(x, x + w);
    taken.push([x, x + (compact ? 10 : w)]);
    out.push({ key: `${s.kind}:${s.ref}`, kind: s.kind, ref: s.ref, text: s.text, title: s.title, x, width: Math.max(0, xe - x), compact, current: s.current });
  }
  return out;
}

export class MarkerLayer {
  private readonly items = new Map<string, Item>();
  private readonly gauge: HTMLElement;
  private readonly widths = new Map<string, number>();

  constructor(
    readonly host: HTMLElement,
    private readonly onPick: (kind: 'section' | 'loop', ref: string) => void,
  ) {
    this.gauge = document.createElement('span');
    this.gauge.className = 'frise-repere frise-jauge';
    this.gauge.setAttribute('aria-hidden', 'true');
    host.appendChild(this.gauge);
  }

  measure(text: string, kind: 'section' | 'loop'): number {
    const key = `${kind}:${text}`;
    let w = this.widths.get(key);
    if (w === undefined) {
      this.gauge.className = `frise-repere frise-jauge ${kind}`;
      this.gauge.textContent = text;
      w = this.gauge.getBoundingClientRect().width;
      this.widths.set(key, w);
    }
    return w;
  }

  forgetWidths(): void {
    this.widths.clear();
  }

  render(entries: readonly MarkerEntry[]): void {
    const seen = new Set<string>();
    for (const e of entries) {
      seen.add(e.key);
      const sig = `${e.text}|${e.title}|${e.compact}|${e.current}|${Math.round(e.width)}`;
      let item = this.items.get(e.key);
      if (!item) {
        const el = document.createElement('button');
        el.type = 'button';
        el.addEventListener('click', () => this.onPick(e.kind, el.dataset.ref ?? ''));
        // the ruler's own gestures (seek, select) must not start under a marker
        el.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        this.host.appendChild(el);
        item = { el, sig: '', x: Number.NaN };
        this.items.set(e.key, item);
      }
      if (item.sig !== sig) {
        const el = item.el;
        el.className = `frise-repere ${e.kind}${e.compact ? ' compact' : ''}${e.current ? ' courant' : ''}`;
        el.dataset.ref = e.ref;
        el.dataset.kind = e.kind;
        el.textContent = e.compact ? '' : e.text;
        el.title = e.title;
        el.setAttribute('aria-label', e.title);
        if (e.current) el.setAttribute('aria-current', 'true');
        else el.removeAttribute('aria-current');
        el.style.setProperty('--fil', `${Math.round(e.width)}px`);
        item.sig = sig;
      }
      if (item.x !== e.x) {
        item.x = e.x;
        item.el.style.transform = `translate3d(${Math.round(e.x)}px,0,0)`;
      }
    }
    for (const [key, item] of this.items) {
      if (seen.has(key)) continue;
      item.el.remove();
      this.items.delete(key);
    }
  }

  get count(): number {
    return this.items.size;
  }
}
