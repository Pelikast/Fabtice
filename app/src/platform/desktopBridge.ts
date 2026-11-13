// Typed view of `window.fabtice`, the API the Mac app exposes to the page.
//
// It mirrors `desktop/src/preload.js` and the IPC handlers of
// `desktop/src/main.js` exactly as they are (implemented and tested there):
// do not redesign it here. If the Mac app's API changes, change these types
// with it. On the web, `window.fabtice` is absent and `getDesktopBridge()`
// returns null.

/** Releases a progress subscription. */
export type Unsubscribe = () => void;

// ---------------------------------------------------------------- system info

export interface DesktopSystemInfo {
  appVersion: string;
  /** Contents of build-info.json written by the GitHub build, or null. */
  build: Record<string, unknown> | null;
  packaged: boolean;
  versions: { electron: string; chrome: string; node: string; v8: string };
  platform: string;
  osVersion: string;
  osRelease: string;
  /** 'arm64' (Apple chip) or 'x64' (Intel, or Rosetta). */
  arch: string;
  cpuModel: string | null;
  cpuCount: number;
  memoryGb: number;
  /** True when an Intel build runs on an Apple chip through Rosetta 2. */
  rosetta: boolean | null;
  execPath: string;
  userData: string;
  jsRuntime: {
    name: string;
    path: string;
    env: Record<string, string>;
    probe: { ok: boolean; version: string | null; stderr: string | null; error: string | null; durationMs: number };
  };
}

// ---------------------------------------------------------------- yt-dlp management

/** One network attempt of the yt-dlp manager (kept for diagnostics). */
export type YtdlpAttempt = Record<string, unknown>;

export interface YtdlpStatus {
  source: 'managed' | 'override';
  sourceLabel?: string;
  path: string | null;
  installed: boolean;
  version?: string | null;
  tag?: string | null;
  sha256?: string | null;
  /** Managed binary only: its hash still matches the one recorded at install. */
  intact?: boolean;
  error?: string | null;
  attempts: YtdlpAttempt[];
}

export interface YtdlpLatest {
  tag: string | null;
  sha256: string;
  url: string;
  sumsUrl: string;
}

export type YtdlpCheck = (
  | { skipped: true; reason: string }
  | { skipped: false; latest: YtdlpLatest; installed: boolean; updateAvailable: boolean }
  | { skipped: false; installed: boolean; intact?: boolean; error: string }
  /** The check itself threw. */
  | { error: string }
) & { attempts: YtdlpAttempt[] };

export interface YtdlpMeta {
  version: string;
  tag: string | null;
  sha256: string;
  size: number;
  url: string;
  installedAt: string;
}

export type YtdlpInstallResult =
  | { ok: true; meta: YtdlpMeta; attempts: YtdlpAttempt[] }
  | { ok: false; error: string; attempts: YtdlpAttempt[] };

export interface YtdlpProgress {
  phase: 'download' | 'verify' | 'done';
  received: number;
  /** Null while the size is unknown. */
  total: number | null;
}

// ---------------------------------------------------------------- extraction

/** What yt-dlp said about the video (step 1 of the extraction). */
export interface ExtractMeta {
  id: string;
  title: string | null;
  channel: string | null;
  /** Seconds, or null if unknown (the import is then refused). */
  duration: number | null;
  liveStatus: string | null;
  isLive: boolean;
  formatId: string | null;
  ext: string | null;
  acodec: string | null;
  container: string | null;
  abr: number | null;
  asr: number | null;
  audioChannels: number | null;
  filesize: number | null;
  protocol: string | null;
}

/** Diagnostic report of an extraction (steps, stderr tails, file info). */
export interface ExtractReport {
  url: string;
  videoId: string;
  format: string;
  steps: Record<string, unknown>[];
  debugLines: string[];
  meta?: ExtractMeta;
  file?: { name: string; size: number; container: unknown };
  totalMs?: number;
  tempDeleted?: boolean;
}

export type ExtractResult =
  /** The audio file as downloaded (m4a in practice), to be decoded by the page. */
  | { ok: true; audio: Uint8Array; meta: ExtractMeta; report: ExtractReport }
  | {
      ok: false;
      /** French message, ready to show. */
      error: string;
      /** Refused on purpose (live stream, unknown duration, longer than 20 minutes). */
      refused?: boolean;
      /** yt-dlp must be installed first (`ytdlpInstall()`). */
      needsYtdlp?: boolean;
      meta?: ExtractMeta;
      report?: ExtractReport;
      audio?: null;
    };

export type ExtractProgress =
  | { phase: 'info' }
  /** `meta` comes with the first download event only. */
  | { phase: 'download'; percent: number; meta?: ExtractMeta };

// ---------------------------------------------------------------- the bridge

export interface DesktopBridge {
  /** Machine and app details for diagnostics (home folder replaced by « ~ »). */
  systemInfo(): Promise<DesktopSystemInfo | null>;
  /** Is yt-dlp installed, which version, is it intact. */
  ytdlpStatus(): Promise<YtdlpStatus>;
  /** Compares with the latest release; `force` re-asks instead of reusing the launch check. */
  ytdlpCheck(force?: boolean): Promise<YtdlpCheck>;
  /** Downloads, verifies (SHA-256) and installs yt-dlp; progress via `onYtdlpProgress`. */
  ytdlpInstall(): Promise<YtdlpInstallResult>;
  /** Extracts the audio of a YouTube link on the user's machine; progress via `onExtractProgress`. One at a time. */
  extract(link: string): Promise<ExtractResult>;
  /** Copies text to the clipboard. */
  copyText(text: string): Promise<true>;
  onYtdlpProgress(callback: (progress: YtdlpProgress) => void): Unsubscribe;
  onExtractProgress(callback: (progress: ExtractProgress) => void): Unsubscribe;
}

declare global {
  interface Window {
    /** Present only inside the Mac app. */
    fabtice?: DesktopBridge;
  }
}

const METHODS: (keyof DesktopBridge)[] = [
  'systemInfo',
  'ytdlpStatus',
  'ytdlpCheck',
  'ytdlpInstall',
  'extract',
  'copyText',
  'onYtdlpProgress',
  'onExtractProgress',
];

/** The Mac app's bridge, or null on the web (or if it lacks a method we rely on). */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.fabtice;
  if (!bridge || typeof bridge !== 'object') return null;
  return METHODS.every((m) => typeof bridge[m] === 'function') ? bridge : null;
}

/** True inside the Mac app: link import is available. */
export function isDesktop(): boolean {
  return getDesktopBridge() !== null;
}
