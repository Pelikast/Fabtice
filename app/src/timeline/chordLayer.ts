// The DOM of the ruler's chord row: one small element per label in view,
// moved with a transform. Elements are kept by key and reused, so while the
// view does not scroll nothing is created, destroyed or even touched; a
// scroll only moves the labels already there and creates or removes those that
// enter or leave. Labels are measured once per distinct markup in a hidden
// gauge that wears the same classes (`.frise-accord`), because the width of a
// chord depends on the music font, the triangle and the raised extensions.

export interface LabelEntry {
  key: string;
  /** `chordMarkup` of the chord. */
  html: string;
  /** Written smaller (a bar with several chords). */
  small: boolean;
  /** Size level of the whole row (`ROW_SIZES_PX`); a small label ignores it. */
  size: number;
  /** Left edge in pixels from the left of the view. */
  x: number;
}

interface Label {
  el: HTMLElement;
  html: string;
  small: boolean;
  size: number;
  x: number;
}

/** The classes of a label: the base look, the two-chord size, or the row's reduced size. */
const sizeClass = (small: boolean, size: number): string => (small ? ' deux' : size > 0 ? ` taille-${size}` : '');

export class ChordLayer {
  private readonly labels = new Map<string, Label>();
  private readonly gauge: HTMLElement;
  private readonly widths = new Map<string, number>();

  constructor(readonly host: HTMLElement) {
    this.gauge = document.createElement('div');
    this.gauge.className = 'frise-accord frise-jauge';
    this.gauge.setAttribute('aria-hidden', 'true');
    host.appendChild(this.gauge);
  }

  /** Width of a label in CSS pixels. */
  measure(html: string, small: boolean, size = 0): number {
    const key = `${small ? 's' : size}${html}`;
    let w = this.widths.get(key);
    if (w === undefined) {
      this.gauge.className = `frise-accord frise-jauge${sizeClass(small, size)}`;
      this.gauge.innerHTML = html;
      w = this.gauge.getBoundingClientRect().width;
      this.widths.set(key, w);
    }
    return w;
  }

  /** The font arrived or the context changed: measure again. */
  forgetWidths(): void {
    this.widths.clear();
  }

  /** Puts exactly these labels on screen. Returns how many elements were created and removed (for the tests). */
  render(entries: readonly LabelEntry[]): { created: number; removed: number } {
    let created = 0;
    let removed = 0;
    const seen = new Set<string>();
    for (const e of entries) {
      seen.add(e.key);
      let label = this.labels.get(e.key);
      if (!label) {
        const el = document.createElement('div');
        el.className = `frise-accord${sizeClass(e.small, e.size)}`;
        el.innerHTML = e.html;
        this.host.appendChild(el);
        label = { el, html: e.html, small: e.small, size: e.size, x: Number.NaN };
        this.labels.set(e.key, label);
        created++;
      } else {
        if (label.html !== e.html) {
          label.el.innerHTML = e.html;
          label.html = e.html;
        }
        if (label.small !== e.small || label.size !== e.size) {
          label.el.className = `frise-accord${sizeClass(e.small, e.size)}`;
          label.small = e.small;
          label.size = e.size;
        }
      }
      if (label.x !== e.x) {
        label.x = e.x;
        label.el.style.transform = `translate3d(${e.x}px,0,0)`;
      }
    }
    for (const [key, label] of this.labels) {
      if (seen.has(key)) continue;
      label.el.remove();
      this.labels.delete(key);
      removed++;
    }
    return { created, removed };
  }

  clear(): void {
    this.render([]);
  }

  get count(): number {
    return this.labels.size;
  }
}
