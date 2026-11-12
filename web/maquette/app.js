// Fabtice — mockup of the main screen. Everything here is illustrative:
// waveforms are drawn from a seeded generator, nothing is played.
(() => {
  const BARS = 16;
  const BEATS = 4;
  const ORIGINAL_TEMPO = 110;
  const ORIGINAL_KEY = 8; // A flat
  const NOTES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

  const TRACKS = [
    { id: "voix", nom: "Voix", muet: true },
    { id: "batterie", nom: "Batterie" },
    { id: "basse", nom: "Basse" },
    { id: "guitare", nom: "Guitare" },
    { id: "piano", nom: "Piano" },
    { id: "vents", nom: "Vents" },
    { id: "autres", nom: "Autres" },
  ];

  // One entry per bar; a bar may hold two chords. [pitch class, quality, extension]
  const CHART = [
    [[8, "maj7"]], [[5, "m7"]], [[10, "m7"]], [[3, "7"]],
    [[0, "m7"]], [[5, "7"]], [[10, "m7"]], [[3, "7", "13"]],
    [[8, "maj7"]], [[8, "7"]], [[1, "maj7"]], [[1, "m6"]],
    [[0, "m7"]], [[5, "7", "♭9"]], [[10, "m7"], [3, "7"]], [[8, "6"]],
  ];
  const TEMPO_CURVE = [109, 110, 111, 110, 108, 109, 111, 112, 111, 110, 109, 110, 112, 113, 111, 108, 107];

  const state = {
    playing: false,
    looping: true,
    loop: [4, 8],
    position: 4,
    semitones: 5,
    tempo: 60,
  };

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const travail = $("travail");
  const plan = $("plan");
  const css = (name) => getComputedStyle(root).getPropertyValue(name).trim();

  // ---------- Build the static parts ----------

  plan.style.setProperty("--mesures", BARS);

  $("mesures").innerHTML = Array.from({ length: BARS }, (_, i) => `<div class="mesure-num">${i + 1}</div>`).join("");

  function renderChart() {
    $("accords").innerHTML = CHART.map((bar) => {
      const inner = bar.map(([pc, quality, ext]) => {
        const name = NOTES[(pc + state.semitones + 120) % 12];
        return `<span>${name}<span class="q">${quality}</span>${ext ? `<sup>${ext}</sup>` : ""}</span>`;
      }).join("");
      return `<div class="accord${bar.length > 1 ? " deux" : ""}">${inner}</div>`;
    }).join("");
  }

  $("pistes").innerHTML = TRACKS.map((t) => `
    <div class="rang piste${t.muet ? " eteinte" : ""}" data-piste="${t.id}" style="--teinte: var(--${t.id})">
      <div class="tete">
        <span class="pastille"></span>
        <span class="nom">${t.nom}</span>
        <span class="ms">
          <button class="muet" aria-pressed="${t.muet ? "true" : "false"}" aria-label="Couper ${t.nom}">M</button>
          <button class="solo" aria-pressed="false" aria-label="Écouter ${t.nom} seule">S</button>
        </span>
        <input class="volume" type="range" min="0" max="100" value="${t.id === "batterie" ? 62 : 78}" aria-label="Volume ${t.nom}">
      </div>
      <div class="corps"><canvas></canvas></div>
    </div>`).join("");

  $("stems").innerHTML = TRACKS.map((t) =>
    `<button class="stem" aria-pressed="true" style="--teinte: var(--${t.id})">${t.nom}</button>`).join("");

  // ---------- Waveforms ----------

  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Loudness of each stem at time `bar` (in bars, fractional), in 0..1.
  const SHAPES = {
    voix(bar, n) {
      const phrase = bar % 2;
      const on = phrase < 1.55 ? Math.sin((phrase / 1.55) * Math.PI) ** 0.6 : 0;
      return on * (0.45 + 0.5 * n);
    },
    batterie(bar, n) {
      const beat = (bar * BEATS) % 1;
      const eighth = (bar * BEATS * 2) % 1;
      const kick = Math.exp(-beat * 9) * (Math.floor(bar * BEATS) % 2 === 0 ? 1 : 0.72);
      const hat = Math.exp(-eighth * 14) * 0.3;
      return Math.max(kick, hat) * (0.8 + 0.2 * n) + 0.04;
    },
    basse(bar, n) {
      const beat = (bar * BEATS) % 1;
      return (0.62 - 0.3 * beat) * (0.82 + 0.18 * n);
    },
    guitare(bar, n) {
      const pos = (bar * BEATS + 0.5) % 2;
      return Math.exp(-pos * 3.2) * (0.5 + 0.35 * n) + 0.05;
    },
    piano(bar, n) {
      const pos = (bar % 1) * BEATS;
      const hit = Math.exp(-pos * 1.1) * 0.7 + Math.exp(-((pos + 1.5) % 4) * 2.6) * 0.35;
      return hit * (0.6 + 0.4 * n);
    },
    vents(bar, n) {
      if (bar < 4 || bar >= 14) return 0.015;
      const phrase = (bar - 4) % 2.5;
      const on = phrase < 2 ? Math.sin((phrase / 2) * Math.PI) ** 0.5 : 0;
      return on * (0.5 + 0.45 * n);
    },
    autres(bar, n) {
      return 0.13 + 0.12 * n + 0.06 * Math.sin(bar * 1.7);
    },
  };

  function sizeCanvas(canvas) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function drawWaveform(canvas, id, index) {
    const { ctx, w, h } = sizeCanvas(canvas);
    const rand = seeded(977 * (index + 3));
    const shape = SHAPES[id];
    const mid = h / 2;
    const reach = h / 2 - 7;
    const step = 1.5;
    const count = Math.ceil(w / step) + 1;

    // Smoothed noise so neighbouring columns belong to the same gesture.
    let slow = rand();
    const peaks = new Float32Array(count);
    const body = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      slow += (rand() - slow) * 0.35;
      const bar = ((i * step) / w) * BARS;
      const level = Math.min(1, Math.max(0, shape(bar, slow)));
      peaks[i] = level * (0.86 + 0.14 * rand());
      body[i] = level * (0.48 + 0.1 * rand());
    }

    const trace = (values, alpha) => {
      ctx.beginPath();
      ctx.moveTo(0, mid);
      for (let i = 0; i < count; i++) ctx.lineTo(i * step, mid - values[i] * reach);
      for (let i = count - 1; i >= 0; i--) ctx.lineTo(i * step, mid + values[i] * reach);
      ctx.closePath();
      ctx.globalAlpha = alpha;
      ctx.fill();
    };
    ctx.fillStyle = css(`--${id}`);
    trace(peaks, 0.38);
    trace(body, 0.95);
    ctx.globalAlpha = 1;
  }

  function drawTempo() {
    const { ctx, w, h } = sizeCanvas($("courbe-tempo"));
    const min = 104;
    const max = 116;
    const y = (v) => h - 6 - ((v - min) / (max - min)) * (h - 12);
    const x = (i) => (i / BARS) * w;

    ctx.strokeStyle = css("--trait");
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y(ORIGINAL_TEMPO));
    ctx.lineTo(w, y(ORIGINAL_TEMPO));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = css("--encre-douce");
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    TEMPO_CURVE.forEach((v, i) => {
      if (i === 0) return ctx.moveTo(x(0), y(v));
      const px = x(i - 1);
      const cx = (px + x(i)) / 2;
      ctx.bezierCurveTo(cx, y(TEMPO_CURVE[i - 1]), cx, y(v), x(i), y(v));
    });
    ctx.stroke();

    ctx.fillStyle = css("--encre-douce");
    TEMPO_CURVE.forEach((v, i) => {
      if (i === 0 || i === BARS) return;
      ctx.beginPath();
      ctx.arc(x(i), y(v), 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ---------- Layout ----------

  const phone = window.matchMedia("(max-width: 760px)");

  function fit() {
    const head = parseFloat(css("--tete"));
    const barWidth = phone.matches ? 86 : Math.max(64, Math.floor((travail.clientWidth - head) / BARS));
    root.style.setProperty("--mesure", `${barWidth}px`);
    document.querySelectorAll(".piste").forEach((row, i) => drawWaveform(row.querySelector("canvas"), row.dataset.piste, i));
    drawTempo();
  }

  // ---------- Transport ----------

  const boucle = $("boucle");
  const lecture = $("lecture");

  function paint() {
    plan.style.setProperty("--boucle-debut", state.loop[0]);
    plan.style.setProperty("--boucle-fin", state.loop[1]);
    boucle.style.display = state.looping ? "" : "none";
    $("boucle-regle").style.display = state.looping ? "" : "none";
    $("ou-boucle").style.display = state.looping ? "" : "none";
    document.querySelectorAll(".mesure-num").forEach((el, i) =>
      el.classList.toggle("dans-boucle", state.looping && i >= state.loop[0] && i < state.loop[1]));
    lecture.style.setProperty("--position", state.position);

    const seconds = (state.position * BEATS * 60) / state.tempo;
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    $("temps").textContent = `${m}:${s.toFixed(1).padStart(4, "0").replace(".", ",")}`;
    $("ou-mesure").textContent = Math.floor(state.position) + 1;
    $("ou-temps").textContent = Math.floor((state.position % 1) * BEATS) + 1;
  }

  function paintSettings() {
    const n = state.semitones;
    $("ton-valeur").textContent = n === 0 ? "0" : n > 0 ? `+${n}` : `−${Math.abs(n)}`;
    $("ton-detail").textContent = n === 0
      ? `${NOTES[ORIGINAL_KEY]} · original`
      : `${NOTES[ORIGINAL_KEY]} → ${NOTES[(ORIGINAL_KEY + n + 120) % 12]}`;
    $("tempo-valeur").textContent = state.tempo;
    renderChart();
  }

  let last = 0;
  function tick(now) {
    if (!state.playing) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    state.position += (dt * state.tempo) / 60 / BEATS;
    const end = state.looping ? state.loop[1] : BARS;
    if (state.position >= end) state.position = state.looping ? state.loop[0] : 0;
    paint();
    requestAnimationFrame(tick);
  }

  $("jouer").addEventListener("click", () => {
    state.playing = !state.playing;
    $("jouer").setAttribute("aria-pressed", String(state.playing));
    $("jouer").setAttribute("aria-label", state.playing ? "Pause" : "Lecture");
    if (state.playing) {
      last = performance.now();
      requestAnimationFrame(tick);
    }
  });
  $("debut").addEventListener("click", () => {
    state.position = state.looping ? state.loop[0] : 0;
    paint();
  });
  $("bouclage").addEventListener("click", () => {
    state.looping = !state.looping;
    $("bouclage").setAttribute("aria-pressed", String(state.looping));
    paint();
  });
  $("metronome").addEventListener("click", (e) => {
    const b = e.currentTarget;
    b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
  });

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  $("ton-moins").addEventListener("click", () => { state.semitones = clamp(state.semitones - 1, -12, 12); paintSettings(); });
  $("ton-plus").addEventListener("click", () => { state.semitones = clamp(state.semitones + 1, -12, 12); paintSettings(); });
  $("tempo-moins").addEventListener("click", () => { state.tempo = clamp(state.tempo - 5, 30, 220); paintSettings(); paint(); });
  $("tempo-plus").addEventListener("click", () => { state.tempo = clamp(state.tempo + 5, 30, 220); paintSettings(); paint(); });

  // ---------- Mute / solo ----------

  function refreshTracks() {
    const rows = [...document.querySelectorAll(".piste")];
    const anySolo = rows.some((r) => r.querySelector(".solo").getAttribute("aria-pressed") === "true");
    rows.forEach((r) => {
      const muted = r.querySelector(".muet").getAttribute("aria-pressed") === "true";
      const solo = r.querySelector(".solo").getAttribute("aria-pressed") === "true";
      r.classList.toggle("eteinte", anySolo ? !solo : muted);
    });
  }
  $("pistes").addEventListener("click", (e) => {
    const b = e.target.closest(".ms button");
    if (!b) return;
    b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    refreshTracks();
  });

  // ---------- Welcome dialog ----------

  const voile = $("voile");
  const open = () => voile.classList.add("ouverte");
  const close = () => voile.classList.remove("ouverte");
  $("ouvrir-accueil").addEventListener("click", open);
  $("ouvrir-accueil-mobile").addEventListener("click", open);
  $("creer").addEventListener("click", close);
  voile.addEventListener("click", (e) => { if (e.target === voile) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  $("stems").addEventListener("click", (e) => {
    const b = e.target.closest(".stem");
    if (b) b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
  });
  if (location.hash === "#accueil") open();

  // ---------- Go ----------

  paintSettings();
  fit();
  paint();
  if (phone.matches) travail.scrollLeft = 3.55 * 86;

  let pending = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(fit);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();
