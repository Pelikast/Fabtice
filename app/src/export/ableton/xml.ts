// A small XML tree and the serializer for Ableton Live documents.
//
// Live writes its documents pretty-printed with tabs, one element per line,
// attributes in double quotes and empty elements as `<Tag Attr="v" />` (with a
// space before the slash). Values Live reads as numbers are written the way
// Live writes them: whole numbers without a decimal point, no exponent.
// See ALS-FORMAT.md.

export interface XmlElement {
  tag: string;
  /** Attributes, in the order they are written. */
  attrs: [string, string][];
  children: XmlElement[];
}

export type AttrValue = string | number | boolean;

/** An element; attributes are written in the order of the object's keys. */
export function el(tag: string, attrs: Record<string, AttrValue> | null = null, children: (XmlElement | null | false)[] = []): XmlElement {
  return {
    tag,
    attrs: attrs ? Object.entries(attrs).map(([k, v]) => [k, attrText(v)]) : [],
    children: children.filter((c): c is XmlElement => !!c),
  };
}

/** `<Tag Value="v" />`, the shape of every plain setting in a Live document. */
export function v(tag: string, value: AttrValue): XmlElement {
  return el(tag, { Value: value });
}

/** An attribute value as Live writes it. */
export function attrText(value: AttrValue): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return num(value);
  return value;
}

/**
 * A double as Live writes it: shortest text that reads back to the same
 * number, whole numbers without a decimal point, never an exponent.
 */
export function num(x: number): string {
  if (!Number.isFinite(x)) throw new RangeError(`not a finite number: ${x}`);
  if (Object.is(x, -0) || x === 0) return '0';
  const s = String(x);
  if (!/e/i.test(s)) return s;
  // Exponent form (|x| < 1e-6 or >= 1e21): plain decimals instead.
  if (Math.abs(x) >= 1e21) throw new RangeError(`number too large for a Live document: ${x}`);
  return x.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * A 32-bit float (Live's `Float` members, such as an automation point's value)
 * as the shortest text that reads back to the same float32.
 */
export function float32(x: number): string {
  const f = Math.fround(x);
  if (!Number.isFinite(f)) throw new RangeError(`not a finite float32: ${x}`);
  for (let p = 1; p <= 9; p++) {
    const s = Number(f.toPrecision(p));
    if (Math.fround(s) === f) return num(s);
  }
  return num(f);
}

// Characters XML 1.0 forbids, and the ones Live would read wrongly unescaped.
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;

export function escapeAttr(text: string): string {
  return text
    .replace(FORBIDDEN, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;')
    .replace(/\n/g, '&#xA;')
    .replace(/\r/g, '&#xD;');
}

/** The element and its descendants, pretty-printed with tabs from `depth`. */
export function serialize(root: XmlElement, depth = 0): string {
  const out: string[] = [];
  const write = (e: XmlElement, d: number) => {
    const pad = '\t'.repeat(d);
    const attrs = e.attrs.map(([k, val]) => ` ${k}="${escapeAttr(val)}"`).join('');
    if (e.children.length === 0) {
      out.push(`${pad}<${e.tag}${attrs} />`);
      return;
    }
    out.push(`${pad}<${e.tag}${attrs}>`);
    for (const c of e.children) write(c, d + 1);
    out.push(`${pad}</${e.tag}>`);
  };
  write(root, depth);
  return out.join('\n');
}

/** Every element of the tree, depth first (the root included). */
export function* walk(root: XmlElement): Generator<XmlElement> {
  yield root;
  for (const c of root.children) yield* walk(c);
}
