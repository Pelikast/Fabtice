// Mac app: `.fab` files opened from the Finder (double-click, « Ouvrir
// avec »). The page asks for those that came before it was ready, then is
// told of the next ones; each is read by ranges through the bridge.

import { startProjectOpen } from '../import/controller';
import { getDesktopBridge, type DesktopBridge, type OpenedProjectFile } from '../platform/desktopBridge';
import { openNewPiece } from '../store/actions';
import type { ByteSource } from './zip';

/** A file the Mac app holds, read by ranges (at most 16 MB per call). */
export function bridgeSource(bridge: DesktopBridge, file: OpenedProjectFile): ByteSource {
  return {
    size: file.size,
    read: async (offset, length) => {
      const out = new Uint8Array(length);
      let at = 0;
      while (at < length) {
        const n = Math.min(16 * 1024 * 1024, length - at);
        const part = await bridge.readProjectFile!(file.token, offset + at, n);
        out.set(part, at);
        at += part.length;
        if (part.length < n) return out.subarray(0, at);
      }
      return out;
    },
  };
}

async function open(bridge: DesktopBridge, file: OpenedProjectFile): Promise<void> {
  openNewPiece();
  try {
    await startProjectOpen(bridgeSource(bridge, file), file.name);
  } finally {
    void bridge.releaseProjectFile?.(file.token).catch(() => {});
  }
}

/**
 * To call once the kept piece has been reopened (or not): opens the files
 * waiting, one after the other, then listens for the next ones. Does nothing
 * on the web or with a Mac app that predates it.
 */
export async function followOpenedProjects(bridge: DesktopBridge | null = getDesktopBridge()): Promise<void> {
  if (!bridge?.pendingProjects || !bridge.readProjectFile) return;
  let chain = Promise.resolve();
  const queue = (file: OpenedProjectFile) => {
    chain = chain.then(() => open(bridge, file)).catch(() => {});
  };
  bridge.onOpenProject?.(queue);
  try {
    for (const file of await bridge.pendingProjects()) queue(file);
  } catch {
    // an older Mac app, or nothing to open
  }
  await chain;
}
