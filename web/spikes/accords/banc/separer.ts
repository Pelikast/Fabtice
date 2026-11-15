// Real separation of the corpus mixes with the app's tool HTDemucs 6 sources
// (`htdemucs-6s` in app/src/separation/models.json: same file, same SHA-256,
// same configuration), so that « chords on the separated instruments » can be
// measured with what the app really gives, not only with the ideal stems.
//
// Everything is the app's code (app/src/separation/engine/: reading at 48 kHz,
// resampling to 44.1 kHz, normalisation, segments, STFT framing, overlap-add,
// back to 48 kHz) except the network itself, which runs in a Python
// ONNX Runtime process on the processor (banc/separer_ort.py): the WebAssembly
// build would take hours here.
//
//   node dist/separer.mjs [--tool htdemucs-6s|bs-roformer-sw] [--only id1,id2] [--conditions propre,disque] [--threads 4]
//
// Output: data/separes/<tool>/<piece>/<condition>/<stem>.flac (16 bits,
// as the app keeps its tracks), plus timing.json. Existing files are kept.

import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import modelsJson from '../../../../app/src/separation/models.json';
import { separatePiece, type SegmentModel } from '../../../../app/src/separation/engine/pipeline';
import { parseConfig } from '../../../../app/src/separation/engine/plan';
import { makeRunner, type NetworkOutputs, type Prepared } from '../../../../app/src/separation/engine/runners';
import { decodeAudio } from './networks';
import { DATA, ROOT } from './paths';
import { loadCorpus } from './truth';



function args(): Record<string, string> {
  const out: Record<string, string> = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i]!.replace(/^--/, '');
    out[k] = a[i + 1] && !a[i + 1]!.startsWith('--') ? a[++i]! : 'true';
  }
  return out;
}

/** The network in a Python process: one request at a time. */
class PyNet {
  private p: ChildProcessWithoutNullStreams;
  private buf = Buffer.alloc(0);
  private waiting: ((b: Buffer) => void) | null = null;
  private need = 0;

  constructor(model: string, threads: number) {
    this.p = spawn('python3', ['-I', join(ROOT, 'banc', 'separer_ort.py'), model, String(threads)], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.p.stderr.on('data', (d) => process.stderr.write(d));
    this.p.stdout.on('data', (d: Buffer) => {
      this.buf = Buffer.concat([this.buf, d]);
      this.pump();
    });
  }

  private pump(): void {
    if (this.waiting && this.buf.length >= this.need) {
      const out = this.buf.subarray(0, this.need);
      this.buf = this.buf.subarray(this.need);
      const w = this.waiting;
      this.waiting = null;
      w(Buffer.from(out));
    }
  }

  private read(n: number): Promise<Buffer> {
    return new Promise((resolve) => {
      this.need = n;
      this.waiting = resolve;
      this.pump();
    });
  }

  async run(feeds: Record<string, { data: Float32Array; dims: readonly number[] }>): Promise<NetworkOutputs> {
    const names = Object.keys(feeds);
    const head = Buffer.from(JSON.stringify({ inputs: names.map((n) => [n, feeds[n]!.dims]) }));
    const len = Buffer.alloc(4);
    len.writeUInt32LE(head.length);
    this.p.stdin.write(len);
    this.p.stdin.write(head);
    for (const n of names) {
      const d = feeds[n]!.data;
      this.p.stdin.write(Buffer.from(d.buffer, d.byteOffset, d.byteLength));
    }
    const hl = (await this.read(4)).readUInt32LE(0);
    const meta = JSON.parse((await this.read(hl)).toString()) as { outputs: [string, number[]][] };
    const out: NetworkOutputs = {};
    for (const [name, dims] of meta.outputs) {
      const count = dims.reduce((a, b) => a * b, 1);
      const b = await this.read(4 * count);
      out[name] = { data: new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) };
    }
    return out;
  }

  close(): void {
    this.p.stdin.end();
  }
}

function writeFlac(file: string, channels: Float32Array[], sampleRate: number): void {
  const n = channels[0]!.length;
  const C = channels.length;
  const inter = new Float32Array(n * C);
  for (let i = 0; i < n; i++) for (let c = 0; c < C; c++) inter[i * C + c] = channels[c]![i]!;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(sampleRate), '-ac', String(C), '-i', 'pipe:0', '-sample_fmt', 's16', `${file}.part.flac`], {
    input: Buffer.from(inter.buffer),
    maxBuffer: 2 ** 31,
  });
  renameSync(`${file}.part.flac`, file);
}

const opt = args();
/** The app's tool: `htdemucs-6s` (default) or `bs-roformer-sw` (what an Apple-chip Mac uses). */
const TOOL = opt.tool ?? 'htdemucs-6s';
const only = opt.only ? new Set(opt.only.split(',')) : null;
const conditions = (opt.conditions ?? 'disque,propre').split(',');
const threads = Number(opt.threads ?? 4);
const entry = modelsJson.models.find((m) => m.id === TOOL)!;
const cfg = parseConfig(entry.config as unknown as Record<string, unknown>);
const modelFile = join(DATA, 'modeles', entry.file.url.split('/').pop()!);
if (!existsSync(modelFile)) {
  execFileSync('curl', ['-sSfL', '--retry', '3', '-o', `${modelFile}.part`, entry.file.url], { stdio: ['ignore', 'ignore', 'inherit'] });
  renameSync(`${modelFile}.part`, modelFile);
}
if (createHash('sha256').update(readFileSync(modelFile)).digest('hex') !== entry.file.sha256) throw new Error('SHA-256 of the separation model does not match');

const net = new PyNet(modelFile, threads);
const runner = makeRunner(cfg, entry.stems.length, (data, dims) => ({ data, dims }));
const order = (opt.only ? opt.only.split(',') : null);
const corpus = loadCorpus()
  .filter((t) => t.source === 'synthese' && (!only || only.has(t.id)))
  .sort((a, b) => (order ? order.indexOf(a.id) - order.indexOf(b.id) : 0));

for (const cond of conditions) {
  for (const t of corpus) {
    const c = t.conditions[cond];
    if (!c) continue;
    const dir = join(DATA, 'separes', TOOL, t.id, cond);
    if (entry.stems.every((s) => existsSync(join(dir, `${s}.flac`)))) continue;
    mkdirSync(dir, { recursive: true });
    const started = Date.now();
    const { channels, sampleRate } = decodeAudio(join(t.dir, c.mix));
    const [l, r] = channels as [Float32Array, Float32Array];
    let stereo = false;
    for (let i = 0; i < l.length && !stereo; i++) if (Math.abs(l[i]! - r[i]!) > 1e-6) stereo = true;
    const frames = l.length;
    const outCh = stereo ? 2 : 1;
    const parts = entry.stems.map(() => Array.from({ length: outCh }, () => new Float32Array(frames)));
    const model: SegmentModel<Prepared, NetworkOutputs> = {
      prepare: (a, b) => runner.prepare(a, b),
      run: (p) => net.run(p.feeds as Record<string, { data: Float32Array; dims: number[] }>),
      finish: (p, out) => runner.finish(p, out),
    };
    await separatePiece({
      cfg,
      stems: entry.stems.length,
      model,
      input: { frames, sampleRate, stereo, read: (ch, start, out) => {
        const src = ch === 0 ? l : r;
        for (let i = 0; i < out.length; i++) out[i] = src[start + i] ?? 0;
      } },
      monoOut: !stereo,
      emit: (offset, ps) => {
        ps.forEach((chs, s) => chs.forEach((a, k) => parts[s]![k]!.set(a.subarray(0, Math.max(0, frames - offset)), offset)));
      },
    });
    entry.stems.forEach((s, k) => writeFlac(join(dir, `${s}.flac`), parts[k]!, sampleRate));
    const seconds = (Date.now() - started) / 1000;
    writeFileSync(join(dir, 'timing.json'), JSON.stringify({ tool: TOOL, seconds, duration: frames / sampleRate, stereo }));
    process.stderr.write(`${t.id} ${cond}: ${seconds.toFixed(0)} s pour ${(frames / sampleRate).toFixed(0)} s (${(seconds / (frames / sampleRate)).toFixed(2)} fois la durée)\n`);
  }
}
net.close();
