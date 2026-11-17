// Readers shared by the browser checks of the sequencer folders
// (`export-logic.mjs`, `export-ableton.mjs`): the web's .zip (stored entries),
// a Wave header, the clock of a MIDI file from its own tempo events.

/** The entries of a .zip written by `zipStore` (stored, no compression). */
export function readZip(buf) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('no end of central directory');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const files = [];
  for (let i = 0; i < count; i++) {
    const size = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    files.push({ name, data: buf.subarray(dataAt, dataAt + size) });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

export function wavInfo(buf) {
  return {
    riff: buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE',
    channels: buf.readUInt16LE(22),
    rate: buf.readUInt32LE(24),
    bits: buf.readUInt16LE(34),
    frames: buf.readUInt32LE(40) / (2 * buf.readUInt16LE(22)),
    declared: buf.readUInt32LE(4) + 8 === buf.length,
  };
}

/** Seconds of each tick, from the file's own tempo events (independent of the writer). */
export function midiClock(midi) {
  const ppq = midi.header.ticksPerBeat;
  const abs = midi.tracks.map((events) => {
    let tick = 0;
    return events.map((e) => ({ ...e, tick: (tick += e.deltaTime) }));
  });
  const tempos = abs[0].filter((e) => e.type === 'setTempo');
  const seconds = (tick) => {
    let t = 0;
    let at = 0;
    let us = 500000;
    for (const e of tempos) {
      if (e.tick > tick) break;
      t += ((e.tick - at) / ppq) * us * 1e-6;
      at = e.tick;
      us = e.microsecondsPerBeat;
    }
    return t + ((tick - at) / ppq) * us * 1e-6;
  };
  return { ppq, abs, tempos, seconds };
}
