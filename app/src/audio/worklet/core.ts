// Player core: transport, loop feeder, per-track stretching and mixing,
// metronome, limiter. It has no Web Audio dependency: the AudioWorklet
// processor calls `render()` once per 128-frame quantum and the Node tests
// call it directly. Ported from the validated spike (`web/spikes/lecteur`).
//
// Timeline model
//   - Source time is counted in frames of the tracks. The "cursor" is the
//     source position that has been *fed* to the stretchers: ip (integer) +
//     acc (fraction).
//   - Each output quantum of N frames consumes N * rate source frames (rate =
//     tempo ratio, smoothed). The integer part goes to the stretchers, the
//     fraction is carried in acc, so the long-run position never drifts.
//   - Every track reads the same cursor and produces exactly N output frames
//     per quantum, so tracks stay aligned by construction.
//   - Loops are handled on the INPUT side: the virtual input stream wraps from
//     the loop end to the loop start with a 20 ms equal-power crossfade, so the
//     stretchers see a continuous signal.
//   - Heard position = cursor - (a * rate + b) - limiter delay, from the
//     stretcher delay model L(rate) = a + b / rate.
//   - Metronome clicks are placed in the OUTPUT domain (not stretched), at
//     the output frame where the beat's source frame will be heard.
//
// « Appliquer » (rendered audio). A second way to make the same output: the
// tracks rendered offline at the played speed (`setRendered`) are read as they
// are, with no stretcher and so no latency. Rendered frame k is source frame
// k * ratio, so a read position is a source position divided by the ratio and
// everything outside the player (position, loop, clicks, duration) stays in
// source time. The player has two cursors:
//   - the preview cursor `ip + acc`: the source position FED to the
//     stretchers, `latency` ahead of what is heard;
//   - the applied cursor `apos`: the source position being READ, which is what
//     is heard (no latency).
// Only the paths that are needed run (`pLive`, `aLive`); the other one's
// cursor is stale. The route changes at once, when the live settings stop or
// start being the set's, with a short equal-power crossfade (`XFADE_S`)
// between the two paths at the same heard position: going to the rendered
// audio, the applied cursor starts at the heard position; coming back, the
// preview cursor starts at the heard position plus its latency and its
// stretchers are primed as after a seek. The rendered audio is used only while
// the live key and tempo are exactly the set's (the tempo smoothing has
// finished) and every track has its rendered audio.

import { Limiter, LIMITER_DELAY } from './limiter';
import { CHUNK, CHUNK_BITS, type Chunk } from './protocol';
import type { LatencyModel, StretchFactory, Stretcher } from './stretch';

export const N = 128;
export { CHUNK, CHUNK_BITS };

const now: () => number = typeof performance !== 'undefined' && performance.now ? () => performance.now() : () => Date.now();
export const HAS_HIRES_TIMER = typeof performance !== 'undefined' && !!performance.now;

// ---------------------------------------------------------------- track storage

/** Audio of one track, as fixed-size 16-bit chunks; mono tracks are stored once. */
export class TrackData {
  readonly chunks: (Chunk | null)[];
  readonly missingSet = new Set<number>();
  missing = 0;
  constructor(
    readonly frames: number,
    readonly mono: boolean,
    chunks?: readonly Chunk[],
  ) {
    this.chunks = chunks ? [...chunks] : new Array<Chunk | null>(Math.ceil(frames / CHUNK)).fill(null);
  }
}

const K16 = 1 / 32768;

function zero(dl: Float32Array, dr: Float32Array, off: number, n: number): void {
  dl.fill(0, off, off + n);
  dr.fill(0, off, off + n);
}

/** Reads n frames from source frame `start` (may be out of range: zeros) into dl/dr[off..]. */
export function readTrack(track: TrackData, start: number, n: number, dl: Float32Array, dr: Float32Array, off: number): void {
  let i = 0;
  const frames = track.frames;
  if (start < 0) {
    const z = Math.min(n, -start);
    zero(dl, dr, off, z);
    i = z;
  }
  while (i < n) {
    const f = start + i;
    if (f >= frames) {
      zero(dl, dr, off + i, n - i);
      break;
    }
    const ci = f >> CHUNK_BITS;
    const co = f & (CHUNK - 1);
    const cnt = Math.min(n - i, CHUNK - co, frames - f);
    const ch = track.chunks[ci];
    if (!ch) {
      zero(dl, dr, off + i, cnt);
      track.missing++;
      track.missingSet.add(ci);
    } else {
      const L = ch.l;
      const R = ch.r ?? ch.l;
      const o = off + i;
      for (let j = 0; j < cnt; j++) {
        dl[o + j] = L[co + j]! * K16;
        dr[o + j] = R[co + j]! * K16;
      }
    }
    i += cnt;
  }
}

// ---------------------------------------------------------------- click sounds

function makeClick(sr: number, freq: number, amp: number): Float32Array {
  const len = Math.round(0.045 * sr);
  const b = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    b[i] = amp * Math.exp(-t * 110) * Math.sin(2 * Math.PI * freq * t) * Math.min(1, i / 8);
  }
  return b;
}

/** Crossfade between the preview and the rendered audio, seconds. */
export const XFADE_S = 0.015;

const METRONOME_VOLUME = 0.5;
const MAX_PENDING_CLICKS = 256;

// ---------------------------------------------------------------- core

interface CoreTrack {
  id: string;
  data: TrackData;
  proc: Stretcher;
  gain: number;
  vol: number;
  mute: boolean;
  solo: boolean;
  needPrime: boolean;
  active: boolean;
  /** The rendered audio of this track (« Appliquer »), or null. */
  rendered: TrackData | null;
}

export interface CoreStats {
  quanta: number;
  busySum: number;
  busyN: number;
  busyMax: number;
  over: number;
  budget: number;
}

const FADE_NONE = 0;
const FADE_PAUSE = 1;
const FADE_SEEK = 2;

export class PlayerCore {
  readonly sr: number;
  private factory: StretchFactory;
  private lat: LatencyModel;
  readonly tracks: CoreTrack[] = [];
  /** When false every track is computed even if muted (offline renders, tests). */
  skipMuted = true;

  playing = false;
  ended = false;
  ip = 0;
  acc = 0;
  rate = 1;
  rateTarget = 1;
  /** Transposition in semitones, cents included. */
  semitones = 0;

  private mg = 0; // master fade (click-free play / pause / seek)
  private mgTarget = 0;
  private fadeAction = FADE_NONE;
  /** Heard position frozen while a pause fades out; -1 when not pausing. */
  private frozen = -1;
  /** Target of a seek waiting for the fade-out; -1 when none. */
  private pendingSeek = -1;
  /** Source frame playback (re)started from, and output frames played since. */
  private startPos = 0;
  private sinceStart = 0;

  // ----- « Appliquer »: the rendered set and the route
  /** What the rendered audio was made for, or null. `semitones` includes the cents. */
  private renderedSet: { semitones: number; ratio: number } | null = null;
  /** Where the output is going: 0 the preview (stretchers), 1 the rendered audio as it is. */
  path: 0 | 1 = 0;
  /** Weight of the rendered audio in the output, 0…1 (a crossfade moves it between the two ends). */
  mixApplied = 0;
  /** The preview's stretchers are running / the rendered audio is being read. A path that is not live has a stale cursor. */
  private pLive = true;
  private aLive = false;
  /** The applied cursor: source frames, what is heard (no latency). */
  apos = 0;
  /** Output frame of the last wrap of the applied cursor; -1 when none is recent. */
  private wrapOutA = -1;
  private readonly atmpL = new Float32Array(N);
  private readonly atmpR = new Float32Array(N);
  private readonly gp = new Float32Array(N);
  private readonly ga = new Float32Array(N);
  /** Length of the crossfade between the two paths, frames. */
  readonly xfade: number;

  readonly loop = { enabled: false, start: 0, end: 0, len: 0, xf: 0, cos: new Float32Array(0), sin: new Float32Array(0) };
  /** Output frame of the last wrap of the input side; -1 when none is recent. */
  private wrapOut = -1;

  private metro: { enabled: boolean; frames: Float64Array; accents: Uint8Array; bi: number; resync: boolean } = {
    enabled: false,
    frames: new Float64Array(0),
    accents: new Uint8Array(0),
    bi: 0,
    resync: true,
  };
  private readonly clickN: Float32Array;
  private readonly clickA: Float32Array;
  private readonly clickF = new Float64Array(MAX_PENDING_CLICKS);
  private readonly clickAcc = new Uint8Array(MAX_PENDING_CLICKS);
  private clickCount = 0;
  outFrame = 0;

  private inL = new Float32Array(1024);
  private inR = new Float32Array(1024);
  private t2L = new Float32Array(1024);
  private t2R = new Float32Array(1024);
  private readonly tmpL = new Float32Array(N);
  private readonly tmpR = new Float32Array(N);
  private readonly mixL = new Float32Array(N);
  private readonly mixR = new Float32Array(N);
  private readonly limiter: Limiter;

  readonly stat: CoreStats;
  /** Offline rendering: no fade at start, every track at full gain at once. */
  immediate = false;
  /** Negative control for the tests: wrap the loop without crossfade. */
  noCrossfade = false;
  /** Test hook: called after each track is processed (index, left, right, gain). */
  onTrack: ((index: number, l: Float32Array, r: Float32Array, gain: number) => void) | null = null;

  constructor(sampleRate: number, factory: StretchFactory, latency: LatencyModel) {
    this.sr = sampleRate;
    this.factory = factory;
    this.lat = latency;
    this.xfade = Math.round(XFADE_S * sampleRate);
    this.clickN = makeClick(sampleRate, 1000, 0.8);
    this.clickA = makeClick(sampleRate, 1600, 1.0);
    this.limiter = new Limiter(sampleRate);
    this.stat = { quanta: 0, busySum: 0, busyN: 0, busyMax: 0, over: 0, budget: (N / sampleRate) * 1000 };
  }

  // ----- configuration

  addTrack(id: string, data: TrackData, mix: { volume: number; mute: boolean; solo: boolean }): void {
    this.removeTrack(id);
    this.tracks.push({ id, data, proc: this.factory.create(), gain: 0, vol: mix.volume, mute: mix.mute, solo: mix.solo, needPrime: true, active: false, rendered: null });
  }

  removeTrack(id: string): void {
    const i = this.tracks.findIndex((t) => t.id === id);
    if (i < 0) return;
    this.tracks[i]!.proc.destroy();
    this.tracks.splice(i, 1);
  }

  /** Drops every track and stops, at 0. */
  clearTracks(): void {
    for (const t of this.tracks) t.proc.destroy();
    this.tracks.length = 0;
    this.playing = false;
    this.ended = false;
    this.ip = 0;
    this.acc = 0;
    this.mg = 0;
    this.mgTarget = 0;
    this.fadeAction = FADE_NONE;
    this.frozen = -1;
    this.pendingSeek = -1;
    this.clickCount = 0;
    this.limiter.reset();
    this.renderedSet = null;
    this.apos = 0;
    this.path = 0;
    this.settleRoute();
  }

  setMix(id: string, mix: { volume: number; mute: boolean; solo: boolean }): void {
    const t = this.tracks.find((x) => x.id === id);
    if (!t) return;
    t.vol = mix.volume;
    t.mute = mix.mute;
    t.solo = mix.solo;
  }

  get totalFrames(): number {
    let m = 0;
    for (const t of this.tracks) m = Math.max(m, t.data.frames);
    return m;
  }

  setLoop(enabled: boolean, start: number, end: number): void {
    const L = this.loop;
    start = Math.max(0, Math.round(start));
    end = Math.round(end);
    L.enabled = enabled && end - start > 2048;
    L.start = start;
    L.end = end;
    L.len = end - start;
    if (L.len > 0) {
      // crossfade: 20 ms, at most a quarter of the loop
      L.xf = Math.max(16, Math.min(Math.round(0.02 * this.sr), L.len >> 2));
      L.cos = new Float32Array(L.xf);
      L.sin = new Float32Array(L.xf);
      for (let i = 0; i < L.xf; i++) {
        const w = (i + 0.5) / L.xf;
        L.cos[i] = Math.cos((w * Math.PI) / 2);
        L.sin[i] = Math.sin((w * Math.PI) / 2);
      }
    }
    this.wrapOut = -1;
    this.metro.resync = true;
  }

  setClicks(frames: Float64Array, accents: Uint8Array): void {
    this.metro.frames = frames;
    this.metro.accents = accents;
    this.metro.resync = true;
  }

  setMetronome(enabled: boolean): void {
    this.metro.enabled = enabled;
    this.metro.resync = true;
    if (!enabled) this.clickCount = 0;
  }

  setRate(r: number): void {
    this.rateTarget = Math.max(0.1, Math.min(4, r));
  }

  // ----- transport

  play(): void {
    if (this.playing && this.mgTarget === 1) return;
    this.ended = false;
    if (!this.playing) {
      this.mg = this.immediate ? 1 : 0;
      this.path = this.wantedPath(); // nothing is audible yet: the route changes without a crossfade
      this.settleRoute();
      this.apos = this.ip + this.acc;
      this.wrapOutA = -1;
      this.primeAll();
      this.startPos = this.ip + this.acc;
      this.sinceStart = 0;
      this.wrapOut = -1;
      this.limiter.reset(); // no tail of what was playing before
    }
    this.playing = true;
    this.mgTarget = 1;
    this.fadeAction = FADE_NONE;
    this.frozen = -1;
  }

  // ----- « Appliquer »: the rendered set and the route

  /**
   * Gives the player the rendered audio (replacing any earlier set): `entries`
   * by track id. `semitones` includes the cents; `ratio` is the tempo the
   * audio was rendered at. A track without an entry has none (the set is then
   * not used until every track has).
   */
  setRendered(semitones: number, ratio: number, entries: ReadonlyMap<string, TrackData>): void {
    this.renderedSet = { semitones, ratio };
    for (const t of this.tracks) t.rendered = entries.get(t.id) ?? null;
    this.updateRoute();
  }

  /** Drops the rendered set (the player goes back to the preview, with a crossfade when it is playing). */
  clearRendered(): void {
    this.renderedSet = null;
    for (const t of this.tracks) t.rendered = null;
    this.updateRoute();
  }

  /** True when the rendered audio is what is (being) heard. */
  get appliedInUse(): boolean {
    return this.path === 1;
  }

  /**
   * The route the live settings ask for: the rendered audio when there is a
   * set that covers every track, and the key and tempo are exactly its own
   * (the tempo smoothing has reached them), else the preview.
   */
  private wantedPath(): 0 | 1 {
    const set = this.renderedSet;
    if (!set || this.tracks.length === 0) return 0;
    for (const t of this.tracks) if (!t.rendered) return 0;
    if (Math.abs(this.semitones - set.semitones) > 1e-9) return 0;
    if (Math.abs(this.rateTarget - set.ratio) > 1e-9 || Math.abs(this.rate - set.ratio) > 1e-9) return 0;
    return 1;
  }

  /** Only the path `path` runs, whatever the crossfade was doing. */
  private settleRoute(): void {
    this.mixApplied = this.path;
    this.pLive = this.path === 0;
    this.aLive = this.path === 1;
  }

  /**
   * Called before every quantum (and when the set changes): starts the route
   * change when the settings ask for it. While nothing is audible (paused,
   * fading out for a seek) it is immediate; while playing it is a crossfade
   * at the same heard position.
   */
  private updateRoute(): void {
    const want = this.wantedPath();
    if (want === this.path) return;
    if (!this.playing || this.mg < 0.01) {
      this.path = want;
      this.settleRoute();
      if (this.playing) this.apos = this.cursor; // a seek is about to replace the position
      return;
    }
    const heard = this.heardLive();
    const L = this.loop;
    if (want === 1) {
      if (!this.aLive) {
        this.apos = heard;
        this.wrapOutA = -1;
        this.aLive = true;
      }
      this.path = 1;
      // The clicks come from the rendered cursor now: forget the ones not started, they are scanned again from here.
      this.dropFutureClicks();
      this.metro.resync = true;
    } else {
      if (!this.pLive) {
        // The stretchers are fed `latency` ahead of what is heard, and primed as after a seek.
        const latSrc = this.lat.a * this.rate + this.lat.b;
        let c = heard + latSrc;
        const loopActive = L.enabled && heard < L.end;
        if (loopActive && c >= L.end) {
          c -= L.len;
          this.wrapOut = this.outFrame - (c - L.start) / this.rate;
        } else this.wrapOut = -1;
        this.ip = Math.floor(c);
        this.acc = c - this.ip;
        for (const t of this.tracks) t.needPrime = true;
        this.pLive = true;
        this.dropFutureClicks();
        if (this.metro.enabled) this.scheduleHeard(heard, latSrc, loopActive);
      } else {
        this.dropFutureClicks();
      }
      this.path = 0;
      this.metro.resync = true;
    }
    // The heard position is known from the cursor formulas now, not from the start of playback.
    this.sinceStart = Number.MAX_SAFE_INTEGER / 2;
  }

  /** Forgets the pending clicks that have not started yet (they are scanned again from the new cursor). */
  private dropFutureClicks(): void {
    for (let k = this.clickCount - 1; k >= 0; k--) {
      if (this.clickF[k]! >= this.outFrame) {
        this.clickCount--;
        this.clickF[k] = this.clickF[this.clickCount]!;
        this.clickAcc[k] = this.clickAcc[this.clickCount]!;
      }
    }
  }

  /**
   * Schedules the beats between the heard position and the preview cursor,
   * which the preview's own scan (from its cursor) will not see: a beat `b`
   * is heard at `outFrame + (b - heard) / rate`.
   */
  private scheduleHeard(heard: number, span: number, loopActive: boolean): void {
    const M = this.metro;
    if (M.frames.length === 0) return;
    const L = this.loop;
    const add = (from: number, to: number, at: number) => {
      const fr = M.frames;
      let lo = 0;
      let hi = fr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (fr[mid]! < from) lo = mid + 1;
        else hi = mid;
      }
      for (let i = lo; i < fr.length && fr[i]! < to; i++) {
        if (this.clickCount >= MAX_PENDING_CLICKS) return;
        this.clickF[this.clickCount] = Math.round(this.outFrame + at + (fr[i]! - from) / this.rate);
        this.clickAcc[this.clickCount] = M.accents[i] === 1 ? 1 : 0;
        this.clickCount++;
      }
    };
    if (loopActive && heard + span >= L.end) {
      add(heard, L.end, 0);
      add(L.start, L.start + (heard + span - L.end), (L.end - heard) / this.rate);
    } else add(heard, heard + span, 0);
  }

  pause(): void {
    if (!this.playing) return;
    this.frozen = this.heardPos();
    this.pendingSeek = -1;
    this.mgTarget = 0;
    this.fadeAction = FADE_PAUSE;
  }

  seek(frame: number): void {
    frame = Math.max(0, Math.round(frame));
    if (this.playing && this.fadeAction === FADE_PAUSE) {
      this.frozen = frame; // pausing: the pause simply ends at the new place
      return;
    }
    if (!this.playing || this.mg < 0.01) {
      this.applySeek(frame);
      return;
    }
    this.pendingSeek = frame;
    this.mgTarget = 0;
    this.fadeAction = FADE_SEEK;
  }

  private applySeek(frame: number): void {
    this.ip = frame;
    this.acc = 0;
    this.ended = false;
    this.pendingSeek = -1;
    this.startPos = frame;
    this.sinceStart = 0;
    this.wrapOut = -1;
    this.wrapOutA = -1;
    this.apos = frame;
    this.path = this.wantedPath(); // nothing is audible: the route changes without a crossfade
    this.settleRoute();
    this.primeAll();
  }

  private primeAll(): void {
    for (const t of this.tracks) {
      t.needPrime = true;
      t.gain = 0;
    }
    this.metro.resync = true;
    this.clickCount = 0;
  }

  get cursor(): number {
    return this.ip + this.acc;
  }

  /** Output latency of the stretchers at tempo ratio `rate`, in frames. */
  latencyOut(rate: number = this.rate): number {
    return this.lat.a + this.lat.b / rate;
  }

  /** Source position of what is currently audible, in frames. */
  heardPos(): number {
    if (!this.playing) return this.ip;
    if (this.frozen >= 0) return this.frozen;
    if (this.pendingSeek >= 0) return this.pendingSeek;
    // The rendered audio has no latency: only the limiter's delay lies between the cursor and the ear.
    const lat = this.mixApplied >= 0.5 ? 0 : this.latencyOut();
    // The first `lat` frames after a start or a seek still carry the previous material: show the start.
    if (this.sinceStart < lat + LIMITER_DELAY) return this.startPos;
    return this.heardLive();
  }

  /** The heard position from the cursors alone, whatever the transport is doing (a fade, a pending seek). */
  private heardLive(): number {
    const L = this.loop;
    let h: number;
    if (this.mixApplied >= 0.5) {
      h = this.apos - LIMITER_DELAY * this.rate;
      if (L.enabled && this.wrapOutA >= 0 && this.outFrame - this.wrapOutA < LIMITER_DELAY && h < L.start) {
        h = L.start + ((((h - L.start) % L.len) + L.len) % L.len); // still hearing the tail of the previous pass
      }
    } else {
      const lat = this.latencyOut();
      h = this.cursor - (this.lat.a * this.rate + this.lat.b) - LIMITER_DELAY * this.rate;
      if (L.enabled && this.wrapOut >= 0 && this.outFrame - this.wrapOut < lat + LIMITER_DELAY && h < L.start) {
        h = L.start + ((((h - L.start) % L.len) + L.len) % L.len); // still hearing the tail of the previous pass
      }
    }
    return Math.min(Math.max(0, h), this.totalFrames);
  }

  // ----- input feeding with loop wrap and crossfade

  private fill(track: CoreTrack, ip: number, n: number, loopActive: boolean, dl: Float32Array, dr: Float32Array): void {
    const L = this.loop;
    if (!loopActive) {
      readTrack(track.data, ip, n, dl, dr, 0);
      return;
    }
    const xf = this.noCrossfade ? 0 : L.xf;
    let i = 0;
    let idx = ip;
    while (i < n) {
      if (idx >= L.end) idx -= L.len;
      const seg = Math.min(n - i, L.end - idx);
      readTrack(track.data, idx, seg, dl, dr, i);
      const zs = Math.max(idx, L.end - xf);
      const ze = idx + seg;
      if (ze > zs) {
        const cnt = ze - zs;
        const off = i + (zs - idx);
        readTrack(track.data, zs - L.len, cnt, this.t2L, this.t2R, 0);
        for (let j = 0; j < cnt; j++) {
          const k = zs + j - (L.end - L.xf);
          const g1 = L.cos[k]!;
          const g2 = L.sin[k]!;
          dl[off + j] = dl[off + j]! * g1 + this.t2L[j]! * g2;
          dr[off + j] = dr[off + j]! * g1 + this.t2R[j]! * g2;
        }
      }
      i += seg;
      idx += seg;
    }
  }

  // ----- metronome scheduling in the stretched timeline

  private scanBeats(srcA: number, srcB: number, outStart: number, rate: number, lat: number = this.latencyOut(rate)): void {
    const M = this.metro;
    if (!M.enabled || M.frames.length === 0) return;
    const fr = M.frames;
    if (M.resync) {
      // binary search: first beat >= srcA
      let lo = 0;
      let hi = fr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (fr[mid]! < srcA) lo = mid + 1;
        else hi = mid;
      }
      M.bi = lo;
      M.resync = false;
    }
    while (M.bi > 0 && fr[M.bi - 1]! >= srcA) M.bi--;
    while (M.bi < fr.length && fr[M.bi]! < srcA) M.bi++;
    while (M.bi < fr.length && fr[M.bi]! < srcB) {
      const i = (fr[M.bi]! - srcA) / rate;
      if (this.clickCount < MAX_PENDING_CLICKS) {
        this.clickF[this.clickCount] = Math.round(this.outFrame + outStart + i + lat);
        this.clickAcc[this.clickCount] = M.accents[M.bi] === 1 ? 1 : 0;
        this.clickCount++;
      }
      M.bi++;
    }
  }

  // ----- one quantum

  render(outL: Float32Array, outR: Float32Array): void {
    const t0 = now();
    const sr = this.sr;
    outL.fill(0);
    outR.fill(0);
    this.updateRoute();
    if (!this.playing || this.tracks.length === 0) {
      this.noteStats(t0, false);
      return;
    }

    // tempo ratio: smooth (about 25 ms) so the stretchers see no step
    const dr = this.rateTarget - this.rate;
    const maxStep = 0.004;
    this.rate += Math.abs(dr) <= maxStep ? dr : Math.sign(dr) * maxStep;
    const rate = this.rate;

    const L = this.loop;
    const pv = this.pLive; // the stretchers run
    const ap = this.aLive; // the rendered audio is read
    const loopActive = pv && L.enabled && this.ip < L.end;
    const accBefore = this.acc;
    let nIn = 0;
    const ip = this.ip;
    if (pv) {
      this.acc += N * rate;
      nIn = Math.floor(this.acc);
      this.acc -= nIn;
    }
    const a0 = this.apos;
    const loopActiveA = ap && L.enabled && a0 < L.end;

    // metronome: map the source span consumed by this quantum onto output frames
    if (this.metro.enabled) {
      if (this.path === 0) {
        const c0 = ip + accBefore;
        const span = N * rate;
        if (loopActive && c0 + span >= L.end) {
          const k = (L.end - c0) / rate; // output frames before the wrap
          this.scanBeats(c0, L.end, 0, rate);
          this.scanBeats(L.start, L.start + (c0 + span - L.end), k, rate);
        } else this.scanBeats(c0, c0 + span, 0, rate);
      } else {
        // the rendered audio has no latency: a beat is heard when the read position reaches it
        const span = N * rate;
        if (loopActiveA && a0 + span >= L.end) {
          const k = (L.end - a0) / rate;
          this.scanBeats(a0, L.end, 0, rate, 0);
          this.scanBeats(L.start, L.start + (a0 + span - L.end), k, rate, 0);
        } else this.scanBeats(a0, a0 + span, 0, rate, 0);
      }
    }

    // the two paths are mixed with equal-power weights while the route changes
    const mixBefore = this.mixApplied;
    const mixAfter = this.path === 1 ? Math.min(1, mixBefore + N / this.xfade) : Math.max(0, mixBefore - N / this.xfade);
    const crossfading = pv && ap;
    if (crossfading) {
      for (let i = 0; i < N; i++) {
        const w = mixBefore + ((mixAfter - mixBefore) * (i + 1)) / N;
        this.gp[i] = Math.cos((w * Math.PI) / 2);
        this.ga[i] = Math.sin((w * Math.PI) / 2);
      }
    }

    const sps = 1 / (0.008 * sr);
    const stepG = N / (0.012 * sr);
    const mixL = this.mixL;
    const mixR = this.mixR;
    mixL.fill(0);
    mixR.fill(0);
    const semi = this.semitones;
    let anySolo = false;
    for (const t of this.tracks) if (t.solo) anySolo = true;
    let busy = false;
    let active = 0;

    for (let ti = 0; ti < this.tracks.length; ti++) {
      const s = this.tracks[ti]!;
      const audible = !s.mute && (!anySolo || s.solo);
      const target = audible ? s.vol : 0;
      if (this.skipMuted && !audible && s.gain <= 1e-4) {
        s.active = false;
        s.needPrime = true;
        s.gain = 0;
        continue;
      }
      s.active = true;
      active++;
      let outTL = this.tmpL;
      let outTR = this.tmpR;
      if (pv) {
        const proc = s.proc;
        proc.setParams(semi);
        if (s.needPrime) {
          proc.reset();
          proc.setParams(semi);
          // pre-roll: the audio just before the start, fed without producing output
          const n = Math.min(proc.seekLength, 1024 * 8, this.inL.length);
          readTrack(s.data, ip - n, n, this.inL, this.inR, 0);
          proc.seek(this.inL, this.inR, n, rate);
          s.needPrime = false;
          if (this.immediate) s.gain = target;
        }
        this.fill(s, ip, nIn, loopActive, this.inL, this.inR);
        proc.process(this.inL, this.inR, nIn, this.tmpL, this.tmpR, N);
      }
      if (ap) {
        this.fillApplied(s, a0, loopActiveA, this.atmpL, this.atmpR);
        if (crossfading) {
          const gp = this.gp;
          const ga = this.ga;
          for (let i = 0; i < N; i++) {
            this.tmpL[i] = this.tmpL[i]! * gp[i]! + this.atmpL[i]! * ga[i]!;
            this.tmpR[i] = this.tmpR[i]! * gp[i]! + this.atmpR[i]! * ga[i]!;
          }
        } else {
          outTL = this.atmpL;
          outTR = this.atmpR;
        }
      }
      if (this.onTrack) this.onTrack(ti, outTL, outTR, s.gain);
      const g0 = s.gain;
      const g1 = g0 + Math.max(-stepG, Math.min(stepG, target - g0));
      s.gain = g1;
      const inv = 1 / N;
      for (let i = 0; i < N; i++) {
        const g = g0 + (g1 - g0) * (i + 1) * inv;
        mixL[i] = mixL[i]! + outTL[i]! * g;
        mixR[i] = mixR[i]! + outTR[i]! * g;
      }
      busy = true;
    }

    // metronome clicks (output domain, not stretched)
    if (this.clickCount > 0) {
      const base = this.outFrame;
      for (let k = this.clickCount - 1; k >= 0; k--) {
        const f = this.clickF[k]!;
        const buf = this.clickAcc[k] ? this.clickA : this.clickN;
        if (f + buf.length <= base) {
          // drop it: move the last pending click into its place
          this.clickCount--;
          this.clickF[k] = this.clickF[this.clickCount]!;
          this.clickAcc[k] = this.clickAcc[this.clickCount]!;
          continue;
        }
        const start = Math.max(0, f - base);
        const end = Math.min(N, f + buf.length - base);
        for (let i = start; i < end; i++) {
          const v = buf[base + i - f]! * METRONOME_VOLUME;
          mixL[i] = mixL[i]! + v;
          mixR[i] = mixR[i]! + v;
        }
      }
    }

    // master fade, then the safety limiter, then out
    let mg = this.mg;
    for (let i = 0; i < N; i++) {
      if (mg < this.mgTarget) mg = Math.min(this.mgTarget, mg + sps);
      else if (mg > this.mgTarget) mg = Math.max(this.mgTarget, mg - sps);
      mixL[i] = mixL[i]! * mg;
      mixR[i] = mixR[i]! * mg;
    }
    this.mg = mg;
    this.limiter.process(mixL, mixR, N);
    outL.set(mixL);
    outR.set(mixR);
    this.outFrame += N;
    this.sinceStart += N;

    // advance the cursors
    if (pv) {
      let nip = ip + nIn;
      if (loopActive && nip >= L.end) {
        nip -= L.len;
        this.wrapOut = this.outFrame - N + (L.end - (ip + accBefore)) / rate;
      }
      this.ip = nip;
    }
    if (ap) {
      let na = a0 + N * rate;
      if (loopActiveA && na >= L.end) {
        na -= L.len;
        this.wrapOutA = this.outFrame - N + (L.end - a0) / rate;
      }
      this.apos = na;
    }
    // the route's crossfade moves on; a path that has faded out stops
    this.mixApplied = mixAfter;
    if (mixAfter >= 1 && this.path === 1) this.pLive = false;
    else if (mixAfter <= 0 && this.path === 0) this.aLive = false;

    if (this.mg === 0 && this.mgTarget === 0 && this.fadeAction !== FADE_NONE) {
      const action = this.fadeAction;
      this.fadeAction = FADE_NONE;
      if (action === FADE_PAUSE) {
        const at = Math.round(Math.min(this.frozen, this.totalFrames));
        this.playing = false;
        this.frozen = -1;
        this.ip = at;
        this.acc = 0;
        this.apos = at;
        this.path = this.wantedPath();
        this.settleRoute();
        this.primeAll();
        this.limiter.reset();
      } else {
        this.applySeek(this.pendingSeek);
        this.mgTarget = 1;
      }
    }

    // end of the material: everything has been heard
    if (this.playing && !(L.enabled && this.cursorOnPath() < L.end) && this.pendingSeek < 0 && this.heardPos() >= this.totalFrames) {
      this.playing = false;
      this.ended = true;
      this.ip = this.totalFrames;
      this.acc = 0;
      this.apos = this.totalFrames;
      this.path = this.wantedPath();
      this.settleRoute();
      this.frozen = -1;
      this.primeAll();
      this.limiter.reset();
    }
    this.noteStats(t0, busy, active);
  }

  /** The cursor of the route the player is on (what the loop checks compare with the loop end). */
  private cursorOnPath(): number {
    return this.path === 1 ? this.apos : this.ip;
  }

  /**
   * Reads the rendered audio of a track for the next quantum: `N` output
   * frames from the source position `a0`, one rendered frame per output frame
   * (rendered frame k is source frame k * ratio). Inside a loop the position
   * wraps from its end to its start, with the same crossfade as the input side
   * of the preview (the last `xf` source frames fade into the audio just
   * before the loop start).
   */
  private fillApplied(track: CoreTrack, a0: number, loopActive: boolean, dl: Float32Array, dr: Float32Array): void {
    const data = track.rendered!;
    const ratio = this.renderedSet!.ratio;
    const L = this.loop;
    if (!loopActive) {
      readTrack(data, Math.round(a0 / ratio), N, dl, dr, 0);
      return;
    }
    const xf = this.noCrossfade ? 0 : L.xf;
    let i = 0;
    let s = a0;
    while (i < N) {
      if (s >= L.end) s -= L.len;
      // output frames before the source position reaches the loop end
      const seg = Math.min(N - i, Math.max(1, Math.ceil((L.end - s) / ratio)));
      readTrack(data, Math.round(s / ratio), seg, dl, dr, i);
      if (xf > 0) {
        const zs = L.end - xf;
        const j0 = Math.max(0, Math.ceil((zs - s) / ratio));
        if (j0 < seg) {
          const cnt = seg - j0;
          readTrack(data, Math.round((s + j0 * ratio - L.len) / ratio), cnt, this.t2L, this.t2R, 0);
          for (let j = 0; j < cnt; j++) {
            const k = Math.min(L.xf - 1, Math.max(0, Math.floor(s + (j0 + j) * ratio - zs)));
            const g1 = L.cos[k]!;
            const g2 = L.sin[k]!;
            dl[i + j0 + j] = dl[i + j0 + j]! * g1 + this.t2L[j]! * g2;
            dr[i + j0 + j] = dr[i + j0 + j]! * g1 + this.t2R[j]! * g2;
          }
        }
      }
      i += seg;
      s += seg * ratio;
    }
  }

  private activeCount = 0;
  get activeTracks(): number {
    return this.activeCount;
  }

  private noteStats(t0: number, worked: boolean, active = 0): void {
    const st = this.stat;
    this.activeCount = active;
    st.quanta++;
    if (!worked) return;
    const dt = now() - t0;
    st.busySum += dt;
    st.busyN++;
    if (dt > st.busyMax) st.busyMax = dt;
    if (HAS_HIRES_TIMER && dt > st.budget) st.over++;
  }

  /** Processing load since the last call, as fractions of the quantum duration. */
  takeLoad(): { avg: number; max: number; n: number } {
    const st = this.stat;
    const r = { avg: st.busyN ? st.busySum / st.busyN / st.budget : 0, max: st.busyMax / st.budget, n: st.busyN };
    st.busySum = 0;
    st.busyN = 0;
    st.busyMax = 0;
    return r;
  }

  /** Chunks that were missing while reading (should never happen). */
  missingChunks(): number {
    let n = 0;
    for (const t of this.tracks) n += t.data.missing;
    return n;
  }

  get memoryBytes(): number {
    return this.factory.memoryBytes;
  }

  get latency(): LatencyModel {
    return this.lat;
  }
}
