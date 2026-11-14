// What the engine needs from ONNX Runtime, so that the pure parts can be
// tested without it and the worker hands in the real module.

import { AnalysisError } from '../types';

export interface TensorLike {
  readonly data: ArrayLike<number>;
  readonly dims: readonly number[];
}

export interface OrtLike {
  Tensor: new (type: 'float32', data: Float32Array, dims: readonly number[]) => unknown;
}

export interface SessionLike {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, TensorLike>>;
}

/** Hooks the long steps call: cancellation and progress inside a step. */
export interface RunControl {
  /** Throws `AnalysisError('cancelled')` when the analysis was cancelled. */
  check(): void;
  /** Progress of the current step, 0…1. */
  progress(fraction: number): void;
  /** Lets pending messages (a cancellation) be handled between two pieces of work. */
  yieldNow(): Promise<void>;
}

export const noControl: RunControl = {
  check() {},
  progress() {},
  yieldNow: () => Promise.resolve(),
};

export function cancelled(): AnalysisError {
  return new AnalysisError('cancelled');
}
