// Decoding the bytes of an audio file to PCM at the engine rate (48 kHz).
// Shared by the file import, the link import and the reopening of a stored
// piece, so a piece sounds the same at every launch.
//
//   - mp3, wav, m4a, flac: Web Audio's decodeAudioData on an
//     OfflineAudioContext created at 48 kHz (it resamples while decoding and
//     needs no user gesture, unlike a running AudioContext);
//   - aiff: our own reader (Chromium cannot decode AIFF), then `resample.ts`.

import { ENGINE_SAMPLE_RATE } from '../audio/AudioEngine';
import type { DecodedAudio } from '../audio/registry';
import { decodeAiff } from './aiff';
import { detectAudioFormat, probeDuration } from './detect';
import { MAX_DURATION_SECONDS, MAX_FILE_BYTES, MIN_DURATION_SECONDS } from './limits';
import { resampleChannels } from './resample';
import { ImportError, type ImportProgress } from './types';

export interface DecodeOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => void;
  /** Name shown with the progress. */
  title?: string;
  /** Replaces Web Audio (tests). Receives a copy of the bytes it may keep. */
  decodeWebAudio?: (bytes: ArrayBuffer) => Promise<DecodedAudio>;
}

/** Web Audio at 48 kHz. The buffer's channels are used as they are, without a copy. */
export async function decodeWithWebAudio(bytes: ArrayBuffer): Promise<DecodedAudio> {
  const Ctor: typeof OfflineAudioContext | undefined =
    typeof OfflineAudioContext !== 'undefined'
      ? OfflineAudioContext
      : (globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Ctor) throw new ImportError('decode-failed', 'Web Audio is not available');
  const context = new Ctor(2, 1, ENGINE_SAMPLE_RATE);
  const buffer = await context.decodeAudioData(bytes);
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  return { channels, sampleRate: buffer.sampleRate };
}

/** Surround to stereo (ITU weights for 5.1), anything else keeps its first two channels. */
export function toStereoOrMono(channels: Float32Array[]): Float32Array[] {
  if (channels.length <= 2) return channels;
  const n = channels[0]!.length;
  if (channels.length !== 6) return [channels[0]!, channels[1]!];
  const [l, r, c, , ls, rs] = channels as [Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array];
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const k = 0.7071;
  for (let i = 0; i < n; i++) {
    const centre = k * c[i]!;
    // 1 / (1 + 2k) keeps a full-scale signal from clipping.
    left[i] = (l[i]! + centre + k * ls[i]!) / 2.4142;
    right[i] = (r[i]! + centre + k * rs[i]!) / 2.4142;
  }
  return [left, right];
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ImportError('cancelled');
}

/** Resolves like `promise`, or rejects at once with `cancelled` if the signal fires first. */
function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ImportError('cancelled'));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** A failed decodeAudioData is a damaged file, unless it ran out of memory. */
function fromDecoderError(e: unknown): ImportError {
  if (e instanceof ImportError) return e;
  const name = e instanceof Error ? e.name : '';
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof RangeError || name === 'QuotaExceededError' || /alloc|memory/i.test(message)) return new ImportError('too-large', message);
  return new ImportError('decode-failed', message || name);
}

function checkLength(frames: number, sampleRate: number): number {
  const duration = frames / sampleRate;
  if (frames === 0 || duration < MIN_DURATION_SECONDS) throw new ImportError('empty-audio');
  if (duration > MAX_DURATION_SECONDS) throw new ImportError('too-long', `${Math.round(duration)} s`);
  return duration;
}

/**
 * Decodes the bytes of a file (the array is left untouched). Rejects with an
 * `ImportError`: `too-large`, `too-long` (checked on the header before
 * decoding when the format says its length, and again on the result),
 * `decode-failed`, `empty-audio` or `cancelled`.
 */
export async function decodeAudioBytes(bytes: ArrayBuffer, options: DecodeOptions = {}): Promise<DecodedAudio> {
  const { signal, onProgress, title } = options;
  throwIfAborted(signal);
  if (bytes.byteLength === 0) throw new ImportError('empty-audio');
  if (bytes.byteLength > MAX_FILE_BYTES) throw new ImportError('too-large', `${bytes.byteLength} bytes`);

  const view = new Uint8Array(bytes);
  const format = detectAudioFormat(view);
  const announced = probeDuration(view, format);
  if (announced !== null && announced > MAX_DURATION_SECONDS) throw new ImportError('too-long', `${Math.round(announced)} s`);

  onProgress?.({ phase: 'decoding', fraction: null, title });
  let decoded: DecodedAudio;
  try {
    if (format === 'aiff') {
      const pcm = decodeAiff(view);
      onProgress?.({ phase: 'decoding', fraction: 0, title });
      const channels = await resampleChannels(pcm.channels, pcm.sampleRate, ENGINE_SAMPLE_RATE, {
        isAborted: () => signal?.aborted === true,
        onProgress: (fraction) => onProgress?.({ phase: 'decoding', fraction, title }),
      });
      if (!channels) throw new ImportError('cancelled');
      decoded = { channels, sampleRate: ENGINE_SAMPLE_RATE };
    } else {
      const decode = options.decodeWebAudio ?? decodeWithWebAudio;
      // decodeAudioData detaches the buffer it is given: hand it a copy.
      decoded = await raceAbort(decode(bytes.slice(0)), signal);
    }
  } catch (e) {
    throw e instanceof Error && e.name === 'AiffError' ? new ImportError('decode-failed', e.message) : fromDecoderError(e);
  }
  throwIfAborted(signal);

  if (decoded.sampleRate !== ENGINE_SAMPLE_RATE) {
    const channels = await resampleChannels(decoded.channels, decoded.sampleRate, ENGINE_SAMPLE_RATE, {
      isAborted: () => signal?.aborted === true,
    });
    if (!channels) throw new ImportError('cancelled');
    decoded = { channels, sampleRate: ENGINE_SAMPLE_RATE };
  }
  const channels = toStereoOrMono(decoded.channels);
  checkLength(channels[0]?.length ?? 0, ENGINE_SAMPLE_RATE);
  return { channels, sampleRate: ENGINE_SAMPLE_RATE };
}
