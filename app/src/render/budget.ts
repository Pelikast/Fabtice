// What the device can hold and compute for « Appliquer »: a plain budget, not
// a promise. An applied render is one more copy of the tracks at the played
// speed, kept in memory (see the README, « Le rendu appliqué vit en mémoire »),
// so a piece that would not fit is refused calmly, up front, rather than
// found out by a page the system closes.
//
// Sizes. A rendered track weighs `frames / tempoRatio` frames of 16 bits, once
// for a mono track (stored once) and twice for a stereo one: 5 minutes of
// stereo at 0.7× tempo are 82 MB, 7 such tracks 575 MB.

import type { PcmAudio } from '../audio/pcm';

/** Bytes an applied render of this audio would hold at this tempo (16-bit samples, one or two channels). */
export function appliedBytes(audio: Pick<PcmAudio, 'frames' | 'mono'>, tempoRatio: number): number {
  return Math.ceil(audio.frames / tempoRatio) * 2 * (audio.mono ? 1 : 2);
}

export function totalAppliedBytes(tracks: readonly Pick<PcmAudio, 'frames' | 'mono'>[], tempoRatio: number): number {
  let n = 0;
  for (const t of tracks) n += appliedBytes(t, tempoRatio);
  return n;
}

export interface DeviceFacts {
  /** `navigator.deviceMemory`, in GB (Chromium: 0.25…8, rounded down to a power of two); undefined elsewhere. */
  deviceMemoryGb?: number;
  /** `navigator.hardwareConcurrency`. */
  cores?: number;
  /** A phone or a tablet (touch-first, small memory). */
  phone: boolean;
  /** Forces the budget (tests and demonstrations). */
  budgetBytes?: number;
}

let override: DeviceFacts | null = null;

/** Replaces the facts of the device (tests, demonstrations); `null` goes back to reading them. */
export function setDeviceFactsForTests(facts: DeviceFacts | null): void {
  override = facts;
}

/** The facts of the device this page runs on. */
export function readDeviceFacts(): DeviceFacts {
  if (override) return override;
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Partial<Navigator> & { deviceMemory?: number };
  const ua = nav.userAgent ?? '';
  const touchMac = /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1; // an iPad that says it is a Mac
  return {
    deviceMemoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined,
    phone: /iPhone|iPad|iPod|Android/.test(ua) || touchMac,
  };
}

const MB = 1024 * 1024;

/**
 * The most an applied render may hold on this device, bytes. A tenth of the
 * memory the browser says the device has (the pieces, the waveforms, the
 * engine and the page itself are already in the rest), a fifteenth on a
 * phone, never more than 1.5 GB nor less than 128 MB; when the browser does
 * not say (Safari, Firefox), 768 MB on a computer (every Mac Fabtice runs on
 * has 4 GB or more) and 192 MB on a phone (the page of an iPhone 14 Pro Max
 * was closed by the system during a separation, measured: CLAUDE.md).
 */
export function renderBudgetBytes(facts: DeviceFacts = readDeviceFacts()): number {
  if (facts.budgetBytes !== undefined) return facts.budgetBytes;
  if (facts.deviceMemoryGb !== undefined && facts.deviceMemoryGb > 0) {
    const share = facts.phone ? 1 / 15 : 1 / 10;
    return Math.round(Math.min(1536 * MB, Math.max(128 * MB, facts.deviceMemoryGb * 1024 * MB * share)));
  }
  return (facts.phone ? 192 : 768) * MB;
}

/** True when the applied render of these tracks fits the budget. */
export function appliedFits(tracks: readonly Pick<PcmAudio, 'frames' | 'mono'>[], tempoRatio: number, facts?: DeviceFacts): boolean {
  return totalAppliedBytes(tracks, tempoRatio) <= renderBudgetBytes(facts);
}

/**
 * How many tracks are worth rendering at once: one worker per core but one
 * (the audio thread and the page need theirs while the preview plays), at most
 * 3, 1 on a phone. Measured on a 4-core virtual machine, 4 stereo tracks of
 * 60 s: 1.5 to 1.9 times faster with 2 workers, no better beyond (the wasm
 * engines share the memory bandwidth), so 3 is a ceiling, not a promise; each
 * worker also holds a WebAssembly instance and a few blocks.
 */
export function renderParallelism(facts: DeviceFacts = readDeviceFacts()): number {
  if (facts.phone) return 1;
  return Math.max(1, Math.min(3, (facts.cores ?? 2) - 1));
}
