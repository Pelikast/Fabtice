// The encoder worker of « Exporter le son »: mp3 (LAME) and flac (libFLAC),
// both compiled to WebAssembly, each loaded only when its first file is made.
// The page feeds it 16-bit blocks (`protocol.ts`); it converts one block at a
// time to Float32, encodes it and sends the encoded bytes back as they come.
// One worker per file: the page ends it when the file is done (or cancelled),
// which gives the WebAssembly memory back.

import { id3Title } from './id3';
import { frameBytes, mp3InfoFrame } from './mp3Info';
import { FLAC_LEVEL, MP3_BITRATE } from './settings';
import type { FromWorker, StartMessage, ToWorker } from './protocol';

const post = (m: FromWorker, transfer?: Transferable[]) => (self as unknown as Worker).postMessage(m, transfer ?? []);

interface Sink {
  /** Encodes one block (Float32 channels, as many as the file has). */
  block(channels: Float32Array[]): void;
  /** Ends the file; returns the bytes to write over a piece already sent, if any. */
  finish(): { part: number; bytes: Uint8Array<ArrayBuffer> } | null;
  free(): void;
}

/** Copies out of WebAssembly memory (the encoder reuses its output buffer) and sends. */
let piecesSent = 0;
function send(bytes: Uint8Array): void {
  if (bytes.length === 0) return;
  piecesSent++;
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  post({ type: 'out', bytes: copy }, [copy.buffer]);
}

async function openMp3(msg: StartMessage): Promise<Sink> {
  const { createEncoder } = await import('wasm-media-encoders');
  // The wasm file is the app's own: fetched from where the app is served, compiled here.
  const wasm = await WebAssembly.compileStreaming(fetch(msg.mp3WasmUrl));
  const encoder = await createEncoder('audio/mpeg', wasm);
  encoder.configure({ channels: msg.channels, sampleRate: msg.sampleRate, bitrate: MP3_BITRATE, outputSampleRate: msg.sampleRate as 48000 });
  send(id3Title(msg.title));
  // The Info frame comes before the audio and says how many frames there are: a blank frame goes first, filled in at the end.
  const size = frameBytes(MP3_BITRATE, msg.sampleRate);
  const infoPart = piecesSent;
  send(new Uint8Array(size));
  let audioBytes = 0;
  const audio = (bytes: Uint8Array) => {
    audioBytes += bytes.length;
    send(bytes);
  };
  return {
    block: (channels) => audio(encoder.encode(channels)),
    finish: () => {
      audio(encoder.finalize());
      const info = mp3InfoFrame({ kbps: MP3_BITRATE, sampleRate: msg.sampleRate, channels: msg.channels, audioFrames: audioBytes / size, samples: msg.frames });
      return { part: infoPart, bytes: info };
    },
    free: () => undefined,
  };
}

async function openFlac(msg: StartMessage): Promise<Sink> {
  const flac = (await import('@audio/encode-flac')).default;
  const encoder = await flac({
    sampleRate: msg.sampleRate,
    channels: msg.channels,
    bitDepth: 16,
    compression: FLAC_LEVEL,
    frames: msg.frames,
    stream: true,
    meta: msg.title ? { title: msg.title } : undefined,
  } as Parameters<typeof flac>[0]);
  return {
    block: (channels) => send(encoder.encode(channels)),
    finish: () => {
      send(encoder.flush());
      const head = encoder.head?.() ?? null;
      return head ? { part: 0, bytes: new Uint8Array(head) } : null;
    },
    free: () => encoder.free(),
  };
}

let sink: Sink | null = null;
let channelsOut = 2;
// Float32 scratch for one block (reused, so a long piece never grows it).
let scratchL: Float32Array | null = null;
let scratchR: Float32Array | null = null;

function toFloat(src: Int16Array, dst: Float32Array): Float32Array {
  const out = dst.subarray(0, src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i]! / 32768;
  return out;
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  try {
    if (msg.type === 'start') {
      channelsOut = msg.channels;
      sink = await (msg.format === 'mp3' ? openMp3(msg) : openFlac(msg));
      post({ type: 'ready' });
    } else if (msg.type === 'block') {
      if (!sink) throw new Error('block before start');
      scratchL ??= new Float32Array(msg.l.length);
      if (scratchL.length < msg.l.length) scratchL = new Float32Array(msg.l.length);
      const l = toFloat(msg.l, scratchL);
      let channels: Float32Array[];
      if (channelsOut === 1) channels = [l];
      else if (!msg.r) channels = [l, l];
      else {
        if (!scratchR || scratchR.length < msg.r.length) scratchR = new Float32Array(msg.r.length);
        channels = [l, toFloat(msg.r, scratchR)];
      }
      sink.block(channels);
      post({ type: 'ack', index: msg.index });
    } else if (msg.type === 'finish') {
      if (!sink) throw new Error('finish before start');
      const patch = sink.finish();
      sink.free();
      sink = null;
      post({ type: 'done', patch });
    }
  } catch (e) {
    post({ type: 'error', where: msg.type === 'start' ? 'load' : 'encode', message: e instanceof Error ? e.message : String(e) });
  }
};
