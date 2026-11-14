// The automatic choice of the separation tool, from what the device is.
//
// Pure functions (`assessDevice`, `chooseModel`, `estimateSeconds`) tested in
// Node; `probeDevice()` is the one part that asks the browser. The rules come
// from the phase 0 measurements on the owner's devices (CLAUDE.md):
//   - a phone gets the lightest tool (the page of an iPhone was killed for
//     memory with it already: the separator must keep memory low there);
//   - Safari's graphics path failed (device lost) on the M1, and its processor
//     path ran the best tool at 4.0 times the duration, close to Chrome's
//     graphics path (3.6): in Safari, the processor directly;
//   - an Apple graphics chip elsewhere (Chrome, the Mac app): the best tool on
//     the graphics path;
//   - another graphics chip, or none: the balanced tool (unknown power);
//   - a tool whose memory the device cannot spare is skipped for a lighter one.
// The user can override the choice in the advanced settings; the choice is
// never changed behind their back (and a graphics failure keeps the tool).

import type { SeparationBackend } from '../model/separation';
import type { DeviceProfile, ModelChoice, SeparationModelSpec } from './types';

/** What `probeDevice` reads from the browser, kept raw so `assessDevice` stays pure. */
export interface DeviceSignals {
  userAgent: string;
  maxTouchPoints: number;
  /** `navigator.deviceMemory` (GB) or undefined. */
  deviceMemory?: number;
  hardwareConcurrency?: number;
  /** WebGPU adapter info, or null when there is none (or it could not be had). */
  gpu: { vendor: string; isFallback: boolean } | null;
  /** `window.fabtice` present. */
  desktopApp: boolean;
}

export function assessDevice(sig: DeviceSignals): DeviceProfile {
  const ua = sig.userAgent;
  const ipadAsMac = /Macintosh/.test(ua) && sig.maxTouchPoints > 1;
  const phone = /iPhone|iPad|iPod|Android|Mobile/i.test(ua) || ipadAsMac;
  const chromium = /Chrome\/|Chromium\/|Edg\//.test(ua) || sig.desktopApp;
  const browser: DeviceProfile['browser'] = chromium ? 'chromium' : /Firefox\//.test(ua) ? 'firefox' : /Safari\//.test(ua) ? 'safari' : 'other';
  let gpu: DeviceProfile['gpu'] = 'none';
  if (sig.gpu) gpu = sig.gpu.isFallback ? 'fallback' : /apple/i.test(sig.gpu.vendor) ? 'apple' : 'other';
  return {
    phone,
    gpu,
    browser,
    memoryGB: typeof sig.deviceMemory === 'number' && sig.deviceMemory > 0 ? sig.deviceMemory : null,
    cores: Math.max(1, sig.hardwareConcurrency ?? 4),
    desktopApp: sig.desktopApp,
  };
}

/** True when the device can spare the tool's memory (unknown memory: assumed fine on a computer). */
function fits(model: SeparationModelSpec, d: DeviceProfile): boolean {
  if (d.memoryGB === null) return !d.phone || model.memoryBytes <= 600e6;
  // Leave half of what the browser reports to the rest of the page and the system.
  return model.memoryBytes <= d.memoryGB * 1e9 * 0.5;
}

/** Main tools, best first. */
function mainTools(models: readonly SeparationModelSpec[]): SeparationModelSpec[] {
  return models.filter((m) => m.kind === 'main').sort((a, b) => b.quality - a.quality);
}

/** The automatic choice, or null when the list has no main tool (all withdrawn). */
export function chooseModel(models: readonly SeparationModelSpec[], d: DeviceProfile): ModelChoice | null {
  const tools = mainTools(models);
  if (tools.length === 0) return null;
  const lightest = [...tools].sort((a, b) => a.memoryBytes - b.memoryBytes)[0]!;
  const best = tools.find((m) => fits(m, d)) ?? lightest;
  const balanced = tools.find((m) => m.quality < tools[0]!.quality && fits(m, d)) ?? best;
  const usableGpu = d.gpu === 'apple' || d.gpu === 'other';

  if (d.phone) return { model: lightest, backend: usableGpu && d.browser !== 'safari' ? 'gpu' : 'cpu', reason: 'téléphone ou tablette' };
  if (d.browser === 'safari') {
    // The graphics path fails in Safari (phase 0): the processor, which on Apple silicon runs the best tool nearly as fast.
    return d.gpu === 'apple'
      ? { model: best, backend: 'cpu', reason: 'Safari sur un Mac à puce Apple : calcul par le processeur' }
      : { model: balanced, backend: 'cpu', reason: 'Safari : calcul par le processeur' };
  }
  if (d.gpu === 'apple') return { model: best, backend: 'gpu', reason: 'carte graphique Apple' };
  if (d.gpu === 'other') return { model: balanced, backend: 'gpu', reason: 'carte graphique de puissance inconnue' };
  return { model: balanced, backend: 'cpu', reason: 'pas de carte graphique utilisable' };
}

/** The tool to use: the one chosen in the advanced settings when it is still listed, else the automatic one. */
export function resolveModel(models: readonly SeparationModelSpec[], d: DeviceProfile, setting: 'auto' | string): ModelChoice | null {
  const auto = chooseModel(models, d);
  if (setting === 'auto') return auto;
  const chosen = models.find((m) => m.id === setting && m.kind === 'main');
  if (!chosen) return auto;
  const gpu = (d.gpu === 'apple' || d.gpu === 'other') && d.browser !== 'safari';
  return { model: chosen, backend: gpu ? 'gpu' : 'cpu', reason: 'choisi dans les réglages avancés' };
}

/**
 * Honest estimate of the computation, in seconds, for `pieceSeconds` of audio
 * (download excluded). The processor speed of the list is for an 8-core
 * computer; fewer cores take proportionally longer (up to three times).
 */
export function estimateSeconds(model: SeparationModelSpec, backend: SeparationBackend, d: DeviceProfile, pieceSeconds: number): number {
  const cpuFactor = Math.min(3, Math.max(1, 8 / d.cores));
  const factor = backend === 'gpu' && model.speed.gpu !== null ? model.speed.gpu : model.speed.cpu * cpuFactor;
  return Math.max(5, pieceSeconds * factor);
}

type Nav = Navigator & { deviceMemory?: number; gpu?: { requestAdapter(o?: unknown): Promise<unknown> } };

/** What can be read at once, without asking the graphics chip (phone or not, browser, memory, cores). */
function quickSignals(gpu: DeviceSignals['gpu']): DeviceSignals {
  const nav = typeof navigator === 'undefined' ? null : (navigator as Nav);
  return {
    userAgent: nav?.userAgent ?? '',
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    deviceMemory: nav?.deviceMemory,
    hardwareConcurrency: nav?.hardwareConcurrency,
    gpu,
    desktopApp: typeof window !== 'undefined' && 'fabtice' in window,
  };
}

/**
 * Reads the device (WebGPU adapter, memory, cores, phone or not). Never rejects.
 * Asking for the adapter makes Chromium print a warning on a machine without
 * one, so it is done only when the separation is really being considered
 * (`getDevice()`), never at launch.
 */
export async function probeDevice(): Promise<DeviceProfile> {
  const nav = typeof navigator === 'undefined' ? null : (navigator as Nav);
  let gpu: DeviceSignals['gpu'] = null;
  try {
    const adapter = (await nav?.gpu?.requestAdapter({ powerPreference: 'high-performance' })) as
      | { info?: { vendor?: string; isFallbackAdapter?: boolean }; isFallbackAdapter?: boolean }
      | null
      | undefined;
    if (adapter) gpu = { vendor: adapter.info?.vendor ?? '', isFallback: !!(adapter.info?.isFallbackAdapter || adapter.isFallbackAdapter) };
  } catch {
    gpu = null;
  }
  return assessDevice(quickSignals(gpu));
}

let probed: Promise<DeviceProfile> | null = null;
let known: DeviceProfile | null = null;

/** The device, probed once per page. */
export function getDevice(): Promise<DeviceProfile> {
  probed ??= probeDevice().then((d) => (known = d));
  return probed;
}

/** The device if already probed (screens read it synchronously), else what is known without the graphics chip. */
export function knownDevice(): DeviceProfile {
  return known ?? assessDevice(quickSignals(null));
}

/** Replaces the probed device (tests, `?demo`). */
export function setDevice(d: DeviceProfile): void {
  known = d;
  probed = Promise.resolve(d);
}
