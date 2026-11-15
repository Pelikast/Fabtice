// When the app gives the audio output back to the system, besides the engine's
// own idle release (`WorkletEngine`, 45 s without playback):
//
//   - the Mac goes to sleep, or wakes up (Mac app: Electron's `powerMonitor`,
//     forwarded by the bridge, `desktop/src/power-events.js`): released, and
//     paused if it was playing. It does not start again by itself after a wake:
//     the user may not be in front of the Mac.
//   - the screen is locked while nothing plays: released.
//   - the audio devices change (headphones, AirPods, a display with speakers):
//     released, and paused if it was playing, as the Mac's own players do when
//     headphones are pulled out; the next play opens the new default output.
//   - the page is hidden (window minimised or hidden, another tab) while nothing
//     plays: released at once. Playing in the background goes on.
//   - the page is left (`pagehide`): released.
//
// Every event goes to the audio journal (`journal.ts`). The web app has no
// power events: `visibilitychange`, `pagehide` and `devicechange` cover it.

import type { AudioEngine } from './AudioEngine';
import { recordAudio, type ReleaseReason } from './journal';
import type { PowerEvent, Unsubscribe } from '../platform/desktopBridge';

type Target = {
  addEventListener(type: string, fn: (e: Event) => void): void;
  removeEventListener(type: string, fn: (e: Event) => void): void;
};

export interface DeviceLifecycleEnv {
  engine: Pick<AudioEngine, 'getState' | 'releaseDevice'>;
  /** `document` (visibility). */
  doc?: (Target & { visibilityState: DocumentVisibilityState }) | null;
  /** `window` (`pagehide`, `pageshow`). */
  win?: Target | null;
  /** `navigator.mediaDevices` (`devicechange`; `enumerateDevices` only to COUNT the outputs, labels never read). */
  devices?: (Target & { enumerateDevices?: () => Promise<{ kind: string }[]> }) | null;
  /** The Mac app's power events. */
  onPower?: ((cb: (e: PowerEvent) => void) => Unsubscribe) | null;
  /** The browser's name for the journal (never more than names and version numbers). */
  userAgent?: string;
  /** Device changes come in bursts: one release after this many ms of calm. */
  deviceDebounceMs?: number;
}

/** « Chrome/150.0.7400.0 Electron/43.8.9 (Macintosh) »: names and versions only. */
export function browserName(ua: string): string {
  const names = ua.match(/\b(Electron|Chrome|Firefox|Edg|Version|Safari)\/[\d.]+/g) ?? [];
  const where = ua.match(/\b(Macintosh|iPhone|iPad|Android|Windows|Linux)\b/)?.[1];
  return `${names.join(' ') || 'navigateur inconnu'}${where ? ` (${where})` : ''}`;
}

/** Starts watching; returns the function that stops. */
export function watchAudioDevice(env: DeviceLifecycleEnv): () => void {
  const { engine, doc, win, devices } = env;
  const offs: (() => void)[] = [];
  const listen = (target: Target | null | undefined, type: string, fn: (e: Event) => void) => {
    if (!target) return;
    target.addEventListener(type, fn);
    offs.push(() => target.removeEventListener(type, fn));
  };
  const idle = () => engine.getState() !== 'playing';
  const release = (reason: ReleaseReason) => engine.releaseDevice(reason);

  recordAudio('page-start', { browser: browserName(env.userAgent ?? '') });

  listen(doc, 'visibilitychange', () => {
    if (!doc) return;
    if (doc.visibilityState === 'hidden') {
      recordAudio('hidden');
      if (idle()) release('hidden');
    } else recordAudio('visible');
  });
  listen(win, 'pagehide', () => {
    recordAudio('pagehide');
    release('pagehide');
  });
  listen(win, 'pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) recordAudio('pageshow');
  });

  let deviceTimer: ReturnType<typeof setTimeout> | null = null;
  listen(devices, 'devicechange', () => {
    if (deviceTimer !== null) clearTimeout(deviceTimer);
    deviceTimer = setTimeout(() => {
      deviceTimer = null;
      void countOutputs(devices).then((outputs) => {
        recordAudio('device-change', { outputs });
        release('device');
      });
    }, env.deviceDebounceMs ?? 400);
  });
  offs.push(() => {
    if (deviceTimer !== null) clearTimeout(deviceTimer);
  });

  if (env.onPower) {
    try {
      offs.push(
        env.onPower((e) => {
          if (e.kind === 'suspend') release('sleep');
          else if (e.kind === 'resume') release('wake');
          else if (e.kind === 'lock-screen' && idle()) release('lock');
        }),
      );
    } catch {
      // an older Mac app: no power events
    }
  }

  return () => offs.splice(0).forEach((f) => f());
}

/** How many audio outputs the page can see (`?` when it cannot tell). Labels are never read. */
async function countOutputs(devices: DeviceLifecycleEnv['devices']): Promise<string | number> {
  try {
    if (!devices?.enumerateDevices) return '?';
    const list = await devices.enumerateDevices();
    return list.filter((d) => d.kind === 'audiooutput').length;
  } catch {
    return '?';
  }
}
