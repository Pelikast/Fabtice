// « Ouvrir dans iReal Pro » in the web app (phones and tablets, where iReal Pro lives). The Mac app hands the
// link to the system (`bridge.openInIRealPro`); a browser can only follow the link from the user's gesture, and
// cannot tell whether an app took it. So the page is watched for a moment: if an app took the link, the browser
// hides the page or the page loses its focus; if the page stayed visible all along, a calm notice says what
// probably happened and offers to save the file instead (`ui/irealNotice.ts`).
//
// The decisions are pure functions (tested in irealOpen.test.ts); `openIRealLink` is the browser part.

import { IREAL_URL_MAX_LENGTH } from './ireal';

/** How long the page is watched after the link was followed, in ms. */
export const IREAL_WATCH_MS = 1600;

export type IRealOpenPlan =
  /** Follow the link from the gesture. */
  | { kind: 'link' }
  /** The link is too long to be followed: the file is saved instead, and the notice says why. */
  | { kind: 'file' };

/** Follow the link, unless it is longer than the longest the export hands out. */
export function planIRealOpen(url: string): IRealOpenPlan {
  return url.length > IREAL_URL_MAX_LENGTH ? { kind: 'file' } : { kind: 'link' };
}

/**
 * Whether to show the notice once the watch is over: only when the page never left the screen (an app that
 * takes the link hides the page or takes its focus) and is still visible.
 */
export function needsIRealNotice(watch: { visibility: 'visible' | 'hidden' | 'prerender'; wasHidden: boolean }): boolean {
  return watch.visibility === 'visible' && !watch.wasHidden;
}

/** What the browser part reaches (replaced in the tests). */
export interface IRealHost {
  /** Follows `url` from the user's gesture. */
  follow(url: string): void;
  /** The page's visibility now. */
  visibility(): 'visible' | 'hidden' | 'prerender';
  /** Calls `listener` when the page is hidden or leaves (an app took the link); returns the stop function. */
  onHidden(listener: () => void): () => void;
  /** Calls `fn` after `ms`; returns the cancel function. */
  later(fn: () => void, ms: number): () => void;
}

/** The browser as the host: a hidden link clicked (never a blank tab, never a navigation of the page itself). */
export function browserHost(): IRealHost {
  return {
    follow(url) {
      const a = document.createElement('a');
      a.href = url;
      a.hidden = true;
      a.dataset.export = 'ireal-open';
      document.body.append(a);
      a.click();
      a.remove();
    },
    visibility: () => (document.visibilityState as 'visible' | 'hidden' | 'prerender') ?? 'visible',
    onHidden(listener) {
      const onChange = () => {
        if (document.visibilityState !== 'visible') listener();
      };
      document.addEventListener('visibilitychange', onChange);
      window.addEventListener('pagehide', listener);
      window.addEventListener('blur', listener);
      return () => {
        document.removeEventListener('visibilitychange', onChange);
        window.removeEventListener('pagehide', listener);
        window.removeEventListener('blur', listener);
      };
    },
    later: (fn, ms) => {
      const id = window.setTimeout(fn, ms);
      return () => window.clearTimeout(id);
    },
  };
}

export type IRealOpenResult = 'followed' | 'too-long';

/**
 * Follows the link from the user's gesture and watches what the page does. `onNotice` is called, once, when the
 * page is still there after the watch. Returns `too-long` (nothing followed) when the link is too long.
 */
export function openIRealLink(url: string, host: IRealHost, onNotice: () => void): IRealOpenResult {
  if (planIRealOpen(url).kind === 'file') return 'too-long';
  let wasHidden = false;
  const stop = host.onHidden(() => {
    wasHidden = true;
  });
  host.follow(url);
  host.later(() => {
    stop();
    if (needsIRealNotice({ visibility: host.visibility(), wasHidden })) onNotice();
  }, IREAL_WATCH_MS);
  return 'followed';
}
