// Stacked waveform display on one canvas: scroll/zoom from precomputed min/max pyramids,
// playhead, beat grid and a draggable loop region. Time unit: seconds.

export class WaveformView {
	/**
	 * @param {HTMLCanvasElement} canvas
	 * @param {object} cb { onSeek(t), onLoop(start,end,final), onView() }
	 */
	constructor(canvas, cb) {
		this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
		this.cb = cb || {};
		this.tracks = [];          // {name, peaks:{frames, levels[]}, mute, dim}
		this.sr = 44100; this.duration = 0;
		this.t0 = 0; this.span = 10; // visible start and length (s)
		this.playhead = 0;
		this.loop = null;          // {start,end,enabled}
		this.grid = null;          // {bpm, offset, beatsPerBar}
		this.snap = true;
		this.follow = true;
		this.rulerH = 26; this.trackH = 70;
		this.dirty = true;
		this.fps = { frames: 0, last: performance.now(), value: 0, min: 1e9, drawMs: 0, drawMax: 0, samples: 0, sumDraw: 0 };
		this.pointers = new Map(); this.drag = null;
		this.colors = ['#8a4b2a', '#6b5b2e', '#4f6a4a', '#7a3f55', '#3f5f7a', '#7a6a2a', '#5a4a6a'];
		this._bind();
		this._resize();
		new ResizeObserver(() => this._resize()).observe(canvas.parentElement);
		const loop = (now) => { this._frame(now); requestAnimationFrame(loop); };
		requestAnimationFrame(loop);
	}

	setTracks(tracks, sr, duration) {
		this.tracks = tracks; this.sr = sr; this.duration = duration;
		this.t0 = 0; this.span = Math.max(1, duration);
		this._resize(); this.dirty = true;
	}
	setLoop(loop) { this.loop = loop; this.dirty = true; }
	setGrid(grid) { this.grid = grid; this.dirty = true; }
	setPlayhead(t) {
		this.playhead = t; this.dirty = true;
		if (this.follow && !this.drag) { // keep the playhead in the view: page scroll when it leaves
			if (t < this.t0 || t > this.t0 + this.span * 0.92) { this.t0 = Math.max(0, Math.min(this.duration - this.span, t - this.span * 0.08)); this._viewChanged(); }
		}
	}
	setView(t0, span) {
		span = Math.max(0.05, Math.min(this.duration || 1, span));
		this.t0 = Math.max(0, Math.min(Math.max(0, this.duration - span), t0)); this.span = span;
		this.dirty = true; this._viewChanged();
	}
	zoom(factor, anchorT) {
		const a = anchorT === undefined ? this.t0 + this.span / 2 : anchorT;
		const span = Math.max(0.05, Math.min(this.duration || 1, this.span * factor));
		const frac = (a - this.t0) / this.span;
		this.setView(a - frac * span, span);
	}
	showAll() { this.setView(0, this.duration); }
	showLoop() { if (this.loop && this.loop.end > this.loop.start) { const m = (this.loop.end - this.loop.start) * 0.1; this.setView(this.loop.start - m, this.loop.end - this.loop.start + 2 * m); } }
	_viewChanged() { if (this.cb.onView) this.cb.onView(this.t0, this.span); }

	// ---------------------------------------------------------------- layout
	_resize() {
		const dpr = Math.min(window.devicePixelRatio || 1, 3);
		const w = Math.max(100, Math.floor(this.canvas.parentElement.clientWidth));
		const n = Math.max(1, this.tracks.length);
		this.trackH = Math.max(46, Math.min(84, Math.floor(520 / n)));
		const h = this.rulerH + n * this.trackH;
		this.cssW = w; this.cssH = h; this.dpr = dpr;
		this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
		this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
		this.dirty = true;
	}
	tToX(t) { return (t - this.t0) / this.span * this.cssW; }
	xToT(x) { return this.t0 + x / this.cssW * this.span; }

	// ---------------------------------------------------------------- drawing
	_frame(now) {
		const f = this.fps;
		if (this.dirty) {
			const a = performance.now();
			this.draw();
			const ms = performance.now() - a;
			f.sumDraw += ms; f.samples++; f.drawMs = ms; if (ms > f.drawMax) f.drawMax = ms;
			this.dirty = false; f.frames++;
		}
		if (now - f.last >= 1000) {
			f.value = f.frames * 1000 / (now - f.last);
			if (this.playing && f.value < f.min) f.min = f.value; // only meaningful while the display is animated
			f.frames = 0; f.last = now;
		}
	}
	requestDraw() { this.dirty = true; }

	draw() {
		const ctx = this.ctx, dpr = this.dpr, W = this.cssW, H = this.cssH;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = '#fbf6ec'; ctx.fillRect(0, 0, W, H);
		const sr = this.sr, spp = this.span / W * sr; // source frames per pixel
		const n = this.tracks.length;
		// track backgrounds
		for (let i = 0; i < n; i++) {
			const y = this.rulerH + i * this.trackH;
			ctx.fillStyle = i % 2 ? '#f6eedf' : '#faf3e6'; ctx.fillRect(0, y, W, this.trackH);
		}
		// loop region (under the waveforms)
		if (this.loop && this.loop.end > this.loop.start) {
			const x0 = this.tToX(this.loop.start), x1 = this.tToX(this.loop.end);
			ctx.fillStyle = this.loop.enabled ? 'rgba(176,96,48,0.22)' : 'rgba(120,100,80,0.14)';
			ctx.fillRect(x0, 0, x1 - x0, H);
		}
		this._grid(ctx, W, H);
		// waveforms
		for (let i = 0; i < n; i++) {
			const tr = this.tracks[i], y0 = this.rulerH + i * this.trackH, mid = y0 + this.trackH / 2, amp = this.trackH * 0.46;
			ctx.fillStyle = tr.dim ? 'rgba(138,110,88,0.35)' : this.colors[i % this.colors.length];
			const lv = tr.peaks.levels;
			let li = 0; while (li + 1 < lv.length && lv[li + 1].block <= spp) li++;
			const L = lv[li], block = L.block, mn = L.min, mx = L.max, len = mn.length;
			ctx.beginPath();
			const f0 = this.t0 * sr;
			for (let x = 0; x < W; x++) {
				const a = f0 + x * spp, b = a + spp;
				let i0 = Math.floor(a / block), i1 = Math.max(i0 + 1, Math.ceil(b / block));
				if (i1 <= 0 || i0 >= len) continue;
				if (i0 < 0) i0 = 0; if (i1 > len) i1 = len;
				let lo = 1, hi = -1;
				for (let k = i0; k < i1; k++) { if (mn[k] < lo) lo = mn[k]; if (mx[k] > hi) hi = mx[k]; }
				const yt = mid - hi * amp, hgt = Math.max(1, (hi - lo) * amp);
				ctx.rect(x, yt, 1, hgt);
			}
			ctx.fill();
			ctx.fillStyle = 'rgba(58,42,30,0.55)'; ctx.font = '11px Georgia, serif'; ctx.textBaseline = 'top';
			ctx.fillText(tr.name, 6, y0 + 3);
		}
		// separators
		ctx.strokeStyle = 'rgba(58,42,30,0.15)'; ctx.lineWidth = 1; ctx.beginPath();
		for (let i = 0; i <= n; i++) { const y = Math.round(this.rulerH + i * this.trackH) + 0.5; ctx.moveTo(0, y); ctx.lineTo(W, y); }
		ctx.stroke();
		// loop edges
		if (this.loop && this.loop.end > this.loop.start) {
			const x0 = this.tToX(this.loop.start), x1 = this.tToX(this.loop.end);
			ctx.fillStyle = this.loop.enabled ? '#b06030' : '#8a7a68';
			ctx.fillRect(x0 - 1, 0, 3, H); ctx.fillRect(x1 - 1, 0, 3, H);
			ctx.fillRect(x0 - 1, 0, 9, this.rulerH * 0.45); ctx.fillRect(x1 - 8, 0, 9, this.rulerH * 0.45);
		}
		// playhead
		const px = this.tToX(this.playhead);
		if (px >= -2 && px <= W + 2) { ctx.fillStyle = '#3a2a1e'; ctx.fillRect(Math.round(px) - 1, 0, 2, H); }
		this._ruler(ctx, W);
	}

	_grid(ctx, W, H) {
		const g = this.grid; if (!g || !(g.bpm > 0)) return;
		const beat = 60 / g.bpm, t1 = this.t0 + this.span;
		const pxPerBeat = beat / this.span * W;
		if (pxPerBeat < 3) { // too dense: bars only
			if (pxPerBeat * g.beatsPerBar < 3) return;
		}
		const k0 = Math.max(0, Math.floor((this.t0 - g.offset) / beat)), k1 = Math.ceil((t1 - g.offset) / beat);
		ctx.lineWidth = 1;
		for (let k = k0; k <= k1; k++) {
			const bar = k % g.beatsPerBar === 0;
			if (!bar && pxPerBeat < 6) continue;
			const x = Math.round(this.tToX(g.offset + k * beat)) + 0.5;
			ctx.strokeStyle = bar ? 'rgba(58,42,30,0.38)' : 'rgba(58,42,30,0.14)';
			ctx.beginPath(); ctx.moveTo(x, this.rulerH); ctx.lineTo(x, H); ctx.stroke();
		}
	}

	_ruler(ctx, W) {
		ctx.fillStyle = '#efe4d0'; ctx.fillRect(0, 0, W, this.rulerH);
		ctx.strokeStyle = 'rgba(58,42,30,0.35)'; ctx.fillStyle = '#5a4636'; ctx.font = '11px Georgia, serif'; ctx.textBaseline = 'alphabetic';
		const g = this.grid;
		let stepS;
		const target = 70 / W * this.span; // about one label per 70 px
		const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
		stepS = steps.find((s) => s >= target) || 300;
		let useBars = false, barDur = 0;
		if (g && g.bpm > 0) { barDur = 60 / g.bpm * g.beatsPerBar; if (barDur / this.span * W >= 28) useBars = true; }
		ctx.beginPath();
		if (useBars) {
			const mult = Math.max(1, Math.ceil(target / barDur));
			const first = Math.max(0, Math.floor((this.t0 - g.offset) / barDur / mult)) * mult;
			for (let b = first; ; b += mult) {
				const t = g.offset + b * barDur; if (t > this.t0 + this.span) break;
				const x = Math.round(this.tToX(t)) + 0.5;
				ctx.moveTo(x, this.rulerH - 8); ctx.lineTo(x, this.rulerH);
				ctx.fillText(String(b + 1), x + 3, this.rulerH - 8);
			}
		} else {
			for (let t = Math.ceil(this.t0 / stepS) * stepS; t <= this.t0 + this.span; t += stepS) {
				const x = Math.round(this.tToX(t)) + 0.5;
				ctx.moveTo(x, this.rulerH - 8); ctx.lineTo(x, this.rulerH);
				const m = Math.floor(t / 60), s = t - m * 60;
				ctx.fillText(m + ':' + (s < 10 ? '0' : '') + s.toFixed(stepS < 1 ? 2 : 0), x + 3, this.rulerH - 8);
			}
		}
		ctx.stroke();
		ctx.fillStyle = 'rgba(58,42,30,0.2)'; ctx.fillRect(0, this.rulerH - 1, W, 1);
		// loop handles live in the ruler (drawn by draw())
	}

	// ---------------------------------------------------------------- interaction
	_snapT(t) {
		const g = this.grid;
		if (!this.snap || !g || !(g.bpm > 0)) return Math.max(0, Math.min(this.duration, t));
		const beat = 60 / g.bpm, k = Math.round((t - g.offset) / beat);
		return Math.max(0, Math.min(this.duration, g.offset + k * beat));
	}
	_bind() {
		const c = this.canvas;
		c.style.touchAction = 'none';
		c.addEventListener('pointerdown', (e) => this._down(e));
		c.addEventListener('pointermove', (e) => this._move(e));
		c.addEventListener('pointerup', (e) => this._up(e));
		c.addEventListener('pointercancel', (e) => this._up(e));
		c.addEventListener('wheel', (e) => {
			e.preventDefault();
			const x = e.offsetX;
			if (e.ctrlKey || e.metaKey || e.altKey) this.zoom(Math.exp(e.deltaY * 0.0025), this.xToT(x));
			else this.setView(this.t0 + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / this.cssW * this.span, this.span);
		}, { passive: false });
		c.addEventListener('dblclick', () => { if (this.cb.onLoop) this.cb.onLoop(null, null, true); });
	}
	_pos(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
	_down(e) {
		this.canvas.setPointerCapture(e.pointerId);
		const p = this._pos(e);
		this.pointers.set(e.pointerId, p);
		if (this.pointers.size === 2) { // pinch: zoom + pan
			const [a, b] = [...this.pointers.values()];
			this.drag = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), span0: this.span, mid0: this.xToT((a.x + b.x) / 2) };
			return;
		}
		if (this.pointers.size > 2) return;
		const hit = 9;
		let type = 'select';
		if (this.loop && this.loop.end > this.loop.start) {
			if (Math.abs(p.x - this.tToX(this.loop.start)) <= hit) type = 'edge-start';
			else if (Math.abs(p.x - this.tToX(this.loop.end)) <= hit) type = 'edge-end';
		}
		if (this.panMode && type === 'select') type = 'pan';
		this.drag = { type, x0: p.x, t0: this.xToT(p.x), moved: false, viewT0: this.t0 };
	}
	_move(e) {
		if (!this.pointers.has(e.pointerId)) {
			// hover cursor
			const p = this._pos(e), hit = 9;
			let cur = 'crosshair';
			if (this.loop && this.loop.end > this.loop.start && (Math.abs(p.x - this.tToX(this.loop.start)) <= hit || Math.abs(p.x - this.tToX(this.loop.end)) <= hit)) cur = 'ew-resize';
			this.canvas.style.cursor = cur; return;
		}
		const p = this._pos(e); this.pointers.set(e.pointerId, p);
		const d = this.drag; if (!d) return;
		if (d.type === 'pinch' && this.pointers.size === 2) {
			const [a, b] = [...this.pointers.values()];
			const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
			const span = d.span0 * d.d0 / dist, mx = (a.x + b.x) / 2;
			this.setView(d.mid0 - mx / this.cssW * span, span);
			return;
		}
		if (Math.abs(p.x - d.x0) > 4) d.moved = true;
		if (!d.moved) return;
		if (d.type === 'pan') { this.setView(d.viewT0 - (p.x - d.x0) / this.cssW * this.span, this.span); return; }
		const t = this._snapT(this.xToT(p.x));
		if (d.type === 'select') {
			const a = this._snapT(d.t0), s = Math.min(a, t), en = Math.max(a, t);
			this.loop = { start: s, end: en, enabled: true };
			if (this.cb.onLoop) this.cb.onLoop(s, en, false);
		} else if (d.type === 'edge-start' && this.loop) {
			this.loop = { ...this.loop, start: Math.min(t, this.loop.end - 0.05) };
			if (this.cb.onLoop) this.cb.onLoop(this.loop.start, this.loop.end, false);
		} else if (d.type === 'edge-end' && this.loop) {
			this.loop = { ...this.loop, end: Math.max(t, this.loop.start + 0.05) };
			if (this.cb.onLoop) this.cb.onLoop(this.loop.start, this.loop.end, false);
		}
		this.dirty = true;
	}
	_up(e) {
		const p = this._pos(e);
		this.pointers.delete(e.pointerId);
		const d = this.drag;
		if (this.pointers.size === 0) this.drag = null;
		else if (d && d.type === 'pinch') this.drag = null;
		if (!d || d.type === 'pinch') return;
		if (!d.moved) { if (this.cb.onSeek) this.cb.onSeek(Math.max(0, Math.min(this.duration, this.xToT(p.x)))); return; }
		if (this.loop && this.cb.onLoop) this.cb.onLoop(this.loop.start, this.loop.end, true);
	}
}
