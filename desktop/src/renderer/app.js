'use strict';

/* global fabtice */

const $ = (id) => document.getElementById(id);

const state = {
  system: null,
  ytdlp: null,
  update: null,
  lastLink: null,
  extract: null, // { ok, error, refused, meta, report }
  decode: null, // { ok, ... }
  webgpu: null,
  attempts: [], // network attempts of the yt-dlp manager
  installError: null,
};

function fmtTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return '?';
  if (n < 1024) return `${n} o`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} Kio`;
  return `${(n / 1024 ** 2).toFixed(2)} Mio`;
}

function setStatus(el, text, isError = false) {
  el.textContent = text;
  el.classList.toggle('error', isError);
}

// ---------------------------------------------------------------- yt-dlp

function keepAttempts(answer) {
  if (answer && Array.isArray(answer.attempts)) state.attempts = answer.attempts;
}

async function refreshYtdlp() {
  state.ytdlp = await fabtice.ytdlpStatus();
  keepAttempts(state.ytdlp);
  const s = state.ytdlp;
  const button = $('ytdlp-install');
  if (s.installed) {
    setStatus($('ytdlp-status'), `yt-dlp ${s.version || '(version inconnue)'} — ${s.sourceLabel}`, Boolean(s.error));
    if (s.error) $('ytdlp-status').textContent += ` — attention : ${s.error}`;
    button.hidden = true;
  } else {
    setStatus($('ytdlp-status'), s.error
      ? `yt-dlp indisponible : ${s.error}`
      : 'yt-dlp n’est pas encore installé. Il sera téléchargé depuis le site officiel (GitHub, environ 37 Mo) et vérifié.', Boolean(s.error && s.source === 'override'));
    button.hidden = s.source === 'override';
    button.textContent = 'Installer yt-dlp';
  }
  renderDiagnostics();
}

async function refreshUpdate(force = false) {
  if (state.ytdlp && state.ytdlp.source === 'override') return;
  state.update = await fabtice.ytdlpCheck(force);
  keepAttempts(state.update);
  const u = state.update;
  const el = $('ytdlp-update');
  if (u.error) {
    // Never alarming: an installed, verified yt-dlp keeps working; before the
    // first install, the install button already says what to do.
    el.hidden = !u.installed;
    setStatus(el, 'Mises à jour non vérifiées pour l’instant (pas de réponse du serveur). yt-dlp reste utilisable.');
  } else if (u.updateAvailable) {
    el.hidden = false;
    setStatus(el, `Nouvelle version disponible${u.latest.tag ? ` : ${u.latest.tag}` : ''}.`);
    $('ytdlp-install').hidden = false;
    $('ytdlp-install').textContent = 'Mettre à jour yt-dlp';
  } else if (u.installed) {
    el.hidden = false;
    setStatus(el, 'yt-dlp est à jour.');
  }
  renderDiagnostics();
}

async function installYtdlp() {
  const button = $('ytdlp-install');
  const bar = $('ytdlp-progress');
  const wasInstalled = Boolean(state.ytdlp && state.ytdlp.installed);
  button.disabled = true;
  bar.hidden = false;
  bar.removeAttribute('value');
  setStatus($('ytdlp-status'), 'Téléchargement de yt-dlp…');
  const result = await fabtice.ytdlpInstall();
  keepAttempts(result);
  button.disabled = false;
  bar.hidden = true;
  if (!result.ok) {
    // The technical error goes to the diagnostic only.
    state.installError = result.error;
    setStatus($('ytdlp-status'), wasInstalled
      ? 'La mise à jour de yt-dlp n’a pas pu être téléchargée. C’est en général passager : réessayez dans un instant. L’ancienne version reste utilisable.'
      : 'Le téléchargement de yt-dlp a échoué. C’est en général passager (connexion ou serveur) : réessayez dans un instant.', true);
    button.hidden = false;
    button.textContent = 'Réessayer';
    document.body.dataset.install = 'failed';
    renderDiagnostics();
    return;
  }
  state.installError = null;
  document.body.dataset.install = 'ok';
  $('ytdlp-update').hidden = true;
  await refreshYtdlp();
  await refreshUpdate(true);
}

fabtice.onYtdlpProgress((p) => {
  const bar = $('ytdlp-progress');
  if (p.phase === 'download' && p.total) {
    bar.max = p.total;
    bar.value = p.received;
    setStatus($('ytdlp-status'), `Téléchargement de yt-dlp… ${fmtBytes(p.received)} / ${fmtBytes(p.total)}`);
  } else if (p.phase === 'verify') {
    setStatus($('ytdlp-status'), 'Vérification de l’empreinte SHA-256…');
  }
});

// ---------------------------------------------------------------- player

const player = {
  ctx: null,
  buffer: null,
  source: null,
  startedAt: 0,
  offset: 0,
  playing: false,
  dragging: false,

  position() {
    if (!this.buffer) return 0;
    const t = this.playing ? this.ctx.currentTime - this.startedAt : this.offset;
    return Math.min(Math.max(t, 0), this.buffer.duration);
  },

  play() {
    if (!this.buffer) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.offset >= this.buffer.duration) this.offset = 0;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.ctx.destination);
    src.onended = () => {
      if (this.source === src && this.playing) {
        this.playing = false;
        this.offset = 0;
        this.source = null;
        updatePlayButton();
      }
    };
    src.start(0, this.offset);
    this.source = src;
    this.startedAt = this.ctx.currentTime - this.offset;
    this.playing = true;
    updatePlayButton();
  },

  pause() {
    if (!this.playing) return;
    this.offset = this.position();
    this.playing = false;
    const src = this.source;
    this.source = null;
    src.stop();
    updatePlayButton();
  },

  seek(t) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.offset = t;
    if (wasPlaying) this.play();
  },

  reset() {
    if (this.playing) this.pause();
    this.buffer = null;
    this.offset = 0;
  },
};

function updatePlayButton() {
  $('play').textContent = player.playing ? 'Pause' : 'Lecture';
  document.body.dataset.playing = String(player.playing);
}

function tick() {
  if (player.buffer) {
    const t = player.position();
    if (!player.dragging) $('position').value = String(t);
    $('time').textContent = `${fmtTime(t)} / ${fmtTime(player.buffer.duration)}`;
  }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- import

async function decode(bytes, meta) {
  const started = performance.now();
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  try {
    const buffer = await player.ctx.decodeAudioData(arrayBuffer);
    state.decode = {
      ok: true,
      sampleRate: buffer.sampleRate,
      contextSampleRate: player.ctx.sampleRate,
      sourceSampleRate: meta.asr,
      channels: buffer.numberOfChannels,
      duration: buffer.duration,
      expectedDuration: meta.duration,
      ms: Math.round(performance.now() - started),
    };
    return buffer;
  } catch (e) {
    state.decode = {
      ok: false,
      error: `${e && e.name ? e.name : 'Error'}: ${e && e.message ? e.message : String(e)}`,
      ms: Math.round(performance.now() - started),
    };
    return null;
  }
}

async function runImport(event) {
  event.preventDefault();
  const link = $('link').value;
  const button = $('import-button');
  const bar = $('import-progress');
  // The AudioContext is created during the click, as autoplay rules prefer.
  if (!player.ctx) player.ctx = new AudioContext();
  player.reset();
  $('player').hidden = true;
  state.lastLink = link;
  state.extract = null;
  state.decode = null;
  document.body.dataset.decode = 'pending';
  button.disabled = true;
  setStatus($('import-status'), 'Lecture des informations de la vidéo…');
  bar.hidden = true;
  renderDiagnostics();

  const result = await fabtice.extract(link);
  button.disabled = false;
  bar.hidden = true;
  state.extract = { ...result, audio: undefined };

  if (!result.ok) {
    if (result.needsYtdlp) $('ytdlp-install').hidden = false;
    setStatus($('import-status'), result.error || 'Échec.', true);
    document.body.dataset.decode = result.refused ? 'refused' : 'failed';
    if (result.meta) showMeta(result.meta);
    renderDiagnostics();
    return;
  }

  setStatus($('import-status'), 'Décodage de l’audio…');
  const buffer = await decode(result.audio, result.meta);
  if (!buffer) {
    setStatus($('import-status'), `Le fichier a été téléchargé mais Chromium ne sait pas le décoder (${state.decode.error}). Voir le diagnostic.`, true);
    document.body.dataset.decode = 'error';
    renderDiagnostics();
    return;
  }
  player.buffer = buffer;
  player.offset = 0;
  $('position').max = String(buffer.duration);
  $('position').value = '0';
  showMeta(result.meta);
  $('player').hidden = false;
  updatePlayButton();
  setStatus($('import-status'), `Prêt : ${fmtBytes(result.report.file.size)} téléchargés en ${(result.report.totalMs / 1000).toFixed(1)} s.`);
  document.body.dataset.decode = 'ok';
  renderDiagnostics();
}

function showMeta(meta) {
  $('track-title').textContent = meta.title || 'Sans titre';
  const parts = [];
  if (meta.channel) parts.push(meta.channel);
  if (meta.duration !== null) parts.push(fmtTime(meta.duration));
  $('track-meta').textContent = parts.join(' · ');
  $('player').hidden = !player.buffer;
  if (!player.buffer && meta.title) {
    $('import-status').textContent += ` (${meta.title}${meta.duration !== null ? `, ${fmtTime(meta.duration)}` : ''})`;
  }
}

fabtice.onExtractProgress((p) => {
  const bar = $('import-progress');
  if (p.phase === 'info') {
    setStatus($('import-status'), 'Lecture des informations de la vidéo…');
  } else if (p.phase === 'download') {
    bar.hidden = false;
    bar.value = p.percent || 0;
    const title = p.meta && p.meta.title ? ` « ${p.meta.title} »` : '';
    if (p.meta) setStatus($('import-status'), `Téléchargement de l’audio${title}…`);
  }
});

// ---------------------------------------------------------------- WebGPU

async function probeWebGpu() {
  const out = { present: Boolean(navigator.gpu) };
  if (!navigator.gpu) {
    state.webgpu = out;
    return;
  }
  try {
    out.preferredCanvasFormat = navigator.gpu.getPreferredCanvasFormat();
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      out.adapter = null;
    } else {
      const info = adapter.info || {};
      out.adapter = {
        vendor: info.vendor,
        architecture: info.architecture,
        device: info.device,
        description: info.description,
        isFallbackAdapter: info.isFallbackAdapter ?? adapter.isFallbackAdapter,
      };
      out.features = [...adapter.features].sort();
      const keys = ['maxBufferSize', 'maxStorageBufferBindingSize', 'maxComputeWorkgroupStorageSize',
        'maxComputeInvocationsPerWorkgroup', 'maxComputeWorkgroupSizeX', 'maxStorageBuffersPerShaderStage',
        'maxTextureDimension2D'];
      out.limits = Object.fromEntries(keys.map((k) => [k, adapter.limits[k]]));
    }
  } catch (e) {
    out.error = `${e.name}: ${e.message}`;
  }
  state.webgpu = out;
}

// ---------------------------------------------------------------- diagnostics

function yesNo(v) {
  if (v === null || v === undefined) return 'n/a';
  return v ? 'oui' : 'non';
}

function diagnosticsText() {
  const L = [];
  const s = state.system;
  L.push('=== Fabtice — diagnostic ===');
  L.push(`Date : ${new Date().toISOString()}`);
  if (s) {
    const build = s.build
      ? ` (commit ${s.build.commit ? s.build.commit.slice(0, 10) : '?'}, construit le ${s.build.builtAt || '?'}, run ${s.build.runId || '?'})`
      : s.packaged ? ' (empaqueté, sans build-info)' : ' (non empaqueté)';
    L.push(`App : Fabtice ${s.appVersion}${build}`);
    L.push(`Electron ${s.versions.electron} · Chromium ${s.versions.chrome} · Node ${s.versions.node} · V8 ${s.versions.v8}`);
    L.push(`Système : ${s.platform === 'darwin' ? 'macOS' : s.platform} ${s.osVersion} (noyau ${s.osRelease})`);
    L.push(`Processeur : ${s.cpuModel || '?'} · ${s.cpuCount} cœurs · ${s.memoryGb} Go de mémoire`);
    L.push(`Architecture du processus : ${s.arch} · sous Rosetta : ${yesNo(s.rosetta)}`);
    const p = s.jsRuntime.probe;
    L.push(`Moteur JS pour yt-dlp : node = ${s.jsRuntime.path} avec ELECTRON_RUN_AS_NODE=1 → ${p.ok ? `répond ${p.version} (${p.durationMs} ms)` : `ÉCHEC ${p.error || ''} ${p.stderr || ''}`}`);
  } else {
    L.push('Système : informations indisponibles');
  }

  const y = state.ytdlp;
  if (y) {
    L.push(`yt-dlp : ${y.installed ? y.version || 'version inconnue' : 'non installé'} · source : ${y.sourceLabel || y.source} · chemin : ${y.path || '—'}`);
    if (y.sha256) L.push(`yt-dlp SHA-256 : ${y.sha256}${y.intact === false ? ' (DIFFÉRENT de l’installation)' : ''}`);
    if (y.error) L.push(`yt-dlp problème : ${y.error}`);
  }
  if (state.installError) L.push(`Installation yt-dlp : dernier échec — ${state.installError}`);
  const u = state.update;
  if (u) {
    if (u.error) L.push(`Mise à jour yt-dlp : vérification impossible (${u.error})`);
    else if (u.skipped) L.push(`Mise à jour yt-dlp : non vérifiée (${u.reason})`);
    else L.push(`Mise à jour yt-dlp : dernière version ${u.latest.tag || '(étiquette inconnue)'} · ${u.updateAvailable ? 'mise à jour disponible' : u.installed ? 'à jour' : 'pas encore installé'}`);
  }

  if (state.attempts.length) {
    L.push(`Réseau yt-dlp (${state.attempts.length} essais cette session) :`);
    for (const a of state.attempts) {
      const time = a.at.slice(11, 23);
      const via = a.finalHost && a.finalHost !== a.host ? ` → ${a.finalHost}` : '';
      L.push(`  ${time} ${a.op} ${a.host}${via} essai ${a.attempt}/${a.of} · ${a.ok ? 'OK' : 'ÉCHEC'} en ${a.ms} ms${a.ok ? '' : ` · ${a.error}`}`);
    }
  }

  L.push('');
  L.push('--- Dernière importation ---');
  const x = state.extract;
  if (!x) {
    L.push(state.lastLink ? 'En cours…' : 'Aucune.');
  } else {
    L.push(`Lien saisi : ${state.lastLink}`);
    const r = x.report;
    if (r) {
      L.push(`URL transmise : ${r.url} (id ${r.videoId})`);
      L.push(`Format demandé : ${r.format}`);
      for (const step of r.steps) {
        L.push(`> Étape ${step.label}`);
        L.push(`  Exécutable : ${step.executable}`);
        L.push(`  Arguments : ${JSON.stringify(step.args)}`);
        L.push(`  Code de sortie : ${step.exitCode}${step.signal ? ` · signal ${step.signal}` : ''}${step.timedOut ? ' · DÉLAI DÉPASSÉ' : ''}${step.spawnError ? ` · lancement impossible : ${step.spawnError}` : ''} · durée ${(step.durationMs / 1000).toFixed(2)} s`);
        L.push(`  stderr (${step.stderrTail.length} dernières lignes) :`);
        for (const line of step.stderrTail) L.push(`    ${line}`);
      }
      if (r.debugLines && r.debugLines.length) {
        L.push('> Lignes clés de yt-dlp :');
        for (const line of r.debugLines) L.push(`    ${line}`);
      }
      if (r.meta) {
        const m = r.meta;
        L.push(`Vidéo : « ${m.title} » · ${m.channel} · ${m.duration !== null ? fmtTime(m.duration) : 'durée inconnue'} · live_status ${m.liveStatus}`);
        L.push(`Format choisi : ${m.formatId} · ext ${m.ext} · acodec ${m.acodec} · container ${m.container} · ${m.abr ? `${m.abr} kb/s` : '?'} · ${m.asr || '?'} Hz · ${m.audioChannels || '?'} canaux · protocole ${m.protocol}`);
      }
      if (r.file) {
        L.push(`Fichier : ${r.file.name} · ${r.file.size} octets (${fmtBytes(r.file.size)})`);
        L.push(`Conteneur détecté : ${r.file.container.label}${r.file.container.topLevel ? ` · boîtes : ${r.file.container.topLevel}` : ''}`);
      }
      L.push(`Durée totale : ${(r.totalMs / 1000).toFixed(2)} s · dossier temporaire supprimé : ${yesNo(r.tempDeleted)}`);
    }
    L.push(`Résultat : ${x.ok ? 'téléchargé' : x.refused ? `refusé — ${x.error}` : `ÉCHEC — ${x.error}`}`);
    const d = state.decode;
    if (d) {
      if (d.ok) {
        L.push(`Décodage (decodeAudioData) : OK en ${d.ms} ms · ${d.channels} canaux · ${d.duration.toFixed(3)} s (attendu ${d.expectedDuration ?? '?'} s) · tampon à ${d.sampleRate} Hz (contexte ${d.contextSampleRate} Hz, source ${d.sourceSampleRate || '?'} Hz)`);
      } else {
        L.push(`Décodage (decodeAudioData) : ÉCHEC en ${d.ms} ms · ${d.error}`);
      }
      const c = r && r.file ? r.file.container : null;
      if (c && c.fragmented) {
        L.push(`Conclusion ffmpeg : ${d.ok ? 'Chromium décode le m4a DASH non remuxé → ffmpeg inutile.' : 'Chromium refuse le m4a DASH non remuxé → il faudra un remux (ffmpeg ou équivalent).'}`);
      } else if (c) {
        L.push(`Conclusion ffmpeg : fichier non fragmenté (${c.kind}), la question du m4a DASH reste ouverte.`);
      }
    }
  }

  L.push('');
  L.push('--- WebGPU ---');
  const g = state.webgpu;
  if (!g) {
    L.push('En cours…');
  } else if (!g.present) {
    L.push('navigator.gpu : absent');
  } else {
    L.push(`navigator.gpu : présent · format de canevas préféré ${g.preferredCanvasFormat || '?'}`);
    if (g.error) L.push(`Erreur : ${g.error}`);
    if (g.adapter === null) L.push('Adaptateur : aucun (requestAdapter a renvoyé null)');
    if (g.adapter) {
      const a = g.adapter;
      L.push(`Adaptateur : vendor ${a.vendor || '?'} · architecture ${a.architecture || '?'} · device ${a.device || '?'} · description ${a.description || '?'} · fallback ${yesNo(a.isFallbackAdapter)}`);
      L.push(`Limites : ${Object.entries(g.limits).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
      L.push(`Fonctions (${g.features.length}) : ${g.features.join(', ')}`);
    }
  }
  return L.join('\n');
}

function renderDiagnostics() {
  $('diag-text').textContent = diagnosticsText();
}

async function copyDiagnostics() {
  try {
    await fabtice.copyText(diagnosticsText());
    setStatus($('copy-status'), 'Diagnostic copié dans le presse-papiers.');
  } catch (e) {
    setStatus($('copy-status'), `Copie impossible : ${e.message}`, true);
  }
}

// ---------------------------------------------------------------- start

$('ytdlp-install').addEventListener('click', installYtdlp);
$('import-form').addEventListener('submit', runImport);
$('copy-diag').addEventListener('click', copyDiagnostics);
$('play').addEventListener('click', () => (player.playing ? player.pause() : player.play()));
$('position').addEventListener('input', () => { player.dragging = true; });
$('position').addEventListener('change', () => {
  player.dragging = false;
  player.seek(Number($('position').value));
});

(async () => {
  renderDiagnostics();
  requestAnimationFrame(tick);
  state.system = await fabtice.systemInfo();
  renderDiagnostics();
  await Promise.all([refreshYtdlp().then(() => refreshUpdate()), probeWebGpu().then(renderDiagnostics)]);
  document.body.dataset.ready = 'true';
})();
