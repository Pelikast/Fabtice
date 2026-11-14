'use strict';

// The report of an import, as text to paste into a conversation: where the
// time went (start-up of yt-dlp, lookup, time before the first progress line,
// download speed), then the technical detail. Built in the main process from
// the report that `extractAudio` returns (already stripped of the home folder).
// French, like the rest of the diagnostics.

const seconds = (ms) => (ms === null || ms === undefined ? '?' : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);
const megabytes = (bytes) => (bytes === null || bytes === undefined ? '?' : `${(bytes / 1048576).toFixed(2).replace('.', ',')} Mo`);
const perSecond = (bytesPerSecond) => (bytesPerSecond === null || bytesPerSecond === undefined ? '?' : `${(bytesPerSecond / 1048576).toFixed(2).replace('.', ',')} Mo/s`);

/**
 * `entry`: { at: ISO date, ok, error, refused, report } as kept by the main
 * process after an import started from the interface.
 */
function formatImportReport(entry) {
  const L = [];
  const r = entry.report || {};
  L.push('Rapport du dernier import fait depuis l’interface');
  L.push(`Date : ${entry.at}`);
  L.push(`Résultat : ${entry.ok ? 'réussi' : entry.refused ? `refusé — ${entry.error}` : `ÉCHEC — ${entry.error}`}`);
  if (r.url) L.push(`Lien : ${r.url}`);
  if (r.meta) {
    const m = r.meta;
    L.push(`Morceau : « ${m.title} » · ${m.duration !== null ? `${Math.round(m.duration)} s` : 'durée inconnue'} · format ${m.formatId} (${m.ext}, ${m.protocol})`);
  }
  L.push(`Durée totale : ${seconds(r.totalMs)}`);
  L.push('');
  L.push('Où le temps est passé');
  const [info, dl] = r.steps || [];
  if (info) {
    L.push(`  1. Recherche du morceau (yt-dlp -J) : ${seconds(info.durationMs)}`);
    L.push(`     démarrage de yt-dlp (premier message après) : ${seconds(info.firstStderrMs)}`);
    L.push(`     le reste (lecture de la page, calculs) : ${seconds(info.firstStderrMs === null ? null : info.durationMs - info.firstStderrMs)}`);
  }
  if (dl) {
    const d = r.download || {};
    L.push(`  2. Téléchargement du son (yt-dlp --load-info-json) : ${seconds(dl.durationMs)}`);
    L.push(`     démarrage de yt-dlp (premier message après) : ${seconds(d.firstOutputMs)}`);
    L.push(`     temps avant la première ligne de progression : ${seconds(d.firstProgressMs)}${d.firstProgressMs === null ? ' (aucune ligne de progression)' : ' — affiché comme « Préparation du téléchargement »'}`);
    L.push(`     lignes de progression : ${d.progressLines ?? 0} · taille annoncée : ${d.sizeKnown ? megabytes(d.sizeAnnounced) : 'inconnue'}`);
    if (d.transferMs !== null && d.transferMs !== undefined) {
      L.push(`     téléchargement proprement dit : ${seconds(d.transferMs)} pour ${megabytes(d.fileBytes)}, soit ${perSecond(d.bytesPerSecond)}`);
    }
    if (d.firstProgressLine) L.push(`     première ligne : ${d.firstProgressLine}`);
    if (d.lastProgressLine) L.push(`     dernière ligne : ${d.lastProgressLine}`);
    if (d.finishedLine) L.push(`     bilan de yt-dlp : ${d.finishedLine}`);
  }
  if (r.file) L.push(`  Fichier reçu : ${r.file.name} · ${megabytes(r.file.size)} · ${r.file.container && r.file.container.label ? r.file.container.label : '?'}`);
  L.push('');
  L.push('Détail technique');
  for (const step of r.steps || []) {
    L.push(`> ${step.label} : code ${step.exitCode}${step.signal ? ` · signal ${step.signal}` : ''}${step.timedOut ? ' · DÉLAI DÉPASSÉ' : ''}${step.spawnError ? ` · lancement impossible : ${step.spawnError}` : ''} · ${seconds(step.durationMs)}`);
    L.push(`  arguments : ${JSON.stringify(step.args)}`);
    for (const line of step.stderrTail || []) L.push(`    ${line}`);
  }
  if (r.debugLines && r.debugLines.length) {
    L.push('> Lignes clés de yt-dlp :');
    for (const line of r.debugLines) L.push(`    ${line}`);
  }
  if (r.download && r.download.samples && r.download.samples.length) {
    L.push('> Premières lignes de progression (ms depuis le lancement) :');
    for (const s of r.download.samples) L.push(`    ${s.ms} ms  ${s.line}`);
  }
  return L.join('\n');
}

module.exports = { formatImportReport };
