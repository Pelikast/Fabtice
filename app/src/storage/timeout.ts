// A time limit for a step that must never be waited on for ever.

export class StepTimeout extends Error {
  constructor(
    /** Which step ran out of time (« document », « read », « decode », « prepare », « write »…). */
    readonly step: string,
    readonly ms: number,
  ) {
    super(`step « ${step} » took more than ${ms} ms`);
    this.name = 'StepTimeout';
  }
}

/**
 * Settles like `promise`, or rejects with `StepTimeout` after `ms`. The timer
 * is always cleared; if the promise settles later its outcome is dropped (a
 * late rejection never surfaces as an unhandled one).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, step: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new StepTimeout(step, ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
