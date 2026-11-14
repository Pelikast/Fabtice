// Messages between the export and the encoder worker (`encode.worker.ts`).
//
// The page sends the 16-bit blocks of the audio one after the other (never a
// whole-track copy), the worker converts each to Float32 on its own, feeds the
// encoder and sends back the encoded pieces as they come. At most `WINDOW`
// blocks are in flight: the page waits for the acknowledgement of an older one
// before sending the next, so the worker never holds more than a few blocks.

export type EncoderFormat = 'mp3' | 'flac';

/** Blocks sent and not yet acknowledged, at most. */
export const WINDOW = 3;

export interface StartMessage {
  type: 'start';
  format: EncoderFormat;
  sampleRate: number;
  /** Channels of the file made (1 or 2). */
  channels: 1 | 2;
  /** Frames to encode (FLAC writes the length in its header from the start). */
  frames: number;
  /** Title of the piece for the file's tag, when there is one. */
  title: string;
  /** Where the wasm file of the mp3 encoder is served (the app's own, never the network). */
  mp3WasmUrl: string;
}

export interface BlockMessage {
  type: 'block';
  index: number;
  /** Left (or only) channel: 16-bit samples, one block of them. */
  l: Int16Array;
  /** Right channel; null when both channels are the same (or the file is mono). */
  r: Int16Array | null;
}

export interface FinishMessage {
  type: 'finish';
}

export type ToWorker = StartMessage | BlockMessage | FinishMessage;

export type FromWorker =
  | { type: 'ready' }
  | { type: 'ack'; index: number }
  /** Encoded bytes, in order. */
  | { type: 'out'; bytes: Uint8Array<ArrayBuffer> }
  /**
   * The end. `patch`: bytes known only now (FLAC: totals and checksum in the
   * header; mp3: the Info frame) that replace the first bytes of the `part`-th
   * piece sent as `out`.
   */
  | { type: 'done'; patch: { part: number; bytes: Uint8Array<ArrayBuffer> } | null }
  /** `load`: the encoder could not be started (wasm missing, refused); `encode`: it failed on the audio. */
  | { type: 'error'; where: 'load' | 'encode'; message: string };
