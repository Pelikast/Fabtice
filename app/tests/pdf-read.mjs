// A small reader for the PDFs Chromium writes (Skia/PDF): the number of pages, the
// size of each and the text of each, with no poppler (the Macs of the build have
// none). It reads what Chromium produces and nothing more: objects in the clear,
// FlateDecode streams, fonts with a ToUnicode map, text drawn with Tj and TJ.
//
//   const pages = readPdf(fs.readFileSync(file));
//   pages.length, pages[0].size ([w, h] in points), pages[0].text
//
// `sameCharacters(a, b)` compares the text of a sheet in the page with the text of
// its PDF page: the same characters, whatever their order and the spaces (the
// accidentals, drawn with a stroke, are written twice in a PDF: only whether
// each one is there counts).

import zlib from 'node:zlib';

const OBJECT = /(\d+) (\d+) obj\b([\s\S]*?)\bendobj/g;

/** `<hex>` as the UTF-16BE text of a ToUnicode destination. */
function utf16(hex) {
  let out = '';
  for (let i = 0; i + 3 < hex.length + 1; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return out;
}

/** The map of a ToUnicode stream: character code to text, and the length in bytes of a code. */
function parseCMap(text) {
  const map = new Map();
  let codeBytes = 1;
  const space = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(text);
  if (space) codeBytes = space[1].length / 2;
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(m[1], 16), utf16(m[2]));
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([^\]]*)\])/g)) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      if (m[3] !== undefined) {
        const start = utf16(m[3]);
        for (let c = lo; c <= hi; c++) map.set(c, start.slice(0, -1) + String.fromCharCode(start.charCodeAt(start.length - 1) + (c - lo)));
      } else {
        [...m[4].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((d, k) => map.set(lo + k, utf16(d[1])));
      }
    }
  }
  return { map, codeBytes };
}

/** The decoded stream of an object body, or null. */
function streamOf(body) {
  const at = body.indexOf('stream');
  if (at < 0) return null;
  let start = at + 'stream'.length;
  if (body[start] === '\r') start++;
  if (body[start] === '\n') start++;
  const end = body.lastIndexOf('endstream');
  const raw = Buffer.from(body.slice(start, end), 'latin1');
  const dict = body.slice(0, at);
  if (/\/FlateDecode/.test(dict)) {
    try {
      return zlib.inflateSync(raw).toString('latin1');
    } catch {
      return zlib.inflateSync(raw.subarray(0, raw.length - 1)).toString('latin1');
    }
  }
  return raw.toString('latin1');
}

/** The text a content stream draws, with each font's own map; a form XObject (`Do`: what Chromium makes of a scaled box) is read where it is drawn. */
function textOfContent(content, res, nested) {
  const { fonts, xobjects } = res;
  let out = '';
  let font = null;
  const show = (hex) => {
    if (!font) return;
    const bytes = font.codeBytes;
    for (let i = 0; i + bytes * 2 <= hex.length; i += bytes * 2) out += font.map.get(parseInt(hex.slice(i, i + bytes * 2), 16)) ?? '';
  };
  const token = /\/(\w+)\s+-?[\d.]+\s+Tf|<([0-9a-fA-F]*)>\s*Tj|\[((?:<[0-9a-fA-F]*>|[^\]<])*)\]\s*TJ|\/(\w+)\s+Do\b|\bET\b/g;
  for (const m of content.matchAll(token)) {
    if (m[4] !== undefined) out += ` ${nested(xobjects.get(m[4]))} `;
    else if (m[1] !== undefined) font = fonts.get(m[1]) ?? null;
    else if (m[2] !== undefined) show(m[2]);
    else if (m[3] !== undefined) for (const h of m[3].matchAll(/<([0-9a-fA-F]*)>/g)) show(h[1]);
    else out += ' ';
  }
  return out;
}

export function readPdf(buffer) {
  const file = buffer.toString('latin1');
  const objects = new Map();
  for (const m of file.matchAll(OBJECT)) objects.set(Number(m[1]), m[3]);
  const cmaps = new Map();
  const cmapOf = (id) => {
    if (!cmaps.has(id)) cmaps.set(id, parseCMap(streamOf(objects.get(id) ?? '') ?? ''));
    return cmaps.get(id);
  };
  // The pages in the order of the page tree's /Kids (the page objects are `/Type /Page`, never `/Pages`).
  const pageIds = [];
  const walk = (id) => {
    const body = objects.get(id) ?? '';
    if (/\/Type\s*\/Pages\b/.test(body)) {
      const kids = /\/Kids\s*\[([^\]]*)\]/.exec(body);
      for (const k of kids?.[1].matchAll(/(\d+) 0 R/g) ?? []) walk(Number(k[1]));
    } else if (/\/Type\s*\/Page(?![s\w])/.test(body)) pageIds.push(id);
  };
  for (const body of objects.values()) {
    const root = /\/Type\s*\/Catalog\b[\s\S]*?\/Pages\s+(\d+) 0 R/.exec(body);
    if (root) walk(Number(root[1]));
  }
  /** The fonts (by their name in the stream) and form XObjects a dictionary lists, on top of what the caller already had (a form without a font list of its own uses the page's). */
  const resourcesOf = (dict, parent = { fonts: new Map(), xobjects: new Map() }) => {
    const fonts = new Map(parent.fonts);
    for (const f of (/\/Font\s*<<([\s\S]*?)>>/.exec(dict)?.[1] ?? '').matchAll(/\/(\w+)\s+(\d+) 0 R/g)) {
      const unicode = /\/ToUnicode\s+(\d+) 0 R/.exec(objects.get(Number(f[2])) ?? '');
      if (unicode) fonts.set(f[1], cmapOf(Number(unicode[1])));
    }
    const xobjects = new Map(parent.xobjects);
    for (const x of (/\/XObject\s*<<([\s\S]*?)>>/.exec(dict)?.[1] ?? '').matchAll(/\/(\w+)\s+(\d+) 0 R/g)) xobjects.set(x[1], Number(x[2]));
    return { fonts, xobjects };
  };
  const nestedText = (id, parent) => {
    const body = objects.get(id);
    if (body === undefined) return '';
    const res = resourcesOf(body.slice(0, body.indexOf('stream')), parent);
    return textOfContent(streamOf(body) ?? '', res, (child) => nestedText(child, res));
  };
  return pageIds.map((id) => {
    const body = objects.get(id);
    const box = /\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(body);
    const size = box ? [Math.round(Number(box[3]) - Number(box[1])), Math.round(Number(box[4]) - Number(box[2]))] : [0, 0];
    const contents = /\/Contents\s*(?:\[([^\]]*)\]|(\d+) 0 R)/.exec(body);
    const refs = contents ? [...(contents[1] ?? `${contents[2]} 0 R`).matchAll(/(\d+) 0 R/g)].map((r) => Number(r[1])) : [];
    const res = resourcesOf(body);
    const text = refs.map((r) => textOfContent(streamOf(objects.get(r) ?? '') ?? '', res, (child) => nestedText(child, res))).join(' ');
    return { size, text };
  });
}

const ACCIDENTALS = /[♭♯]/;

/** The characters of a text without spaces, accidentals apart (a PDF may write them twice). */
function parts(text) {
  const chars = [...text.replace(/\s+/g, '')];
  return { plain: chars.filter((c) => !ACCIDENTALS.test(c)).sort().join(''), accidentals: [...new Set(chars.filter((c) => ACCIDENTALS.test(c)))].sort().join('') };
}

/** True when two texts hold the same characters (order and spaces apart). */
export function sameCharacters(a, b) {
  const x = parts(a);
  const y = parts(b);
  return x.plain === y.plain && x.accidentals === y.accidentals;
}

/** What differs, for a failure message. */
export function differences(a, b) {
  const count = (s) => {
    const m = new Map();
    for (const c of parts(s).plain) m.set(c, (m.get(c) ?? 0) + 1);
    return m;
  };
  const x = count(a);
  const y = count(b);
  const out = [];
  for (const c of new Set([...x.keys(), ...y.keys()])) if ((x.get(c) ?? 0) !== (y.get(c) ?? 0)) out.push(`« ${c} » ${x.get(c) ?? 0} / ${y.get(c) ?? 0}`);
  return out.join(', ');
}
