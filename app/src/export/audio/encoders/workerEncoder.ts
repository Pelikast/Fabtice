// An `AudioEncoder` that runs in the encoder worker (`encode.worker.ts`): the
// worker, and with it the encoder's WebAssembly, exists only while one file is
// being made, and is created by the first export in that format. The 16-bit
// blocks of the audio go over one at a time (`protocol.ts`), the encoded
// bytes come back as pieces of a `Blob` (the browser may keep them on disk).

import { CHUNK, type PcmAudio } from '../../../audio/pcm';
import type { AudioFormat } from '../../../model/audioExport';
import { ExportError, type AudioEncoder } from '../types';
import { WINDOW, type EncoderFormat, type FromWorker, type ToWorker } from './protocol';

interface Spec {
  format: EncoderFormat & AudioFormat;
  extension: string;
  mimeType: string;
}

/** What a worker must do: a seam for tests (a fake worker) and the real one. */
export type WorkerFactory = () => Worker;

const realWorker: WorkerFactory = () => new Worker(new URL('./encode.worker.ts', import.meta.url), { type: 'module', name: 'fabtice-encode' });

export function createWorkerEncoder(spec: Spec, makeWorker: WorkerFactory = realWorker): AudioEncoder {
  return {
    format: spec.format,
    extension: spec.extension,
    mimeType: spec.mimeType,
    encode(audio, { onProgress, signal, title } = {}) {
      return encodeInWorker(spec, audio, { onProgress, signal, title: title ?? '' }, makeWorker);
    },
  };
}

function encodeInWorker(
  spec: Spec,
  audio: PcmAudio,
  { onProgress, signal, title }: { onProgress?: (f: number) => void; signal?: AbortSignal; title: string },
  makeWorker: WorkerFactory,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    if (signal?.aborted) return reject(new ExportError('cancelled'));
    let worker: Worker;
    try {
      worker = makeWorker();
    } catch (e) {
      return reject(new ExportError('encoder-missing', e instanceof Error ? e.message : String(e)));
    }
    const parts: Uint8Array<ArrayBuffer>[] = [];
    const total = Math.max(1, audio.chunks.length);
    let started = false;
    let sent = 0;
    let acked = 0;
    let finished = false;
    let settled = false;

    const end = (action: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      worker.terminate(); // gives the encoder's memory back, whatever happened
      action();
    };
    const fail = (code: 'encoder-missing' | 'failed', detail: string) => end(() => reject(new ExportError(code, detail)));
    const onAbort = () => end(() => reject(new ExportError('cancelled')));
    signal?.addEventListener('abort', onAbort);

    const post = (m: ToWorker) => worker.postMessage(m);
    const channels = audio.channelCount;

    /** Sends blocks while the window allows; the end once all are acknowledged. */
    const pump = () => {
      if (settled) return;
      while (sent < audio.chunks.length && sent - acked < WINDOW) {
        const c = sent++;
        const chunk = audio.chunks[c]!;
        const n = Math.min(CHUNK, audio.frames - c * CHUNK);
        // Shared memory is shared, not copied; plain memory is copied by the clone (the chunk is 64 KB).
        post({ type: 'block', index: c, l: chunk.l.subarray(0, n), r: channels === 2 && chunk.r ? chunk.r.subarray(0, n) : null });
      }
      if (sent === audio.chunks.length && acked === sent && !finished) {
        finished = true;
        post({ type: 'finish' });
      }
    };

    worker.onerror = (e) => {
      e.preventDefault?.();
      fail(started ? 'failed' : 'encoder-missing', e.message || 'worker error');
    };
    worker.onmessageerror = () => fail('failed', 'unreadable message');
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const m = event.data;
      if (m.type === 'ready') {
        started = true;
        pump();
      } else if (m.type === 'ack') {
        acked++;
        onProgress?.(Math.min(0.99, acked / total));
        pump();
      } else if (m.type === 'out') {
        parts.push(m.bytes);
      } else if (m.type === 'done') {
        // The bytes only known at the end (FLAC totals and checksum, mp3 Info frame) replace the provisional ones.
        const piece = m.patch ? parts[m.patch.part] : undefined;
        if (m.patch && piece) {
          const fixed = new Uint8Array(Math.max(piece.length, m.patch.bytes.length));
          fixed.set(piece);
          fixed.set(m.patch.bytes);
          parts[m.patch.part] = fixed;
        }
        onProgress?.(1);
        end(() => resolve(new Blob(parts, { type: spec.mimeType })));
      } else if (m.type === 'error') {
        fail(m.where === 'load' ? 'encoder-missing' : 'failed', m.message);
      }
    };

    void import('./assets').then(
      ({ mp3WasmUrl }) => {
        if (settled) return;
        post({
          type: 'start',
          format: spec.format,
          sampleRate: audio.sampleRate,
          channels,
          frames: audio.frames,
          title,
          mp3WasmUrl: new URL(mp3WasmUrl, import.meta.url).href,
        });
      },
      (e) => fail('encoder-missing', e instanceof Error ? e.message : String(e)),
    );
  });
}
