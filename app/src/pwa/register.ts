// The web app's service worker (lot 4, `sw.js`): the app opens and plays a
// kept piece with no network, and installs as an app. Registered only where
// it belongs:
//   - never in the Mac app (its pages come from `fabtice://app`, from the disk);
//   - never on the development server (no `sw.js` there);
//   - on the test and demo addresses (`?debug`, `?demo`, `?moteur=factice`)
//     and on a page served from this machine, only when asked (`?horsligne`):
//     the browser checks must not depend on a copy kept by an earlier run.
// A new version installs in the background and takes over at the next launch
// (see `sw.js`); C16: the page then offers to reload on it at once
// (« Une nouvelle version de Fabtice est prête », `update/updates.ts`).

import { getDesktopBridge } from '../platform/desktopBridge';
import { adoptRegistration } from '../update/updates';

export function shouldRegister(location: Pick<Location, 'protocol' | 'hostname' | 'search'>, options: { production: boolean; desktop: boolean }): boolean {
  if (!options.production || options.desktop) return false;
  if (location.protocol !== 'https:' && location.protocol !== 'http:') return false;
  const params = new URLSearchParams(location.search);
  if (params.has('horsligne')) return true;
  const localPage = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const testAddress = params.has('debug') || params.has('demo') || params.get('moteur') === 'factice';
  return location.protocol === 'https:' && !localPage && !testAddress;
}

export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!shouldRegister(window.location, { production: import.meta.env.PROD, desktop: getDesktopBridge() !== null || window.location.protocol === 'fabtice:' })) return;
  const start = () =>
    void navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((reg) => adoptRegistration(reg, false))
      .catch(() => {});
  // After the page has settled: the first visit's downloads go to the piece first.
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
