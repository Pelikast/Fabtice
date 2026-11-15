// Steady progress of the fine chord model. The model reports a window only when it is done
// (30 s of music each, several seconds to a minute of work), which would make the progress move
// in a dozen steps. This clock estimates, between two reports, how far the current window has
// got from the durations of the windows before it, and never claims the window is finished
// before the worker says so: the estimate is capped just below the next boundary. Pure: the time
// is given by the caller, so it is testable without timers.

/** Seconds of work per window assumed before anything is measured (about 1.5 s per second of music, as measured on a computer). */
export const DEFAULT_WINDOW_SECONDS = 45;
/** Inside a window the estimate never goes past this share of it until the worker reports it done. */
const WINDOW_CAP = 0.97;
/** Weight of the latest window in the running estimate of a window's duration. */
const LATEST_WEIGHT = 0.4;

export interface WindowClock {
  /** The worker has started its windows (`total` of them), or reported `done` of them finished. */
  report(done: number, total: number, now: number): void;
  /** Fraction of the whole step, 0…1: never goes back, reaches 1 only when the last window is reported. */
  fraction(now: number): number;
  /** Seconds one window takes, as estimated now (the prior of the next analysis in this session). */
  windowSeconds(): number;
}

/**
 * `priorSeconds`: the duration of a window to expect before the first one is over (the measured
 * one of an earlier analysis in this session, or the conservative default). Times are in ms.
 */
export function createWindowClock(priorSeconds: number = DEFAULT_WINDOW_SECONDS): WindowClock {
  let estimate = Math.max(0.5, priorSeconds);
  let measured = false;
  let total = 0;
  let done = 0;
  let windowStart = 0;
  let started = false;
  let latest = 0;

  return {
    report(d, tot, now) {
      if (tot <= 0) return;
      total = tot;
      if (!started) {
        started = true;
        done = Math.min(d, tot);
        windowStart = now;
        return;
      }
      if (d <= done) return;
      // Windows that ended since the last report share the time that went by.
      const seconds = Math.max(0, now - windowStart) / 1000 / (d - done);
      if (seconds > 0.05) {
        // The first measure replaces the prior; later ones move the estimate gradually.
        estimate = measured ? estimate * (1 - LATEST_WEIGHT) + seconds * LATEST_WEIGHT : seconds;
        measured = true;
      }
      done = Math.min(d, tot);
      windowStart = now;
    },
    fraction(now) {
      if (!started || total <= 0) return latest;
      if (done >= total) return (latest = 1);
      const x = Math.max(0, now - windowStart) / 1000 / estimate;
      // Linear while the estimate holds, then ever slower towards the cap if the window takes longer.
      const knee = 0.9 * WINDOW_CAP;
      const inside = x <= knee ? x : knee + (WINDOW_CAP - knee) * (1 - Math.exp(-(x - knee) / 0.5));
      const f = Math.min((done + Math.min(WINDOW_CAP, inside)) / total, (done + WINDOW_CAP) / total);
      latest = Math.max(latest, f);
      return latest;
    },
    windowSeconds: () => estimate,
  };
}
