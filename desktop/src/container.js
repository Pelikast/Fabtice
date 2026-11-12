'use strict';

// Identifies the container of the downloaded audio so the diagnostics can say
// whether Chromium was handed a fragmented (DASH) MP4, a classic MP4 or WebM.

function readTopLevelBoxes(buf) {
  const boxes = [];
  let offset = 0;
  while (offset + 8 <= buf.length && boxes.length < 10000) {
    let size = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > buf.length) break;
      size = Number(buf.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = buf.length - offset;
    }
    if (size < header || !/^[\x20-\x7e]{4}$/.test(type)) break;
    boxes.push({ type, offset, size, header });
    offset += size;
  }
  return boxes;
}

function childTypes(buf, box) {
  const inner = buf.subarray(box.offset + box.header, Math.min(buf.length, box.offset + box.size));
  return readTopLevelBoxes(inner).map((b) => b.type);
}

function sniffContainer(buf) {
  if (!buf || buf.length < 12) return { kind: 'inconnu', label: 'fichier trop court' };

  if (buf.readUInt32BE(0) === 0x1a45dfa3) {
    const head = buf.toString('latin1', 0, Math.min(buf.length, 64));
    const docType = head.includes('webm') ? 'webm' : 'matroska';
    return { kind: docType, fragmented: null, label: docType === 'webm' ? 'WebM (EBML)' : 'Matroska (EBML)' };
  }

  if (buf.toString('latin1', 4, 8) !== 'ftyp') {
    return { kind: 'inconnu', label: `en-tête inconnu ${buf.subarray(0, 8).toString('hex')}` };
  }

  const boxes = readTopLevelBoxes(buf);
  const ftyp = boxes[0];
  const majorBrand = buf.toString('latin1', ftyp.offset + 8, ftyp.offset + 12);
  const compatible = [];
  for (let p = ftyp.offset + 16; p + 4 <= ftyp.offset + ftyp.size && p + 4 <= buf.length; p += 4) {
    compatible.push(buf.toString('latin1', p, p + 4));
  }
  const moov = boxes.find((b) => b.type === 'moov');
  const hasMvex = moov ? childTypes(buf, moov).includes('mvex') : false;
  const moofCount = boxes.filter((b) => b.type === 'moof').length;
  const fragmented = moofCount > 0 || hasMvex;
  const topLevel = [];
  for (const b of boxes) {
    const last = topLevel[topLevel.length - 1];
    if (last && last.type === b.type) last.count += 1;
    else topLevel.push({ type: b.type, count: 1 });
  }
  return {
    kind: fragmented ? 'mp4-fragmented' : 'mp4',
    fragmented,
    majorBrand,
    compatibleBrands: compatible,
    moofCount,
    hasMvex,
    topLevel: topLevel.map((t) => (t.count > 1 ? `${t.type}×${t.count}` : t.type)).join(' '),
    label: fragmented
      ? `MP4 fragmenté (DASH) — marque « ${majorBrand} », ${moofCount} fragments moof`
      : `MP4 classique — marque « ${majorBrand} »`,
  };
}

module.exports = { sniffContainer };
