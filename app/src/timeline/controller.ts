// The timeline's imperative core: owns the horizontal view (`t0`, `pps`),
// draws the layers and handles the pointer. React only renders its skeleton
// (`Timeline.tsx`); nothing here goes through React state, so scrolling and
// the playhead never cause a render.
//
// Layers, from the bottom (see `timeline.css`):
//   ruler    : DOM row backgrounds, the loop band (DOM), one canvas with the
//              tempo line, bar ticks and numbers, the playhead (DOM)
//   lanes    : one grid canvas under all lanes (bar lines, sub-grid), one
//              waveform canvas per lane (dimmed with CSS opacity), the loop
//              veil (DOM), the playhead (DOM)
// The canvases are as big as the viewport and redrawn only when what they show
// changes (scroll, zoom, grid, tracks, loop, size). The playhead is two DOM
// elements moved with a transform in the shared frame loop: no repaint.

import { getEngine } from '../audio';
import { onAudioChange } from '../audio/registry';
import { snapTime } from '../grid/lines';
import type { Seconds, TimeRange } from '../model/project';
import { applyAutoFit, seek, setLoopRegion, setZoom } from '../store/actions';
import { appStore, type AppState } from '../store/store';
import { onFrame } from '../ui/frameLoop';
import { isPhoneLayout } from '../util/media';
import { PHONE_BAR_WIDTH, clampScale } from '../view/zoom';
import { clamp, meterAtBar } from '../grid/tempoMap';
import {
  DRAG_THRESHOLD_PX,
  EDGE_GRAB_PX,
  adjustLoopEdge,
  clampT0,
  fitToView,
  followT0,
  hitLoopEdge,
  loopFromDrag,
  pxPerSecondForBarWidth,
  sliderAnchorX,
  timeToX,
  wheelPixels,
  wheelZoomFactor,
  xToTime,
  type LoopEdge,
} from './geometry';
import { drawGrid, drawRuler, drawWave, readColors, type Colors } from './drawing';
import { RULER_ROW_HEIGHT, TRACKS_FOOT, rulerHeight, rulerRows } from './layout';
import { getPeaks, onPeaksChange } from './peakCache';

const GRID = 1;
const WAVES = 2;
const RULER = 4;
const LOOP = 8;
const BAR = 16;
const ALL = GRID | WAVES | RULER | LOOP | BAR;

const MAX_DPR = 3;
const AUTOSCROLL_ZONE_PX = 32;
const MOMENTUM_MIN = 0.03; // px per ms
const TAP_MAX_MS = 600;

type Region = 'tempo' | 'mesures' | 'lane';

interface Lane {
  id: string;
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

type Gesture =
  | { kind: 'press'; pointerId: number; region: Region; startX: number; startY: number; startTime: Seconds; at: number; touch: boolean }
  | { kind: 'select'; pointerId: number; startTime: Seconds; last: TimeRange | null }
  | { kind: 'edge'; pointerId: number; edge: LoopEdge; origin: TimeRange; last: TimeRange | null }
  | { kind: 'pan'; pointerId: number; lastX: number; velocity: number; lastAt: number }
  | { kind: 'pinch'; pps0: number; dist0: number; anchorTime: Seconds };

export class TimelineController {
  private readonly root: HTMLElement;
  private readonly scroller: HTMLElement;
  private readonly ruler: HTMLElement;
  private readonly rulerCanvas: HTMLCanvasElement;
  private readonly rulerCtx: CanvasRenderingContext2D;
  private readonly corps: HTMLElement;
  private readonly gridCanvas: HTMLCanvasElement;
  private readonly gridCtx: CanvasRenderingContext2D;
  private readonly band: HTMLElement;
  private readonly veil: HTMLElement;
  private readonly headRuler: HTMLElement;
  private readonly headLanes: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly thumb: HTMLElement;
  private readonly colors: Colors;
  private readonly cleanups: (() => void)[] = [];
  private readonly reducedMotion: boolean;
  private lanes: Lane[] = [];

  private s: AppState = appStore.getState();
  private alive = true;
  private dirty = ALL;

  // The view.
  private t0 = 0;
  private pps: number = this.s.view.pxPerSecond;
  private viewW = 0;
  private viewH = 0;
  private dpr = 1;
  private corpsH = 0;

  // Playhead and following.
  private lastPos = Number.NaN;
  private lastX = Number.NaN;
  private headVisible = true;
  private followSuspended = false;
  private lastWheelAt = -1e9;
  private lastNow = 0;

  // Pointer.
  private gesture: Gesture | null = null;
  private readonly touches = new Map<number, { x: number; y: number }>();
  private momentum = 0;
  private lastClientX = 0;
  private barDrag: { startX: number; startT0: number; trackW: number } | null = null;
  private gestureScale0 = 1;

  // Phone default scale (86 px per bar) and whether the user moved away from it.
  private phoneScale: number | null = null;
  private userZoomed = false;

  constructor(root: HTMLElement, scroller: HTMLElement) {
    this.root = root;
    this.scroller = scroller;
    const q = <T extends HTMLElement>(sel: string): T => {
      const el = root.querySelector<T>(sel);
      if (!el) throw new Error(`timeline: missing ${sel}`);
      return el;
    };
    this.ruler = q('.frise-regle');
    this.rulerCanvas = q<HTMLCanvasElement>('.frise-regle-toile');
    this.corps = q('.frise-corps');
    this.gridCanvas = q<HTMLCanvasElement>('.frise-grille');
    this.band = q('.frise-bande');
    this.veil = q('.frise-voile');
    this.headRuler = q('.frise-regle .frise-lecture');
    this.headLanes = q('.frise-corps .frise-lecture');
    this.bar = q('.frise-defile');
    this.thumb = q('.frise-pouce');
    this.rulerCtx = this.rulerCanvas.getContext('2d')!;
    this.gridCtx = this.gridCanvas.getContext('2d')!;
    this.colors = readColors(document.documentElement);
    this.reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.lanesChanged();
    this.bindStore();
    this.bindPointer();
    this.bindScrollbar();
    this.cleanups.push(onFrame((now) => this.frame(now)));
    this.cleanups.push(onPeaksChange(() => this.invalidate(WAVES)));
    this.cleanups.push(onAudioChange(() => this.invalidate(WAVES)));

    const resize = new ResizeObserver(() => this.resize());
    resize.observe(root);
    resize.observe(this.corps);
    resize.observe(scroller);
    this.cleanups.push(() => resize.disconnect());
    const fonts = document.fonts;
    if (fonts) {
      void fonts.ready.then(() => this.invalidate(RULER));
      const onFonts = () => this.invalidate(RULER);
      fonts.addEventListener('loadingdone', onFonts);
      this.cleanups.push(() => fonts.removeEventListener('loadingdone', onFonts));
    }
    if (this.s.project) this.onProjectOpened();
    this.resize();
  }

  dispose(): void {
    this.alive = false;
    this.cleanups.forEach((fn) => fn());
    this.cleanups.length = 0;
  }

  /** The lane elements changed (tracks added, removed, reordered): collect them again. */
  lanesChanged(): void {
    this.lanes = [...this.root.querySelectorAll<HTMLElement>('.frise-voie')].flatMap((el) => {
      const canvas = el.querySelector<HTMLCanvasElement>('canvas');
      const ctx = canvas?.getContext('2d');
      return canvas && ctx ? [{ id: el.dataset.track ?? '', el, canvas, ctx }] : [];
    });
    this.dirty |= WAVES;
    if (this.viewW > 0) this.resize();
  }

  // ---------------------------------------------------------------- invalidation and sizes

  private invalidate(flags: number): void {
    this.dirty |= flags;
  }

  private resize(): void {
    if (!this.alive) return;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const viewW = this.root.clientWidth;
    const viewH = this.scroller.clientHeight;
    const corpsH = this.corps.clientHeight;
    const changed = viewW !== this.viewW || viewH !== this.viewH || corpsH !== this.corpsH || dpr !== this.dpr;
    this.viewW = viewW;
    this.viewH = viewH;
    this.corpsH = corpsH;
    this.dpr = dpr;
    if (viewW <= 0) return;
    this.fit();
    this.t0 = this.clampView(this.t0);
    if (changed || this.dirty) {
      this.dirty |= ALL;
      this.flush();
    }
  }

  private sizeCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const pw = Math.max(1, Math.round(w * this.dpr));
    const ph = Math.max(1, Math.round(h * this.dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private get duration(): Seconds {
    return this.s.project?.duration ?? 0;
  }

  private clampView(t0: Seconds): Seconds {
    return clampT0(t0, this.duration, this.viewW, this.pps);
  }

  // ---------------------------------------------------------------- drawing

  private flush(): void {
    const d = this.dirty;
    this.dirty = 0;
    if (this.viewW <= 0) return;
    const { viewW: w, dpr, t0, pps } = this;
    const s = this.s;
    if (d & GRID) {
      this.sizeCanvas(this.gridCanvas, this.gridCtx, w, this.corpsH);
      drawGrid(this.gridCtx, {
        w,
        h: this.corpsH,
        dpr,
        t0,
        pps,
        map: s.tempoMap,
        duration: this.duration,
        subdivision: s.view.subdivision,
        triplets: s.view.triplets,
        colors: this.colors,
      });
    }
    if (d & WAVES) this.drawWaves();
    if (d & RULER) {
      const rows = rulerRows({ hasChords: false });
      const h = rows.reduce((sum, r) => sum + r.height, 0);
      this.sizeCanvas(this.rulerCanvas, this.rulerCtx, w, h);
      drawRuler(this.rulerCtx, {
        w,
        h,
        dpr,
        t0,
        pps,
        map: s.tempoMap,
        duration: this.duration,
        loop: s.loop.region,
        loopEnabled: s.loop.enabled,
        colors: this.colors,
        tempoTop: 0,
        mesuresTop: h - RULER_ROW_HEIGHT.mesures,
      });
    }
    if (d & LOOP) this.placeLoop();
    if (d & BAR) this.placeScrollbar();
    this.placeHead(this.lastPos, true);
  }

  private drawWaves(): void {
    for (const lane of this.lanes) {
      const w = lane.el.clientWidth;
      const h = lane.el.clientHeight;
      if (w <= 0 || h <= 0) continue;
      this.sizeCanvas(lane.canvas, lane.ctx, w, h);
      const track = this.s.tracks.find((tr) => tr.id === lane.id);
      const pyramid = track ? getPeaks(track.audio.id) : undefined;
      if (!track || !pyramid) {
        lane.ctx.clearRect(0, 0, w, h);
        continue;
      }
      drawWave(lane.ctx, { w, h, dpr: this.dpr, t0: this.t0, pps: this.pps, pyramid, color: this.hue(track.role) });
    }
  }

  private readonly hues = new Map<string, string>();
  private hue(role: string): string {
    let v = this.hues.get(role);
    if (!v) {
      v = getComputedStyle(document.documentElement).getPropertyValue(`--${role}`).trim() || '#8d8176';
      this.hues.set(role, v);
    }
    return v;
  }

  /** Places the loop band (ruler) and the veil (lanes), dimmed when the loop is off. */
  private placeLoop(): void {
    const { region, enabled } = this.s.loop;
    for (const el of [this.band, this.veil]) {
      el.classList.toggle('eteinte', !enabled);
    }
    if (!region) {
      this.band.hidden = true;
      this.veil.hidden = true;
      return;
    }
    const x0 = timeToX(region.start, this.t0, this.pps);
    const x1 = timeToX(region.end, this.t0, this.pps);
    const visible = x1 > 0 && x0 < this.viewW;
    this.band.hidden = !visible;
    this.veil.hidden = !visible;
    if (!visible) return;
    const left = Math.max(x0, -2);
    const right = Math.min(x1, this.viewW + 2);
    for (const el of [this.band, this.veil]) {
      el.style.left = `${left}px`;
      el.style.width = `${right - left}px`;
      el.classList.toggle('coupee-gauche', x0 < -2);
      el.classList.toggle('coupee-droite', x1 > this.viewW + 2);
    }
  }

  private placeScrollbar(): void {
    const span = this.viewW / this.pps;
    const duration = this.duration;
    const scrollable = duration > span + 1e-6;
    this.bar.classList.toggle('inutile', !scrollable);
    this.bar.tabIndex = scrollable ? 0 : -1;
    if (!scrollable) return;
    const trackW = this.bar.clientWidth;
    const size = Math.max(32, (span / duration) * trackW);
    const room = trackW - size;
    const x = (this.t0 / (duration - span)) * room;
    this.thumb.style.width = `${size}px`;
    this.thumb.style.transform = `translateX(${x}px)`;
    this.bar.setAttribute('aria-valuemin', '0');
    this.bar.setAttribute('aria-valuemax', String(Math.round(duration - span)));
    this.bar.setAttribute('aria-valuenow', String(Math.round(this.t0)));
  }

  private placeHead(pos: Seconds, force = false): void {
    if (!Number.isFinite(pos)) return;
    const x = timeToX(pos, this.t0, this.pps);
    if (x === this.lastX && !force) return;
    this.lastX = x;
    const visible = x >= -8 && x <= this.viewW + 8;
    if (visible !== this.headVisible) {
      this.headVisible = visible;
      this.headRuler.style.visibility = visible ? '' : 'hidden';
      this.headLanes.style.visibility = visible ? '' : 'hidden';
    }
    if (visible) {
      const tf = `translate3d(${x}px,0,0)`;
      this.headRuler.style.transform = tf;
      this.headLanes.style.transform = tf;
    }
  }

  // ---------------------------------------------------------------- frame loop

  private frame(now: number): void {
    if (!this.alive || this.viewW <= 0) return;
    const dt = Math.min(50, now - this.lastNow || 16);
    this.lastNow = now;
    if (Math.min(MAX_DPR, window.devicePixelRatio || 1) !== this.dpr) this.resize();

    if (this.momentum !== 0) {
      this.scrollByPx(-this.momentum * dt);
      this.momentum *= Math.exp(-dt / 325);
      if (Math.abs(this.momentum) < MOMENTUM_MIN) this.momentum = 0;
    }
    this.autoScroll(dt);

    const pos = getEngine().getPosition();
    this.follow(pos, now);
    this.lastPos = pos;
    if (this.dirty) this.flush();
    else this.placeHead(pos);
  }

  private follow(pos: Seconds, now: number): void {
    const jumped = !Number.isFinite(this.lastPos) || Math.abs(pos - this.lastPos) > 0.3;
    const moving = this.s.transport.engine === 'playing' || jumped;
    if (jumped) this.followSuspended = false;
    const busy = this.gesture !== null || this.momentum !== 0 || this.barDrag !== null || now - this.lastWheelAt < 250;
    if (!this.s.view.follow || busy || !moving) return;
    const next = followT0({ t0: this.t0, position: pos, pps: this.pps, viewW: this.viewW, duration: this.duration });
    if (this.followSuspended) {
      // The user looked elsewhere: wait until the playhead is back in sight.
      const x = timeToX(pos, this.t0, this.pps);
      if (x >= 0 && x <= this.viewW) this.followSuspended = false;
      return;
    }
    if (next !== null) this.setT0(next);
  }

  private setT0(t0: Seconds): void {
    const next = this.clampView(t0);
    if (Math.abs(next - this.t0) < 1e-9) return;
    this.t0 = next;
    this.invalidate(ALL);
  }

  /** The user moved the view: automatic following waits for the playhead to come back. */
  private userScrolled(): void {
    this.followSuspended = true;
  }

  private scrollByPx(dx: number): void {
    this.setT0(this.t0 + dx / this.pps);
  }

  private autoScroll(dt: number): void {
    const g = this.gesture;
    if (!g || (g.kind !== 'select' && g.kind !== 'edge')) return;
    const x = this.lastClientX - this.root.getBoundingClientRect().left;
    let speed = 0;
    if (x < AUTOSCROLL_ZONE_PX) speed = -(AUTOSCROLL_ZONE_PX - x);
    else if (x > this.viewW - AUTOSCROLL_ZONE_PX) speed = x - (this.viewW - AUTOSCROLL_ZONE_PX);
    if (speed === 0) return;
    const before = this.t0;
    this.scrollByPx(clamp(speed, -80, 80) * 0.18 * (dt / 16));
    if (this.t0 !== before) this.dragTo(this.lastClientX);
  }

  // ---------------------------------------------------------------- store

  private bindStore(): void {
    const off = appStore.subscribe((s, prev) => {
      this.s = s;
      if (s.project?.id !== prev.project?.id) {
        this.onProjectOpened();
        return;
      }
      if (s.tracks.length !== prev.tracks.length || s.project?.duration !== prev.project?.duration) {
        this.invalidate(ALL);
        this.fit();
      }
      if (s.tempoMap !== prev.tempoMap) {
        this.invalidate(GRID | RULER | LOOP);
        this.applyPhoneScale();
      }
      if (s.loop !== prev.loop) this.invalidate(RULER | LOOP);
      if (s.view.subdivision !== prev.view.subdivision || s.view.triplets !== prev.view.triplets) this.invalidate(GRID);
      if (s.view.pxPerSecond !== prev.view.pxPerSecond) this.scaleFromStore(s.view.pxPerSecond);
      if (s.view.trackHeight !== prev.view.trackHeight) this.invalidate(ALL);
      if (s.view.auto && !prev.view.auto) this.fit();
      if (s.transport.engine === 'playing' && prev.transport.engine !== 'playing') this.followSuspended = false;
    });
    this.cleanups.push(off);
  }

  private onProjectOpened(): void {
    this.t0 = 0;
    this.userZoomed = false;
    this.phoneScale = null;
    this.followSuspended = false;
    this.lastPos = Number.NaN;
    this.momentum = 0;
    this.gesture = null;
    this.touches.clear();
    this.invalidate(ALL);
    this.applyPhoneScale();
    this.fit();
  }

  /** Phone: bars are 86 px wide until the user pinches (DESIGN.md « Téléphone »). */
  private applyPhoneScale(): void {
    const s = this.s;
    if (!isPhoneLayout() || s.view.auto || this.userZoomed || !s.project) return;
    const meter = meterAtBar(s.tempoMap, 0);
    const bpm = s.tempoMap.segments[0]!.bpm;
    const barSeconds = (60 / bpm) * meter.numerator;
    const pps = pxPerSecondForBarWidth(PHONE_BAR_WIDTH, barSeconds);
    if (Math.abs(pps - this.pps) < 1e-6) return;
    this.phoneScale = pps;
    this.applyScale(pps, 0);
    setZoom(pps);
  }

  /** A scale written to the store by someone else (slider, Auto): keep the playhead or the centre in place. */
  private scaleFromStore(pps: number): void {
    if (Math.abs(pps - this.pps) < 1e-9) return;
    if (this.phoneScale === null || Math.abs(pps - this.phoneScale) > 1e-6) {
      if (!this.s.view.auto) this.userZoomed = true;
    }
    const anchorX = sliderAnchorX(getEngine().getPosition(), this.t0, this.pps, this.viewW);
    this.applyScale(pps, anchorX);
  }

  /** Changes the scale of the view, keeping the time under `anchorX` where it is. */
  private applyScale(pps: number, anchorX: number): void {
    const next = clampScale(pps);
    const anchorTime = this.t0 + anchorX / this.pps;
    this.pps = next;
    this.t0 = this.clampView(anchorTime - anchorX / next);
    this.invalidate(ALL);
  }

  /** « Auto »: the whole piece and all the tracks in the window. */
  private fit(): void {
    const s = this.s;
    if (!s.view.auto || !s.project || this.viewW <= 0) return;
    const fitted = fitToView({
      duration: s.project.duration,
      viewW: this.viewW,
      viewH: this.viewH,
      trackCount: s.tracks.length,
      rulerHeight: rulerHeight(rulerRows({ hasChords: false })),
      foot: TRACKS_FOOT,
    });
    if (!fitted) return;
    const same = Math.abs(fitted.pxPerSecond - s.view.pxPerSecond) < 1e-9 && fitted.trackHeight === s.view.trackHeight;
    if (this.pps !== fitted.pxPerSecond || this.t0 !== 0) {
      this.pps = fitted.pxPerSecond;
      this.t0 = this.clampView(0);
      this.invalidate(ALL);
    }
    if (!same) applyAutoFit(fitted.pxPerSecond, fitted.trackHeight);
  }

  // ---------------------------------------------------------------- pointer

  private bindPointer(): void {
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.cleanups.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    for (const el of [this.ruler, this.corps]) {
      on(el, 'pointerdown', (e) => this.onPointerDown(e));
      on(el, 'pointermove', (e) => this.onPointerMove(e));
      on(el, 'pointerup', (e) => this.onPointerUp(e));
      on(el, 'pointercancel', (e) => this.onPointerCancel(e));
      on(el, 'lostpointercapture', (e) => this.onPointerCancel(e));
    }
    on(this.root, 'wheel', (e) => this.onWheel(e), { passive: false });
    // Safari reports the trackpad pinch as gesture events.
    const gesture = (type: string, fn: (e: Event & { scale: number; clientX: number }) => void) => {
      const h = (e: Event) => fn(e as Event & { scale: number; clientX: number });
      this.root.addEventListener(type, h);
      this.cleanups.push(() => this.root.removeEventListener(type, h));
    };
    gesture('gesturestart', (e) => {
      e.preventDefault();
      this.gestureScale0 = this.pps;
    });
    gesture('gesturechange', (e) => {
      e.preventDefault();
      this.zoomTo(this.gestureScale0 * e.scale, e.clientX - this.root.getBoundingClientRect().left);
    });
  }

  private regionAt(clientY: number): Region | null {
    const r = this.ruler.getBoundingClientRect();
    if (clientY >= r.top && clientY < r.bottom) {
      return clientY - r.top < RULER_ROW_HEIGHT.tempo ? 'tempo' : 'mesures';
    }
    const c = this.corps.getBoundingClientRect();
    return clientY >= c.top && clientY < c.bottom ? 'lane' : null;
  }

  private localX(clientX: number): number {
    return clientX - this.root.getBoundingClientRect().left;
  }

  private timeAt(clientX: number): Seconds {
    return xToTime(this.localX(clientX), this.t0, this.pps);
  }

  /** The loop edge under the pointer, if the pointer is on a place where edges can be grabbed. */
  private edgeAt(clientX: number, region: Region, touch: boolean): LoopEdge | null {
    const loop = this.s.loop.region;
    if (!loop || region === 'tempo' || (region === 'lane' && touch)) return null;
    const tol = touch ? EDGE_GRAB_PX.touch : region === 'lane' ? EDGE_GRAB_PX.mouse - 2 : EDGE_GRAB_PX.mouse;
    return hitLoopEdge(this.localX(clientX), timeToX(loop.start, this.t0, this.pps), timeToX(loop.end, this.t0, this.pps), tol);
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const region = this.regionAt(e.clientY);
    if (!region) return;
    this.momentum = 0;
    this.lastClientX = e.clientX;
    const touch = e.pointerType === 'touch';
    if (touch) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        this.startPinch();
        return;
      }
      if (this.touches.size > 2) return;
    }
    if (this.gesture) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const edge = this.edgeAt(e.clientX, region, touch);
    const loop = this.s.loop.region;
    if (edge && loop) {
      this.gesture = { kind: 'edge', pointerId: e.pointerId, edge, origin: { ...loop }, last: null };
      this.root.style.cursor = 'ew-resize';
      this.userScrolled();
      return;
    }
    this.gesture = {
      kind: 'press',
      pointerId: e.pointerId,
      region,
      startX: e.clientX,
      startY: e.clientY,
      startTime: this.timeAt(e.clientX),
      at: e.timeStamp,
      touch,
    };
  }

  private onPointerMove(e: PointerEvent): void {
    this.lastClientX = e.clientX;
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = this.gesture;
    if (!g) {
      if (e.pointerType !== 'touch') this.hover(e);
      return;
    }
    if (g.kind === 'pinch') {
      this.pinchMove();
      return;
    }
    if (g.pointerId !== e.pointerId) return;
    if (g.kind === 'press') {
      if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_THRESHOLD_PX) return;
      if (g.region === 'tempo' || (g.region === 'lane' && g.touch)) {
        this.gesture = { kind: 'pan', pointerId: g.pointerId, lastX: g.startX, velocity: 0, lastAt: e.timeStamp };
        this.root.style.cursor = 'grabbing';
        this.panMove(e);
      } else {
        this.gesture = { kind: 'select', pointerId: g.pointerId, startTime: g.startTime, last: null };
        this.root.style.cursor = 'ew-resize';
        this.userScrolled();
        this.dragTo(e.clientX);
      }
      return;
    }
    if (g.kind === 'pan') this.panMove(e);
    else this.dragTo(e.clientX);
  }

  private panMove(e: PointerEvent): void {
    const g = this.gesture;
    if (!g || g.kind !== 'pan') return;
    const dx = e.clientX - g.lastX;
    const dtMs = Math.max(1, e.timeStamp - g.lastAt);
    g.velocity = g.velocity * 0.6 + (dx / dtMs) * 0.4;
    g.lastX = e.clientX;
    g.lastAt = e.timeStamp;
    this.userScrolled();
    this.scrollByPx(-dx);
  }

  /** Updates the loop while a selection or an edge is being dragged. */
  private dragTo(clientX: number): void {
    const g = this.gesture;
    if (!g || (g.kind !== 'select' && g.kind !== 'edge')) return;
    const t = this.timeAt(clientX);
    const map = this.s.tempoMap;
    const duration = this.duration;
    const next = g.kind === 'select' ? loopFromDrag(map, g.startTime, t, duration) : adjustLoopEdge(map, g.origin, g.edge, t, duration);
    if (g.last && Math.abs(g.last.start - next.start) < 1e-9 && Math.abs(g.last.end - next.end) < 1e-9) return;
    g.last = next;
    setLoopRegion(next);
  }

  private onPointerUp(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    const g = this.gesture;
    if (!g) return;
    if (g.kind === 'pinch') {
      if (this.touches.size < 2) this.endGesture();
      return;
    }
    if (g.pointerId !== e.pointerId) return;
    if (g.kind === 'press') {
      if (e.timeStamp - g.at <= TAP_MAX_MS || !g.touch) this.seekAt(e.clientX, g.region);
    } else if (g.kind === 'pan' && !this.reducedMotion && Math.abs(g.velocity) > MOMENTUM_MIN * 3 && e.timeStamp - g.lastAt < 80) {
      this.momentum = g.velocity;
    }
    this.endGesture();
  }

  private onPointerCancel(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    const g = this.gesture;
    if (!g) return;
    if (g.kind === 'pinch') {
      if (this.touches.size < 2) this.endGesture();
      return;
    }
    if (g.pointerId === e.pointerId) this.endGesture();
  }

  private endGesture(): void {
    this.gesture = null;
    this.root.style.cursor = '';
  }

  /** A click or a tap: moves the playhead, snapped to the sub-grid when the magnet is on. */
  private seekAt(clientX: number, region: Region): void {
    if (region === 'tempo') return;
    let t = clamp(this.timeAt(clientX), 0, this.duration);
    const { view, tempoMap } = this.s;
    if (view.snap) t = clamp(snapTime(tempoMap, t, { subdivision: view.subdivision, triplets: view.triplets }), 0, this.duration);
    this.followSuspended = false;
    seek(t);
  }

  private hover(e: PointerEvent): void {
    const region = this.regionAt(e.clientY);
    let cursor = '';
    if (region === 'mesures' || region === 'lane') cursor = this.edgeAt(e.clientX, region, false) ? 'ew-resize' : 'pointer';
    else if (region === 'tempo') cursor = 'grab';
    if (this.root.style.cursor !== cursor) this.root.style.cursor = cursor;
  }

  // ---------------------------------------------------------------- pinch and wheel

  private startPinch(): void {
    const pts = [...this.touches.values()];
    const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
    const midX = this.localX((a.x + b.x) / 2);
    this.gesture = {
      kind: 'pinch',
      pps0: this.pps,
      dist0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      anchorTime: xToTime(midX, this.t0, this.pps),
    };
    this.userScrolled();
  }

  private pinchMove(): void {
    const g = this.gesture;
    if (!g || g.kind !== 'pinch' || this.touches.size < 2) return;
    const [a, b] = [...this.touches.values()] as [{ x: number; y: number }, { x: number; y: number }];
    const midX = this.localX((a.x + b.x) / 2);
    const pps = clampScale(g.pps0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.dist0));
    this.pps = pps;
    this.t0 = this.clampView(g.anchorTime - midX / pps);
    this.invalidate(ALL);
    this.userZoomed = true;
    setZoom(pps);
  }

  /** Zoom around a pixel of the lanes (wheel, pinch): the time under it stays under it. */
  private zoomTo(pps: number, anchorX: number): void {
    const next = clampScale(pps);
    if (next === this.pps) return;
    this.applyScale(next, anchorX);
    this.userZoomed = true;
    this.userScrolled();
    setZoom(next);
  }

  private onWheel(e: WheelEvent): void {
    const page = this.viewW;
    const dx = wheelPixels(e.deltaX, e.deltaMode, page);
    const dy = wheelPixels(e.deltaY, e.deltaMode, this.viewH);
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      this.zoomTo(this.pps * wheelZoomFactor(dy), this.localX(e.clientX));
      return;
    }
    const horizontal = Math.abs(dx) > Math.abs(dy) ? dx : e.shiftKey ? dy : 0;
    if (horizontal === 0) return; // plain vertical wheel: the tracks scroll natively
    e.preventDefault();
    this.momentum = 0;
    this.lastWheelAt = performance.now();
    this.userScrolled();
    this.scrollByPx(horizontal);
  }

  // ---------------------------------------------------------------- scrollbar

  private bindScrollbar(): void {
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      this.bar.addEventListener(type, fn as EventListener);
      this.cleanups.push(() => this.bar.removeEventListener(type, fn as EventListener));
    };
    on('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const trackW = this.bar.clientWidth;
      if (e.target === this.thumb) {
        this.barDrag = { startX: e.clientX, startT0: this.t0, trackW };
        this.bar.setPointerCapture(e.pointerId);
        this.bar.classList.add('saisie');
      } else {
        // A click on the rule moves by one page towards it.
        const thumbRect = this.thumb.getBoundingClientRect();
        const dir = e.clientX < thumbRect.left ? -1 : 1;
        this.userScrolled();
        this.setT0(this.t0 + (dir * this.viewW * 0.9) / this.pps);
      }
      this.momentum = 0;
    });
    on('pointermove', (e) => {
      const d = this.barDrag;
      if (!d) return;
      this.userScrolled();
      this.setT0(d.startT0 + ((e.clientX - d.startX) * this.duration) / d.trackW);
    });
    const end = () => {
      this.barDrag = null;
      this.bar.classList.remove('saisie');
    };
    on('pointerup', end);
    on('pointercancel', end);
    on('keydown', (e) => {
      const span = this.viewW / this.pps;
      const step: Record<string, number> = { ArrowLeft: -0.1 * span, ArrowRight: 0.1 * span, PageUp: -0.9 * span, PageDown: 0.9 * span };
      let t = this.t0;
      if (e.key in step) t += step[e.key]!;
      else if (e.key === 'Home') t = 0;
      else if (e.key === 'End') t = this.duration;
      else return;
      e.preventDefault();
      this.userScrolled();
      this.setT0(t);
    });
  }
}
