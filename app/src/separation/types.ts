// Contract of the separator: what the app calls to split a piece into
// instruments. The real one (ONNX Runtime Web, WebGPU then WebAssembly, the
// three tools of the prototype `web/spikes/separation/`) is the separation
// agent's work; until then `MockSeparator` (./mock.ts) stands in. The app only
// goes through `getSeparator()` (./index.ts) and `separation/runner.ts`.
//
// Units: audio is the app's in-memory form (`audio/pcm.ts#PcmAudio`, 16-bit,
// 48 kHz). The separator reads it (`readPcm`, a range at a time, or a
// transient copy) and MUST NOT keep it; it hands back each instrument as a
// `PcmAudio` of exactly the same length (`PcmWriter` builds one slice by
// slice). Resampling to the tool's rate (44.1 kHz for the three tools of the
// prototype) and back is the separator's business.

import type { PcmAudio } from '../audio/pcm';
import type { SeparationBackend, StemId } from '../model/separation';
import type { SeparationReport } from './report';

// ---------------------------------------------------------------- the list of tools

/**
 * One tool of the list (`models.json`, fetched at launch, the bundled copy as
 * fallback; validated by `separation/models.ts#validateModelList`). Every
 * address is pinned (a Hugging Face revision) and every file has a SHA-256:
 * the app never runs weights it has not checked. The app never redistributes
 * weights: they are downloaded from their public location, at the user's
 * request, after the source, size and known licence were shown.
 */
export interface SeparationModelSpec {
  /** Stable id (`bs-roformer-sw`, `htdemucs-6s`, `scnet`…). Kept in `SeparationSummary.modelId`. */
  id: string;
  /** Name as its authors give it (« BS-RoFormer SW »). */
  name: string;
  /** French label for the user (« Le plus fin », « Équilibré », « Léger »). */
  label: string;
  /** One French sentence: what it is good for, on what kind of device. */
  summary: string;
  /**
   * `main`: splits the whole piece. `detail`: splits one separated part
   * further (`input`), e.g. a drum kit into its pieces.
   */
  kind: 'main' | 'detail';
  /** For `detail` tools: the part they take as input. */
  input?: StemId;
  /** What it gives, in the order of its outputs. */
  stems: StemId[];
  /** Quality rank among tools of the same kind: higher is better (the automatic choice prefers it). */
  quality: number;
  /** The weights: one file. */
  file: {
    /** https URL at a pinned revision (`https://huggingface.co/<repo>/resolve/<40 hex>/<file>`). */
    url: string;
    /** Host shown to the user (« Hugging Face »). */
    host: string;
    bytes: number;
    sha256: string;
  };
  /** Where the weights come from, for the user (repository page). */
  sourcePage: string;
  /** Licence as known, in French (« MIT », « poids sans licence connue »…), shown before the first download. */
  licence: string;
  /** True when the weights' licence is unclear or non-commercial: the screen says so plainly. */
  licenceUnclear: boolean;
  /**
   * Speed, as a multiple of the piece's duration, measured or estimated:
   * `gpu` on a capable graphics path, `cpu` on the processor. `measured` says
   * which numbers are real (CLAUDE.md, « Mesures de la phase 0 »).
   */
  speed: { gpu: number | null; cpu: number; measured: boolean; device: string };
  /** Memory needed while separating, bytes (rough): the automatic choice avoids tools a device cannot hold. */
  memoryBytes: number;
  /** Settings for the real separator (segment, overlap, STFT…), opaque to the app. */
  config: Record<string, unknown>;
}

/** The document of the list (`models.json`). `version` 1 only. */
export interface SeparationModelList {
  version: 1;
  /** ISO date of the last edit, shown in diagnostics. */
  updated: string;
  models: SeparationModelSpec[];
}

/** Where the list in use came from. */
export type ModelListSource = 'remote' | 'bundled';

// ---------------------------------------------------------------- the device

/** What the automatic choice knows of the device (probed once, `separation/device.ts#probeDevice`). */
export interface DeviceProfile {
  /** Phone or tablet (touch first, little memory, the page may be killed under pressure). */
  phone: boolean;
  /** Graphics path for computing: `none` (no WebGPU), `fallback` (a software adapter), `apple`, `other` (a real GPU of another maker). */
  gpu: 'none' | 'fallback' | 'apple' | 'other';
  /** The browser engine: Safari's graphics path failed in phase 0 on the owner's Mac (device lost). */
  browser: 'safari' | 'chromium' | 'firefox' | 'other';
  /** Memory the browser reports (`navigator.deviceMemory`, capped at 8 by Chromium), GB; null when unknown (Safari). */
  memoryGB: number | null;
  /** Logical cores. */
  cores: number;
  /** Running in the Mac app (Chromium of Electron). */
  desktopApp: boolean;
}

/** The automatic choice for this device: a tool, where to run it, and why (shown in the advanced settings). */
export interface ModelChoice {
  model: SeparationModelSpec;
  backend: SeparationBackend;
  /** Short French reason (« carte graphique Apple », « téléphone »…). */
  reason: string;
}

// ---------------------------------------------------------------- a run

export type SeparationStep =
  /** Downloading the tool (first use only), see `SeparationProgress.download`. */
  | 'download'
  /** Loading the tool, preparing the audio. */
  | 'prepare'
  /** Computing, slice after slice. */
  | 'separate'
  /** Last slice done: writing the tracks, keeping them on the device. */
  | 'finish';

export interface SeparationProgress {
  step: SeparationStep;
  /** Of the whole run, 0…1, never going back. */
  fraction: number;
  /** Honest remaining time, seconds, from the speed measured so far in this run; null until it can be said. */
  remainingSeconds: number | null;
  /** Present during `download`: bytes received and the total. */
  download?: { loaded: number; total: number };
  /** Where it is computing now (null before it knows). */
  backend: SeparationBackend | null;
  /** True once the graphics path failed and the processor took over the SAME tool. */
  fellBack: boolean;
}

export interface SeparationRequest {
  /** The whole piece, from the registry (do not modify, do not keep). */
  audio: PcmAudio;
  model: SeparationModelSpec;
  /** `auto`: graphics path if it works, processor otherwise (same tool). `cpu`: processor only. */
  backend: 'auto' | 'cpu';
  /** Called often (at least every second or two while working). Never throws into the separator. */
  onProgress: (p: SeparationProgress) => void;
  /** Optional: each instrument as soon as it is complete (a separator may give them only at the end). */
  onTrack?: (track: SeparatedTrack) => void;
  /** Cancels: `separate()` rejects quickly with `SeparationError('cancelled')` and frees its memory. */
  signal: AbortSignal;
}

export interface SeparatedTrack {
  stem: StemId;
  /** Same length and rate as the input. */
  audio: PcmAudio;
}

export interface SeparationOutput {
  /** One per stem of the tool, in the tool's order. */
  tracks: SeparatedTrack[];
  backend: SeparationBackend;
  fellBack: boolean;
  /** Wall-clock seconds of the computation (download excluded). */
  computeSeconds: number;
  /** The measurement report of a real separation (`separation/report.ts`); the stand-in gives none. */
  report?: SeparationReport;
}

export type SeparationErrorCode =
  /** The request was aborted. */
  | 'cancelled'
  /** The tool could not be downloaded (network, integrity check). */
  | 'download-failed'
  /** This browser cannot run any separation (no WebAssembly, no worker…). */
  | 'unsupported'
  /** The device ran out of memory (when the browser says so; a page killed by the system cannot be told). */
  | 'memory'
  /** The tool was withdrawn from the list or is unknown. */
  | 'unknown-model'
  /** Anything else. */
  | 'failed';

export class SeparationError extends Error {
  constructor(
    readonly code: SeparationErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'SeparationError';
  }
}

/** What is downloaded and kept on the device for the tools (shown with « Libérer la place »). */
export interface ToolsUsage {
  /** Tools fully on the device, by id, with their size. */
  cached: { id: string; bytes: number }[];
  bytes: number;
}

export interface Separator {
  /** `mock` or `onnx`, for diagnostics. */
  readonly kind: string;
  /**
   * Separates the piece with `request.model`. Downloads the tool first if
   * needed (resumable, SHA-256 checked: reuse `analysis/models/download.ts`
   * with its own store, `openModelStore(SEPARATION_TOOLS_DB)`). Resolves with
   * every stem of the tool, or rejects with a `SeparationError`.
   *
   * Graphics path first when `backend` is `auto`; if it fails (device lost,
   * unsupported operator, wrong output), continue on the processor WITH THE
   * SAME TOOL, report `fellBack: true` in the progress at once (the screen
   * shows a calm notice that it will take longer), and never switch tool by
   * itself.
   */
  separate(request: SeparationRequest): Promise<SeparationOutput>;
  /** True when the tool's weights are already on the device (no download needed). */
  isCached(model: SeparationModelSpec): Promise<boolean>;
  /** What the tools take on the device. */
  toolsUsage(): Promise<ToolsUsage>;
  /** Deletes every downloaded tool (they will be downloaded again when needed). */
  forgetTools(): Promise<void>;
}
