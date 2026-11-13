// A scriptable stand-in for `window.fabtice` (the Mac app), for unit tests.

import type {
  DesktopBridge,
  ExtractMeta,
  ExtractProgress,
  ExtractResult,
  YtdlpCheck,
  YtdlpInstallResult,
  YtdlpProgress,
  YtdlpStatus,
} from '../platform/desktopBridge';

export const META: ExtractMeta = {
  id: 'abc',
  title: 'Autumn Leaves',
  channel: 'Un guitariste',
  duration: 200,
  liveStatus: 'not_live',
  isLive: false,
  formatId: '140',
  ext: 'm4a',
  acodec: 'mp4a.40.2',
  container: 'm4a_dash',
  abr: 129,
  asr: 44100,
  audioChannels: 2,
  filesize: 3000,
  protocol: 'https',
};

export const okResult = (bytes = new Uint8Array([1, 2, 3, 4]), meta: Partial<ExtractMeta> = {}): ExtractResult => ({
  ok: true,
  audio: bytes,
  meta: { ...META, ...meta },
  report: { url: 'u', videoId: 'abc', format: '140', steps: [], debugLines: [] },
});

export interface FakeBridgeOptions {
  installed?: boolean;
  /** Answers of `extract`, in order (the last one repeats). */
  extractions?: (ExtractResult | (() => ExtractResult | Promise<ExtractResult>))[];
  install?: YtdlpInstallResult | (() => Promise<YtdlpInstallResult>);
  check?: YtdlpCheck;
  statusFails?: boolean;
  /** Events sent to the listeners during `extract` / `ytdlpInstall`. */
  extractEvents?: ExtractProgress[];
  installEvents?: YtdlpProgress[];
}

export interface FakeBridge extends DesktopBridge {
  calls: string[];
  extractedLinks: string[];
  installedNow: () => boolean;
  /** Listeners currently subscribed (a leak shows here). */
  listeners: () => number;
}

export function fakeBridge(options: FakeBridgeOptions = {}): FakeBridge {
  let installed = options.installed ?? true;
  const calls: string[] = [];
  const extractedLinks: string[] = [];
  const extractListeners = new Set<(p: ExtractProgress) => void>();
  const installListeners = new Set<(p: YtdlpProgress) => void>();
  let extractIndex = 0;
  const extractions = options.extractions ?? [okResult()];

  const bridge: FakeBridge = {
    calls,
    extractedLinks,
    installedNow: () => installed,
    listeners: () => extractListeners.size + installListeners.size,
    systemInfo: async () => null,
    async ytdlpStatus() {
      calls.push('status');
      if (options.statusFails) throw new Error('ipc failed');
      return { source: 'managed', path: installed ? '/x/yt-dlp' : null, installed, attempts: [] } satisfies YtdlpStatus;
    },
    async ytdlpCheck() {
      calls.push('check');
      return options.check ?? { skipped: true, reason: 'test', attempts: [] };
    },
    async ytdlpInstall() {
      calls.push('install');
      for (const e of options.installEvents ?? []) installListeners.forEach((l) => l(e));
      const result = typeof options.install === 'function' ? await options.install() : (options.install ?? { ok: true, meta: { version: '1', tag: '1', sha256: 'x', size: 1, url: 'u', installedAt: 'd' }, attempts: [] });
      if (result.ok) installed = true;
      return result;
    },
    async extract(link) {
      calls.push('extract');
      extractedLinks.push(link);
      for (const e of options.extractEvents ?? []) extractListeners.forEach((l) => l(e));
      const entry = extractions[Math.min(extractIndex++, extractions.length - 1)]!;
      return typeof entry === 'function' ? entry() : entry;
    },
    copyText: async () => true,
    onYtdlpProgress(cb) {
      installListeners.add(cb);
      return () => installListeners.delete(cb);
    },
    onExtractProgress(cb) {
      extractListeners.add(cb);
      return () => extractListeners.delete(cb);
    },
  };
  return bridge;
}
