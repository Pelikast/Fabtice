// The measurement report of a real separation, as plain text the owner can
// copy and send back: which tool, graphics chip or processor (and what the
// browser says the adapter is), the fallback and the segment it happened at,
// the piece's length, the time of the computation and per segment, the
// download. No personal data: no title, no file name, no path.
//
// Kept after each real separation (in memory and in this browser's storage,
// with the id of the separation it belongs to): the separation panel offers
// « Copier le rapport » once the separation is done, and the Mac app adds the
// same text to its diagnostic report (Aide → Diagnostic…).

import { formatNumber, t } from '../i18n';
import { getDesktopBridge } from '../platform/desktopBridge';

export interface SeparationReport {
  toolId: string;
  toolName: string;
  /** SHA-256 of the weights (says exactly which file). */
  toolSha256: string;
  /** Where it was asked to run (`auto`: graphics chip first). */
  requested: 'auto' | 'cpu';
  /** Where it finished. */
  backend: 'gpu' | 'cpu';
  /** The graphics adapter, as the browser describes it (maker, family, model), or null. */
  adapter: string | null;
  fellBack: boolean;
  /** When the graphics path failed: how, at which segment (1-based in the text), the runtime's message. */
  fallback: { stage: string; segment: number | null; message: string } | null;
  pieceSeconds: number;
  channels: 'mono' | 'stereo';
  /** Seconds of music each segment adds (the step between two segments). */
  segmentSeconds: number;
  segments: number;
  /** Wall-clock seconds from the tool being ready to the last part written (download excluded). */
  computeSeconds: number;
  /** Seconds per segment, on each path (null when none ran there). */
  perSegment: { gpu: number | null; cpu: number | null };
  /** Seconds to load the network, on each path. */
  sessionSeconds: { gpu: number | null; cpu: number | null };
  /** Download of the tool: seconds and bytes, or null when it was already on the device. */
  download: { seconds: number; bytes: number } | null;
  /** Seconds to read the tool back from the device (and check it) when it was there. */
  readSeconds: number | null;
  threads: number | null;
  isolated: boolean;
  cores: number | null;
  memoryGB: number | null;
  browser: string;
  runtime: string;
  /** ISO date of the end. */
  at: string;
}

const n1 = (x: number) => formatNumber(x, 1);
const n2 = (x: number) => formatNumber(x, 2);
const where = (b: 'gpu' | 'cpu') => t(b === 'gpu' ? 'separationReport.gpu' : 'separationReport.cpu');
const STAGES = ['unavailable', 'session', 'segment', 'lost', 'output', 'timeout', 'crash'] as const;
const stage = (s: string) => ((STAGES as readonly string[]).includes(s) ? t(`separationReport.stage.${s as (typeof STAGES)[number]}`) : s);

/** The report as text in the interface language, ready to paste. */
export function formatSeparationReport(r: SeparationReport): string {
  const L: string[] = [];
  L.push(t('separationReport.title'));
  L.push(t('separationReport.date', { at: r.at }));
  L.push(t('separationReport.tool', { name: r.toolName, id: r.toolId, sha: r.toolSha256.slice(0, 12) }));
  L.push(t('separationReport.where', { asked: t(r.requested === 'auto' ? 'separationReport.askedAuto' : 'separationReport.askedCpu'), done: where(r.backend) }));
  L.push(t('separationReport.adapter', { adapter: r.adapter ?? (r.requested === 'auto' ? t('separationReport.adapterUnknown') : '—') }));
  if (r.fellBack && r.fallback) {
    const at = r.fallback.segment === null ? t('separationReport.fallbackBefore') : t('separationReport.fallbackAt', { n: r.fallback.segment + 1, of: r.segments });
    L.push(t('separationReport.fallback', { at, stage: stage(r.fallback.stage), message: r.fallback.message.slice(0, 200) }));
  } else L.push(t('separationReport.noFallback'));
  L.push(t('separationReport.piece', { s: n1(r.pieceSeconds), channels: t(r.channels === 'mono' ? 'separationReport.mono' : 'separationReport.stereo') }));
  L.push(t('separationReport.segments', { n: r.segments, s: n2(r.segmentSeconds) }));
  L.push(t('separationReport.compute', { s: n1(r.computeSeconds), x: n2(r.computeSeconds / Math.max(1e-9, r.pieceSeconds)) }));
  for (const b of ['gpu', 'cpu'] as const) {
    const s = r.perSegment[b];
    if (s !== null) L.push(t('separationReport.perSegment', { where: where(b), s: n2(s), x: n2(s / r.segmentSeconds) }));
  }
  for (const b of ['gpu', 'cpu'] as const) {
    const s = r.sessionSeconds[b];
    if (s !== null) L.push(t('separationReport.session', { where: where(b), s: n1(s) }));
  }
  L.push(r.download ? t('separationReport.download', { s: n1(r.download.seconds), mb: Math.round(r.download.bytes / 1e6) }) : t('separationReport.kept', { s: n1(r.readSeconds ?? 0) }));
  L.push(t('separationReport.machine', { threads: r.threads ?? '?', cores: r.cores ?? '?', memory: r.memoryGB === null ? '?' : t('separationReport.gb', { n: r.memoryGB }), isolated: t(r.isolated ? 'separationReport.yes' : 'separationReport.no') }));
  L.push(t('separationReport.runtime', { runtime: r.runtime }));
  L.push(t('separationReport.browser', { browser: r.browser }));
  return L.join('\n');
}

const STORAGE_KEY = 'fabtice.separation.report.v1';
let kept: { id: string; text: string } | null = null;
const listeners = new Set<() => void>();

function readKept(): { id: string; text: string } | null {
  if (kept) return kept;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { id?: unknown; text?: unknown } | null;
    if (raw && typeof raw.id === 'string' && typeof raw.text === 'string') kept = { id: raw.id, text: raw.text };
  } catch {
    kept = null;
  }
  return kept;
}

/** Keeps the report of the separation `id` (the last one replaces the previous) and hands it to the Mac app. */
export function keepSeparationReport(id: string, report: SeparationReport): void {
  const text = formatSeparationReport(report);
  kept = { id, text };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // kept for this page only
  }
  const bridge = getDesktopBridge();
  try {
    void bridge?.reportSeparation?.(text)?.catch(() => {});
  } catch {
    // a Mac app that predates it
  }
  listeners.forEach((fn) => fn());
}

/** The report text of the separation `id`, if this browser kept it. */
export function separationReportFor(id: string): string | null {
  const k = readKept();
  return k && k.id === id ? k.text : null;
}

export function onSeparationReport(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
