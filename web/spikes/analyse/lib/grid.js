// Bar/beat grid and the hand corrections offered in the page.
// A grid is { beats: [s], numbers: [1..bpb], beatsPerBar }.

export function makeGrid(beats, numbers, beatsPerBar) {
  return { beats: beats.slice(), numbers: numbers.slice(), beatsPerBar };
}

// Renumber from the first beat that currently carries number 1 (or index 0).
export function renumber(beats, beatsPerBar, firstDownIdx) {
  return beats.map((_, i) => ((((i - firstDownIdx) % beatsPerBar) + beatsPerBar) % beatsPerBar) + 1);
}

function firstDown(grid) {
  const i = grid.numbers.indexOf(1);
  return i < 0 ? 0 : i;
}

// Move the downbeat by +/- one beat (keeps a regular numbering from then on).
export function shiftDownbeat(grid, delta) {
  const f = firstDown(grid) + delta;
  return makeGrid(grid.beats, renumber(grid.beats, grid.beatsPerBar, f), grid.beatsPerBar);
}

export function setMeter(grid, bpb) {
  return makeGrid(grid.beats, renumber(grid.beats, bpb, firstDown(grid)), bpb);
}

// Double: insert a beat halfway between each pair. Half: keep every other beat, choosing
// the phase that keeps the current downbeats.
export function doubleTempo(grid) {
  const b = [];
  for (let i = 0; i < grid.beats.length; i++) {
    b.push(grid.beats[i]);
    if (i + 1 < grid.beats.length) b.push((grid.beats[i] + grid.beats[i + 1]) / 2);
  }
  return makeGrid(b, renumber(b, grid.beatsPerBar, firstDown(grid) * 2), grid.beatsPerBar);
}

export function halveTempo(grid) {
  const f = firstDown(grid);
  const phase = f % 2;
  const b = grid.beats.filter((_, i) => i % 2 === phase);
  return makeGrid(b, renumber(b, grid.beatsPerBar, Math.floor(f / 2)), grid.beatsPerBar);
}

// Bars: list of { index, t0, t1, beats: [beat indices] }.
export function bars(grid) {
  const out = [];
  let cur = null;
  grid.beats.forEach((t, i) => {
    if (grid.numbers[i] === 1 || !cur) {
      cur = { index: out.length + 1, t0: t, beats: [] };
      out.push(cur);
    }
    cur.beats.push(i);
  });
  for (let k = 0; k < out.length; k++) {
    const last = out[k].beats[out[k].beats.length - 1];
    out[k].t1 = k + 1 < out.length ? out[k + 1].t0 : grid.beats[last] + (grid.beats[last] - (grid.beats[last - 1] ?? grid.beats[last] - 0.5));
  }
  return out;
}

// Resample by an arbitrary ratio with a windowed-sinc kernel (used for tuning correction:
// y(n) = x(n * ratio), so ratio < 1 lowers the pitch and lengthens the signal).
export function resampleRatio(x, ratio, taps = 16, phases = 512) {
  const n = Math.floor(x.length / ratio);
  const y = new Float32Array(n);
  const cut = Math.min(1, 1 / ratio) * 0.97;
  const W = 2 * taps;
  // Kernel table: for each fractional phase, weights for k = c - taps + 1 .. c + taps.
  const table = new Float32Array((phases + 1) * W);
  for (let ph = 0; ph <= phases; ph++) {
    const frac = ph / phases;
    let ws = 0;
    for (let j = 0; j < W; j++) {
      const d = frac + taps - 1 - j; // p - k
      const sinc = d === 0 ? 1 : Math.sin(Math.PI * d * cut) / (Math.PI * d * cut);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / (taps + 1));
      table[ph * W + j] = sinc * w;
      ws += sinc * w;
    }
    for (let j = 0; j < W; j++) table[ph * W + j] /= ws;
  }
  for (let i = 0; i < n; i++) {
    const p = i * ratio;
    const c = Math.floor(p);
    const row = Math.round((p - c) * phases) * W;
    const k0 = c - taps + 1;
    let s = 0;
    if (k0 >= 0 && k0 + W <= x.length) {
      for (let j = 0; j < W; j++) s += x[k0 + j] * table[row + j];
    } else {
      for (let j = 0; j < W; j++) { const k = k0 + j; if (k >= 0 && k < x.length) s += x[k] * table[row + j]; }
    }
    y[i] = s;
  }
  return y;
}
