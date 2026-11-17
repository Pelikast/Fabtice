// « Alléger le travail pour l'appareil » (stage 6, C2): the pure rules.
//
// A processor or a graphics chip cannot be capped at an exact percentage; the value is reached ON AVERAGE:
// the heavy computations rest after each slice of work, for as long as `slice × (1 − share) / share`, and, on
// the processor, use fewer threads. Nothing here touches the browser, the store or a worker: the computations
// (`separation/`, `analysis/`, `render/`, `structure/instruments/`) call these functions with the share the
// store holds (`settings/easeLoadShare.ts`), read when a computation starts.
//
// The share is the fraction of the device's capacity used, 0.2 to 0.99, or 1 when the case is unticked: with
// 1, none of the helpers does anything (no thread removed, no pause, not even an extra tick of the event loop).
//
// Threads and pauses compound: running on 6 of 8 threads already uses 75 % of the device, and resting a
// further 25 % of the time would bring it to 56 %. One consistent rule (`easePlan`): the threads are reduced
// by the share, and the pause is computed for what the reduction does not already take, so that the average
// stays at the share (and below it only where rounding the threads down made it so).

/** 1: the case is unticked (full speed). Otherwise `percent` / 100. */
export function loadShare(settings: { easeLoad: boolean; easeLoadPercent: number }): number {
  if (!settings.easeLoad) return 1;
  const share = settings.easeLoadPercent / 100;
  return Number.isFinite(share) ? Math.min(1, Math.max(0.2, share)) : 1;
}

/** True when the share asks for any reduction. */
export function isEased(share: number | undefined): share is number {
  return share !== undefined && Number.isFinite(share) && share < 1;
}

/** The rest after a slice of `sliceMs` of work, so that work makes `share` of the time: `sliceMs × (1 − share) / share`. */
export function pauseAfterMs(sliceMs: number, share: number): number {
  if (!(sliceMs > 0) || !isEased(share)) return 0;
  const s = Math.max(0.01, share);
  return (sliceMs * (1 - s)) / s;
}

/** The fewer threads: `max(1, round(threads × share))`; `threads` itself at full speed. */
export function reducedThreads(threads: number, share: number): number {
  const n = Math.max(1, Math.floor(threads));
  if (!isEased(share)) return n;
  return Math.max(1, Math.min(n, Math.round(n * share)));
}

export interface EasePlan {
  /** Threads (or parallel workers) to use. */
  units: number;
  /** The share the pauses must make up: 1 when the reduction of the units already takes all of it (no pause). */
  duty: number;
}

/**
 * Fewer units AND pauses, as one rule: `units` are reduced by the share (at least one), and the pauses make up the
 * rest, `duty = min(1, share × units / reduced)`, so that `reduced / units × duty` is the share. With one unit,
 * the duty is the share itself (the plain rule).
 */
export function easePlan(units: number, share: number): EasePlan {
  const n = Math.max(1, Math.floor(units));
  if (!isEased(share)) return { units: n, duty: 1 };
  const reduced = reducedThreads(n, share);
  return { units: reduced, duty: Math.min(1, (share * n) / reduced) };
}

/**
 * The separation's choice: on the processor, `easePlan` of its threads; on the graphics chip, the threads (which only
 * serve the few operators the chip leaves to the processor) are kept and the pause makes up the whole share.
 */
export function separationEase(backend: 'gpu' | 'cpu', threads: number, share: number): EasePlan {
  return backend === 'gpu' ? { units: Math.max(1, Math.floor(threads)), duty: isEased(share) ? share : 1 } : easePlan(threads, share);
}

/** What a computation that lasts `seconds` at full speed lasts at this share: `seconds / share`. */
export function stretchedSeconds(seconds: number, share: number): number {
  return isEased(share) ? seconds / Math.max(0.01, share) : seconds;
}

// ---------------------------------------------------------------- the pause between slices

/** Pauses shorter than this are not slept at once but added up (a timer cannot rest less than a few ms). */
export const MIN_SLEEP_MS = 8;

/** A sleep that `wake()` ends at once (a cancellation during a pause must not wait for it to run out). */
export interface Sleeper {
  sleep(ms: number): Promise<void>;
  wake(): void;
}

export function createSleeper(): Sleeper {
  let wake: (() => void) | null = null;
  return {
    sleep: (ms) =>
      new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(handle);
          if (wake === done) wake = null;
          resolve();
        };
        const handle = setTimeout(done, Math.max(0, ms));
        wake = done;
      }),
    wake: () => wake?.(),
  };
}

export interface ThrottleOptions {
  /** The duty the pauses make up (`EasePlan.duty`, or the share when no thread is removed). */
  share: number;
  /** Clock, ms (replaceable in tests). */
  now?: () => number;
  /** The sleep (replaceable in tests; a `Sleeper`'s, so that a cancellation ends it at once). */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The pause after each slice. `mark()` says a slice begins; `pause()` rests for the time that slice took, scaled by
 * the share, and marks the next one. `createThrottle` gives null at full speed: the caller then has no pause code
 * to run at all.
 */
export interface Throttle {
  mark(): void;
  /** Rests, resolving with the milliseconds slept (0 when the pause was too short to sleep and was kept for later). */
  pause(): Promise<number>;
  /** Total milliseconds rested so far. */
  readonly rested: number;
}

export function createThrottle(options: ThrottleOptions): Throttle | null {
  if (!isEased(options.share)) return null;
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let began = now();
  let owed = 0;
  let rested = 0;
  return {
    mark() {
      began = now();
    },
    async pause() {
      owed += pauseAfterMs(now() - began, options.share);
      let slept = 0;
      if (owed >= MIN_SLEEP_MS) {
        slept = owed;
        owed = 0;
        await sleep(slept);
        rested += slept;
      }
      began = now();
      return slept;
    },
    get rested() {
      return rested;
    },
  };
}
