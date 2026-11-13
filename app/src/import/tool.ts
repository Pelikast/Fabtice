// The Mac app's link-import tool (yt-dlp): installing it, updating it, and
// asking at launch whether a newer version exists. Only calls the bridge; how
// yt-dlp is run is the Mac app's business.

import type { DesktopBridge, YtdlpProgress } from '../platform/desktopBridge';
import { ImportError, type ImportProgress } from './types';

/** 0…1 from a download event of the manager; null while the size is unknown. */
export function toolProgressFraction(p: YtdlpProgress): number | null {
  if (p.phase === 'done' || p.phase === 'verify') return 1;
  return p.total && p.total > 0 ? Math.min(1, p.received / p.total) : null;
}

/**
 * Downloads and verifies the tool through the bridge, reporting `phase`
 * progress. Rejects with `install-failed` (first install) or `update-failed`.
 */
export async function installTool(
  bridge: DesktopBridge,
  phase: 'installing' | 'updating',
  onProgress?: (progress: ImportProgress) => void,
): Promise<void> {
  const failure = phase === 'installing' ? 'install-failed' : 'update-failed';
  onProgress?.({ phase, fraction: null });
  const off = bridge.onYtdlpProgress((p) => onProgress?.({ phase, fraction: toolProgressFraction(p) }));
  try {
    const result = await bridge.ytdlpInstall();
    if (!result.ok) throw new ImportError(failure, result.error);
  } catch (e) {
    throw e instanceof ImportError ? e : new ImportError(failure, e instanceof Error ? e.message : String(e));
  } finally {
    off();
  }
}

/**
 * Launch check: true when a newer version of the installed tool exists. Any
 * trouble (offline, rate limit, skipped check) means « no », silently.
 */
export async function isToolUpdateAvailable(bridge: DesktopBridge): Promise<boolean> {
  try {
    const result = await bridge.ytdlpCheck();
    return 'updateAvailable' in result && result.updateAvailable === true && result.installed === true;
  } catch {
    return false;
  }
}
