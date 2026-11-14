// Makes the files of an export plan: render each track with the offline
// renderer (or reuse the applied render when it matches), mix, encode, pack.
//
// Memory: a mix is summed track by track into one Float32 accumulator of the
// output's length, each rendered track let go once added; a peak above full
// scale lowers the whole file evenly (never a clipped sample). A track
// exported on its own is encoded straight from its rendered 16-bit samples.

import { CHUNK, PcmWriter, readPcm, type PcmAudio } from '../../audio/pcm';
import type { OfflineRenderer } from '../../render/types';
import { getEncoder } from './encoders';
import { ExportError, type AudioEncoder, type ExportedFile, type ExportFileSpec, type ExportPlan } from './types';
import { zipStore } from './zip';

export interface ExportDeps {
  renderer: OfflineRenderer;
  /** The registered audio of a track (`audio/registry.ts#getAudio`). */
  audioOf: (audioId: string) => PcmAudio | undefined;
  /** The applied render of a track, when it matches the plan's key and tempo (`render/controller.ts#appliedAudioFor`). */
  appliedOf?: (trackId: string) => PcmAudio | null;
  /** Replaces the encoder registry (tests). */
  encoderFor?: (format: ExportPlan['format']) => AudioEncoder | null;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

const isIdentity = (p: ExportPlan) => p.semitones === 0 && p.cents === 0 && p.tempoRatio === 1;

/** A copy of a source range, 16-bit to 16-bit (no render needed at the original key and tempo). */
function sliceRange(audio: PcmAudio, start: number, end: number): PcmAudio {
  if (start === 0 && end === audio.frames) return audio;
  const w = new PcmWriter(end - start, audio.sampleRate, audio.channelCount);
  const l = new Float32Array(CHUNK);
  const r = new Float32Array(CHUNK);
  for (let s = start; s < end; s += CHUNK) {
    const n = Math.min(CHUNK, end - s);
    readPcm(audio, 0, s, l.subarray(0, n));
    readPcm(audio, 1, s, r.subarray(0, n));
    w.write(s - start, l.subarray(0, n), r.subarray(0, n));
  }
  return w.finish();
}

async function renderSource(plan: ExportPlan, audio: PcmAudio, trackId: string, deps: ExportDeps, onFraction: (f: number) => void): Promise<PcmAudio> {
  const sr = audio.sampleRate;
  const start = Math.max(0, Math.round(plan.range.start * sr));
  const end = Math.min(audio.frames, Math.round(plan.range.end * sr));
  if (end <= start) throw new ExportError('nothing', 'empty range');
  const whole = start === 0 && end === audio.frames;
  if (isIdentity(plan)) return sliceRange(audio, start, end);
  const applied = whole ? deps.appliedOf?.(trackId) : null;
  if (applied) return applied;
  try {
    return await deps.renderer.render({
      audio,
      semitones: plan.semitones,
      cents: plan.cents,
      tempoRatio: plan.tempoRatio,
      formants: plan.formants && deps.renderer.supportsFormants,
      range: plan.range,
      signal: deps.signal,
      onProgress: onFraction,
    });
  } catch (e) {
    if (deps.signal?.aborted) throw new ExportError('cancelled');
    throw new ExportError((e as { code?: string }).code === 'memory' ? 'memory' : 'failed', e instanceof Error ? e.message : String(e));
  }
}

/** The audio of one file: its sources rendered and mixed at their gains. */
async function fileAudio(plan: ExportPlan, file: ExportFileSpec, deps: ExportDeps, onFraction: (f: number) => void): Promise<PcmAudio> {
  const n = file.sources.length;
  const first = file.sources[0]!;
  if (n === 1 && first.gain === 1) {
    const audio = deps.audioOf(first.audioId);
    if (!audio) throw new ExportError('failed', `no audio ${first.audioId}`);
    return renderSource(plan, audio, first.trackId, deps, onFraction);
  }
  let accL: Float32Array | null = null;
  let accR: Float32Array | null = null;
  let stereo = false;
  let sampleRate = 48000;
  for (let i = 0; i < n; i++) {
    const src = file.sources[i]!;
    const audio = deps.audioOf(src.audioId);
    if (!audio) throw new ExportError('failed', `no audio ${src.audioId}`);
    if (src.gain === 0) continue;
    const r = await renderSource(plan, audio, src.trackId, deps, (f) => onFraction((i + f) / n));
    sampleRate = r.sampleRate;
    accL ??= new Float32Array(r.frames);
    accR ??= new Float32Array(r.frames);
    if (!r.mono) stereo = true;
    const tmp = new Float32Array(CHUNK);
    const frames = Math.min(r.frames, accL.length);
    for (let s = 0; s < frames; s += CHUNK) {
      const m = Math.min(CHUNK, frames - s);
      const view = tmp.subarray(0, m);
      readPcm(r, 0, s, view);
      for (let k = 0; k < m; k++) accL[s + k] = accL[s + k]! + view[k]! * src.gain;
      readPcm(r, 1, s, view);
      for (let k = 0; k < m; k++) accR[s + k] = accR[s + k]! + view[k]! * src.gain;
    }
    if (deps.signal?.aborted) throw new ExportError('cancelled');
    onFraction((i + 1) / n);
  }
  if (!accL || !accR) throw new ExportError('nothing', 'every source is silent');
  let peak = 0;
  for (let k = 0; k < accL.length; k++) {
    const a = Math.abs(accL[k]!);
    const b = Math.abs(accR[k]!);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
  }
  const scale = peak > 0.999 ? 0.999 / peak : 1;
  const w = new PcmWriter(accL.length, sampleRate, stereo ? 2 : 1);
  if (scale !== 1) {
    for (let k = 0; k < accL.length; k++) {
      accL[k] = accL[k]! * scale;
      accR[k] = accR[k]! * scale;
    }
  }
  w.write(0, accL, stereo ? accR : undefined);
  return w.finish();
}

/** Renders, encodes and packs; resolves with the one file to hand to the user. */
export async function runAudioExport(plan: ExportPlan, deps: ExportDeps): Promise<ExportedFile> {
  const encoder = (deps.encoderFor ?? getEncoder)(plan.format);
  if (!encoder) throw new ExportError('encoder-missing', plan.format);
  const total = plan.files.length;
  const report = (f: number) => deps.onProgress?.(Math.min(1, Math.max(0, f)));
  const out: { name: string; blob: Blob }[] = [];
  for (let i = 0; i < total; i++) {
    if (deps.signal?.aborted) throw new ExportError('cancelled');
    const file = plan.files[i]!;
    const audio = await fileAudio(plan, file, deps, (f) => report((i + 0.85 * f) / total));
    const blob = await encoder.encode(audio, { signal: deps.signal, onProgress: (f) => report((i + 0.85 + 0.15 * f) / total) });
    out.push({ name: file.name, blob });
  }
  if (plan.archiveName) {
    const blob = await zipStore(out.map((o) => ({ name: o.name, data: o.blob })));
    report(1);
    return { blob, name: plan.archiveName };
  }
  report(1);
  return out[0]!;
}
