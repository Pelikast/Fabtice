// Fabtice — mockup of the main screen. Everything here is illustrative:
// waveforms and notes are drawn from a seeded generator, nothing is played.
(() => {
  const BARS = 16;
  const BEATS = 4;
  const ORIGINAL_TEMPO = 110;
  const ORIGINAL_KEY = 8; // A flat
  // [letter, accidental]
  const NOTES = [["C", ""], ["D", "♭"], ["D", ""], ["E", "♭"], ["E", ""], ["F", ""], ["G", "♭"], ["G", ""], ["A", "♭"], ["A", ""], ["B", "♭"], ["B", ""]];

  const TRACKS = [
    { id: "voix", nom: "Voix", muet: true, cle: "sol", portee: true },
    { id: "batterie", nom: "Batterie" },
    { id: "basse", nom: "Basse", cle: "fa" },
    { id: "guitare", nom: "Guitare", cle: "sol" },
    { id: "piano", nom: "Piano", cle: "sol" },
    { id: "vents", nom: "Vents", cle: "sol", portee: true },
    { id: "autres", nom: "Autres" },
  ];

  // One entry per bar; a bar may hold two chords. [pitch class, quality, extension]
  const CHART = [
    [[8, "maj7"]], [[5, "m7"]], [[10, "m7"]], [[3, "7"]],
    [[0, "m7"]], [[5, "7"]], [[10, "m7"]], [[3, "7", "13"]],
    [[8, "maj7"]], [[8, "7"]], [[1, "maj7"]], [[1, "m6"]],
    [[0, "m7"]], [[5, "7", "♭9"]], [[10, "m7"], [3, "7"]], [[8, "6"]],
  ];
  const SECTIONS = { 0: "A", 8: "B" };
  const TEMPO_CURVE = [109, 110, 111, 110, 108, 109, 111, 112, 111, 110, 109, 110, 112, 113, 111, 108, 107];

  const phone = window.matchMedia("(max-width: 760px)");

  const state = {
    view: "pistes",
    playing: false,
    looping: true,
    loop: [4, 8],
    position: 4,
    semitones: 5,
    tempo: 60,
    grid: 2,          // subdivisions per beat before triplets: 1, 2, 4, 8
    triplets: false,
    magnet: true,
    follow: true,
    auto: !phone.matches,
    barWidth: 86,
    trackHeight: 64,
    minor: "m",
  };

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const app = $("app");
  const travail = $("travail");
  const plan = $("plan");
  const css = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const perBeat = () => state.grid * (state.triplets ? 1.5 : 1);

  // ---------- Chord symbols, written the way jazz charts write them ----------

  const TRIANGLE = '<svg class="tri" viewBox="0 0 10 9" aria-label="majeur 7"><path d="M5 0.9 9.2 8.2H0.8z" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/></svg>';
  const accidentals = (text) => text.replace(/[♭♯]/g, (m) => `<span class="alt">${m}</span>`);

  function noteHTML(pc) {
    const [letter, acc] = NOTES[((pc % 12) + 12) % 12];
    return letter + (acc ? `<span class="alt">${acc}</span>` : "");
  }
  function qualityHTML(quality) {
    if (quality === "maj7") return TRIANGLE;
    const text = quality.startsWith("m") ? state.minor + quality.slice(1) : quality;
    return `<span class="q">${text}</span>`;
  }
  function chordHTML([pc, quality, ext]) {
    return `<span class="ch">${noteHTML(pc + state.semitones)}${qualityHTML(quality)}${ext ? `<span class="ext">${accidentals(ext)}</span>` : ""}</span>`;
  }

  // ---------- Static parts ----------

  plan.style.setProperty("--mesures", BARS);
  $("mesures").innerHTML = Array.from({ length: BARS }, (_, i) => `<div class="mesure-num">${i + 1}</div>`).join("");

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

  $("portees").innerHTML = "<h2>Instruments</h2>" + TRACKS.filter((t) => t.cle).map((t) => `
    <label class="portee-choix" style="--teinte: var(--${t.id})">
      <input type="checkbox" data-portee="${t.id}"${t.portee ? " checked" : ""}>
      <i></i>${t.nom}
    </label>`).join("") + "<p>Cochez plusieurs instruments pour obtenir un conducteur. Les notes de cette maquette sont factices.</p>";

  function renderChart() {
    $("accords").innerHTML = CHART.map((bar) =>
      `<div class="accord${bar.length > 1 ? " deux" : ""}">${bar.map(chordHTML).join("")}</div>`).join("");

    $("grille").innerHTML = CHART.map((bar, i) => `
      <button class="case${bar.length > 1 ? " deux" : ""}${SECTIONS[i] && i ? " double" : ""}" data-mesure="${i}">
        ${SECTIONS[i] ? `<span class="section">${SECTIONS[i]}</span>` : ""}
        <span class="numero">${i + 1}</span>
        ${bar.map(chordHTML).join("")}
      </button>`).join("");
  }

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
    // A fixed number of columns per bar, so the drawing keeps its shape when zooming.
    const perBar = 48;
    const count = BARS * perBar + 1;
    const step = w / (count - 1);

    let slow = rand();
    const peaks = new Float32Array(count);
    const body = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      slow += (rand() - slow) * 0.35;
      const level = clamp(shape(i / perBar, slow), 0, 1);
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
      const cx = (x(i - 1) + x(i)) / 2;
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

  // ---------- Layout: zoom, auto-fit, sub-grid ----------

  const RULER = 100;
  const FOOT = 56; // room kept under the tracks for the display tools

  function fit() {
    if (state.view !== "pistes") return;
    const head = parseFloat(css("--tete"));
    if (state.auto) {
      state.barWidth = clamp(Math.floor((travail.clientWidth - head) / BARS), 20, 260);
      state.trackHeight = clamp(Math.floor((travail.clientHeight - RULER - FOOT) / TRACKS.length), 44, 150);
    }
    root.style.setProperty("--mesure", `${state.barWidth}px`);
    root.style.setProperty("--piste", `${state.trackHeight}px`);

    // The sub-grid fades out when its lines would sit closer than 5 px.
    const spacing = state.barWidth / (BEATS * perBeat());
    root.style.setProperty("--sous", `${spacing}px`);
    root.style.setProperty("--sous-trait", spacing >= 5 ? "var(--trait-fin)" : "transparent");

    $("zoom-h").value = state.barWidth;
    $("zoom-v").value = state.trackHeight;
    $("auto").setAttribute("aria-pressed", String(state.auto));

    document.querySelectorAll(".piste").forEach((row, i) => drawWaveform(row.querySelector("canvas"), row.dataset.piste, i));
    drawTempo();
  }

  let pending = 0;
  const refit = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => (state.view === "partition" ? drawScore() : fit()));
  };

  $("zoom-h").addEventListener("input", (e) => { state.auto = false; state.barWidth = +e.target.value; refit(); });
  $("zoom-v").addEventListener("input", (e) => { state.auto = false; state.trackHeight = +e.target.value; refit(); });
  $("auto").addEventListener("click", () => { state.auto = !state.auto; if (state.auto) travail.scrollLeft = 0; refit(); });
  $("aimant").addEventListener("click", (e) => {
    state.magnet = !state.magnet;
    e.currentTarget.setAttribute("aria-pressed", String(state.magnet));
  });
  $("sous-grille").addEventListener("change", (e) => { state.grid = +e.target.value; refit(); });
  $("triolets").addEventListener("click", (e) => {
    state.triplets = !state.triplets;
    e.currentTarget.setAttribute("aria-pressed", String(state.triplets));
    refit();
  });

  // Click in the ruler or on a track to place the playhead (snapped if the magnet is on).
  plan.addEventListener("click", (e) => {
    const zone = e.target.closest(".piste .corps, .rang-mesures .corps");
    if (!zone) return;
    const left = plan.querySelector(".calque").getBoundingClientRect().left;
    let bars = (e.clientX - left) / state.barWidth;
    if (state.magnet) {
      const step = 1 / (BEATS * perBeat());
      bars = Math.round(bars / step) * step;
    }
    state.position = clamp(bars, 0, BARS - 0.001);
    paint();
  });

  // ---------- Score (illustrative) ----------

  const PATTERNS = [[1, 1, 1, 1], [2, 1, 1], [0.5, 0.5, 1, 2], [1, 0.5, 0.5, 1, 1], [2, 2], [1, 1, 2], [0.5, 0.5, 0.5, 0.5, 1, 1]];
  const scoreSystems = [];

  function drawScore() {
    const host = $("systemes");
    const staves = TRACKS.filter((t) => t.cle && document.querySelector(`[data-portee="${t.id}"]`).checked);
    $("partition-sous-titre").innerHTML = staves.length === 0
      ? "Aucun instrument sélectionné"
      : `${staves.length > 1 ? `Conducteur · ${staves.length} instruments` : staves[0].nom} · ${noteHTML(ORIGINAL_KEY + state.semitones)} · 4/4`;
    scoreSystems.length = 0;
    if (!staves.length) { host.innerHTML = ""; return; }

    const W = host.clientWidth;
    const narrow = W < 520;
    const perSystem = narrow ? 2 : 4;
    const left = narrow ? 34 : 62;
    const gap = 8;                 // distance between two staff lines
    const staffH = gap * 4;
    const between = 38;            // space between two staves of a system
    const top = 30;
    const height = top + staves.length * staffH + (staves.length - 1) * between + 12;
    const barW = (W - left - 1) / perSystem;
    const rands = staves.map((s, i) => seeded(4201 + 97 * TRACKS.indexOf(s)));
    const pitches = staves.map(() => 4);
    let html = "";

    for (let first = 0; first < BARS; first += perSystem) {
      let s = `<svg class="systeme" viewBox="0 0 ${W} ${height}" height="${height}" data-first="${first}">`;
      const yTop = top;
      const yBottom = top + staves.length * staffH + (staves.length - 1) * between;

      // Loop veil
      const a = Math.max(state.loop[0], first);
      const b = Math.min(state.loop[1], first + perSystem);
      if (state.looping && b > a) {
        s += `<rect class="voile-boucle" x="${left + (a - first) * barW}" y="${yTop - 8}" width="${(b - a) * barW}" height="${yBottom - yTop + 16}"/>`;
      }

      staves.forEach((staff, si) => {
        const y0 = top + si * (staffH + between);
        for (let l = 0; l < 5; l++) s += `<line class="ligne" x1="${left}" x2="${W - 1}" y1="${y0 + l * gap}" y2="${y0 + l * gap}"/>`;
        if (!narrow) s += `<text class="nom-portee" x="0" y="${y0 + staffH / 2 + 4}">${staff.nom}</text>`;
        s += staff.cle === "sol"
          ? `<text class="cle" x="${left + 5}" y="${y0 + staffH - 1}" font-size="${gap * 4.1}">𝄞</text>`
          : `<text class="cle" x="${left + 5}" y="${y0 + staffH - gap * 0.9}" font-size="${gap * 4.1}">𝄢</text>`;

        for (let bi = 0; bi < perSystem; bi++) {
          const bar = first + bi;
          const x0 = left + bi * barW + (bi === 0 ? 34 : 12);
          const x1 = left + (bi + 1) * barW - 10;
          const rand = rands[si];
          const pattern = PATTERNS[Math.floor(rand() * PATTERNS.length)];
          let beat = 0;
          const notes = pattern.map((dur) => {
            pitches[si] = clamp(pitches[si] + Math.round((rand() - 0.5) * 5), 0, 8);
            const note = { dur, x: x0 + (beat / BEATS) * (x1 - x0), y: y0 + staffH - pitches[si] * (gap / 2), p: pitches[si] };
            beat += dur;
            return note;
          });
          for (let n = 0; n < notes.length; n++) {
            const note = notes[n];
            const pair = note.dur === 0.5 && notes[n + 1] && notes[n + 1].dur === 0.5 ? notes[n + 1] : null;
            const up = pair ? (note.p + pair.p) / 2 < 4 : note.p < 4;
            const draw = (nt, tipY) => {
              const sx = nt.x + (up ? 4.3 : -4.3);
              s += `<ellipse class="${nt.dur >= 2 ? "blanche" : "tete-note"}" cx="${nt.x}" cy="${nt.y}" rx="4.7" ry="3.3" transform="rotate(-20 ${nt.x} ${nt.y})"/>`;
              s += `<line class="hampe" x1="${sx}" x2="${sx}" y1="${nt.y}" y2="${tipY}"/>`;
              return sx;
            };
            if (pair) {
              const tip = up ? Math.min(note.y, pair.y) - 27 : Math.max(note.y, pair.y) + 27;
              const xa = draw(note, tip);
              const xb = draw(pair, tip);
              s += `<line class="ligature" x1="${xa - 0.5}" x2="${xb + 0.5}" y1="${tip + (up ? 1.6 : -1.6)}" y2="${tip + (up ? 1.6 : -1.6)}"/>`;
              n++;
            } else {
              draw(note, up ? note.y - 27 : note.y + 27);
            }
          }
        }
      });

      // Bar lines, bar numbers, chord symbols
      s += `<line class="barre" x1="${left}" x2="${left}" y1="${yTop}" y2="${yBottom}" stroke-width="${staves.length > 1 ? 2.4 : 1}"/>`;
      for (let bi = 0; bi < perSystem; bi++) {
        const bar = first + bi;
        const x = left + (bi + 1) * barW;
        s += `<line class="barre" x1="${x}" x2="${x}" y1="${yTop}" y2="${yBottom}"/>`;
        const cx = left + bi * barW + (bi === 0 ? 34 : 12);
        const chords = CHART[bar];
        chords.forEach((ch, ci) => {
          const x = cx + ci * ((barW - 30) / 2);
          s += `<foreignObject x="${x - 2}" y="${yTop - 28}" width="${barW}" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="accord-svg">${chordHTML(ch)}</div></foreignObject>`;
        });
      }
      s += `<text class="num" x="${left + 2}" y="${yTop - 20}" text-anchor="end">${first + 1}</text>`;
      s += `<line class="tete-lecture" x1="0" x2="0" y1="${yTop - 8}" y2="${yBottom + 8}" visibility="hidden"/>`;
      s += "</svg>";
      html += s;
      scoreSystems.push({ first, perSystem, left, barW });
    }
    host.innerHTML = html;
    paint();
  }

  $("portees").addEventListener("change", drawScore);

  // ---------- Transport ----------

  function paint() {
    plan.style.setProperty("--boucle-debut", state.loop[0]);
    plan.style.setProperty("--boucle-fin", state.loop[1]);
    $("boucle").style.display = state.looping ? "" : "none";
    plan.querySelector(".boucle-regle").style.display = state.looping ? "" : "none";
    $("ou-boucle").style.display = state.looping ? "" : "none";
    $("lecture").style.setProperty("--position", state.position);
    document.querySelectorAll(".mesure-num").forEach((el, i) =>
      el.classList.toggle("dans-boucle", state.looping && i >= state.loop[0] && i < state.loop[1]));

    const bar = Math.floor(state.position);
    const seconds = (state.position * BEATS * 60) / state.tempo;
    const m = Math.floor(seconds / 60);
    const sec = seconds - m * 60;
    $("temps").textContent = `${m}:${sec.toFixed(1).padStart(4, "0").replace(".", ",")}`;
    $("ou-mesure").textContent = bar + 1;
    $("ou-temps").textContent = Math.floor((state.position % 1) * BEATS) + 1;

    if (state.view === "grille") {
      document.querySelectorAll(".case").forEach((el, i) => {
        el.classList.toggle("dans-boucle", state.looping && i >= state.loop[0] && i < state.loop[1]);
        el.classList.toggle("jouee", i === bar);
        if (i === bar) el.style.setProperty("--avance", (state.position % 1).toFixed(3));
      });
    }
    if (state.view === "partition") {
      document.querySelectorAll(".systeme").forEach((svg, i) => {
        const sys = scoreSystems[i];
        const line = svg.querySelector(".tete-lecture");
        if (!sys || !line) return;
        const inside = state.position >= sys.first && state.position < sys.first + sys.perSystem;
        line.setAttribute("visibility", inside ? "visible" : "hidden");
        if (inside) {
          const x = sys.left + (state.position - sys.first) * sys.barW;
          line.setAttribute("x1", x);
          line.setAttribute("x2", x);
        }
      });
    }
  }

  function follow() {
    if (!state.follow || state.view !== "pistes") return;
    const head = parseFloat(css("--tete"));
    const x = state.position * state.barWidth;
    const view = travail.clientWidth - head;
    if (x < travail.scrollLeft || x > travail.scrollLeft + view - 24) {
      travail.scrollLeft = Math.max(0, x - view * 0.15);
    }
  }

  function paintSettings() {
    const n = state.semitones;
    $("ton-valeur").textContent = n === 0 ? "0" : n > 0 ? `+${n}` : `−${Math.abs(n)}`;
    $("ton-detail").innerHTML = n === 0
      ? `${noteHTML(ORIGINAL_KEY)} · original`
      : `${noteHTML(ORIGINAL_KEY)} → ${noteHTML(ORIGINAL_KEY + n)}`;
    $("tempo-valeur").textContent = state.tempo;
    $("grille-ton").innerHTML = `Tonalité de ${noteHTML(ORIGINAL_KEY + n)}`;
    renderChart();
    if (state.view === "partition") drawScore();
    paint();
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
    follow();
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
    follow();
  });
  $("bouclage").addEventListener("click", () => {
    state.looping = !state.looping;
    $("bouclage").setAttribute("aria-pressed", String(state.looping));
    if (state.view === "partition") drawScore(); else paint();
  });
  $("metronome").addEventListener("click", (e) => {
    const b = e.currentTarget;
    b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
  });

  $("ton-moins").addEventListener("click", () => { state.semitones = clamp(state.semitones - 1, -12, 12); paintSettings(); });
  $("ton-plus").addEventListener("click", () => { state.semitones = clamp(state.semitones + 1, -12, 12); paintSettings(); });
  $("tempo-moins").addEventListener("click", () => { state.tempo = clamp(state.tempo - 5, 30, 220); paintSettings(); });
  $("tempo-plus").addEventListener("click", () => { state.tempo = clamp(state.tempo + 5, 30, 220); paintSettings(); });

  $("grille").addEventListener("click", (e) => {
    const cell = e.target.closest(".case");
    if (!cell) return;
    state.position = +cell.dataset.mesure;
    paint();
  });

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

  // ---------- Views ----------

  function setView(view) {
    state.view = view;
    app.dataset.vue = view;
    document.querySelectorAll(".mode").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.vue === view)));
    if (view === "partition") drawScore();
    else if (view === "pistes") fit();
    paint();
  }
  document.querySelector(".modes").addEventListener("click", (e) => {
    const b = e.target.closest(".mode");
    if (b) setView(b.dataset.vue);
  });

  // ---------- Settings and welcome dialog ----------

  const panel = $("reglages-app");
  const togglePanel = (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; };
  $("ouvrir-reglages").addEventListener("click", togglePanel);
  $("ouvrir-reglages-tel").addEventListener("click", togglePanel);
  panel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => { panel.hidden = true; });
  $("suivre").addEventListener("change", (e) => { state.follow = e.target.checked; });
  panel.querySelector(".duo").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.minor = b.dataset.mineur;
    panel.querySelectorAll(".duo button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    paintSettings();
  });

  const voile = $("voile");
  const open = () => { panel.hidden = true; voile.classList.add("ouverte"); };
  const close = () => voile.classList.remove("ouverte");
  $("ouvrir-accueil").addEventListener("click", open);
  $("nouveau-tel").addEventListener("click", open);
  $("creer").addEventListener("click", close);
  voile.addEventListener("click", (e) => { if (e.target === voile) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { close(); panel.hidden = true; } });
  $("stems").addEventListener("click", (e) => {
    const b = e.target.closest(".stem");
    if (b) b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
  });

  // ---------- Go ----------

  paintSettings();
  fit();
  paint();
  if (phone.matches) travail.scrollLeft = 3.55 * state.barWidth;

  const start = new URLSearchParams(location.hash.slice(1));
  if (location.hash === "#accueil") open();
  if (["grille", "partition"].includes(start.get("vue"))) setView(start.get("vue"));
  if (start.get("reglages")) panel.hidden = false;

  window.addEventListener("resize", refit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
})();
