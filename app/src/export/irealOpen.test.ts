import { describe, expect, it } from 'vitest';
import { IREAL_URL_MAX_LENGTH } from './ireal';
import { IREAL_WATCH_MS, needsIRealNotice, openIRealLink, planIRealOpen, type IRealHost } from './irealOpen';

/** A host that does nothing by itself: the test says what the page does and when time passes. */
function fakeHost(visibility: 'visible' | 'hidden' = 'visible') {
  const state = {
    followed: [] as string[],
    visibility,
    hiddenListeners: new Set<() => void>(),
    timers: [] as { fn: () => void; ms: number }[],
  };
  const host: IRealHost = {
    follow: (url) => void state.followed.push(url),
    visibility: () => state.visibility,
    onHidden(listener) {
      state.hiddenListeners.add(listener);
      return () => state.hiddenListeners.delete(listener);
    },
    later(fn, ms) {
      state.timers.push({ fn, ms });
      return () => {};
    },
  };
  return {
    host,
    state,
    /** The page is hidden (an app took the link), then maybe shown again. */
    hide: () => {
      state.visibility = 'hidden';
      for (const l of [...state.hiddenListeners]) l();
    },
    show: () => {
      state.visibility = 'visible';
    },
    /** The watch is over. */
    elapse: () => state.timers.splice(0).forEach((t) => t.fn()),
  };
}

describe('planIRealOpen', () => {
  it('follows the link, unless it is longer than the longest the export hands out', () => {
    expect(planIRealOpen('irealb://abc')).toEqual({ kind: 'link' });
    expect(planIRealOpen(`irealb://${'x'.repeat(IREAL_URL_MAX_LENGTH - 9)}`)).toEqual({ kind: 'link' });
    expect(planIRealOpen(`irealb://${'x'.repeat(IREAL_URL_MAX_LENGTH - 8)}`)).toEqual({ kind: 'file' });
  });
});

describe('needsIRealNotice', () => {
  it('only when the page stayed visible all along', () => {
    expect(needsIRealNotice({ visibility: 'visible', wasHidden: false })).toBe(true);
    expect(needsIRealNotice({ visibility: 'hidden', wasHidden: true })).toBe(false);
    expect(needsIRealNotice({ visibility: 'hidden', wasHidden: false })).toBe(false);
    // The user came back from iReal Pro before the end of the watch: an app took the link.
    expect(needsIRealNotice({ visibility: 'visible', wasHidden: true })).toBe(false);
  });
});

describe('openIRealLink', () => {
  it('follows the link once, from the gesture, and waits before saying anything', () => {
    const f = fakeHost();
    let notices = 0;
    expect(openIRealLink('irealb://song', f.host, () => notices++)).toBe('followed');
    expect(f.state.followed).toEqual(['irealb://song']);
    expect(notices).toBe(0);
    expect(f.state.timers.map((t) => t.ms)).toEqual([IREAL_WATCH_MS]);
  });

  it('the page is still visible after the watch: the notice', () => {
    const f = fakeHost();
    let notices = 0;
    openIRealLink('irealb://song', f.host, () => notices++);
    f.elapse();
    expect(notices).toBe(1);
  });

  it('the page was hidden (an app took the link): no notice, even if it is visible again', () => {
    const f = fakeHost();
    let notices = 0;
    openIRealLink('irealb://song', f.host, () => notices++);
    f.hide();
    f.elapse();
    expect(notices).toBe(0);
    const g = fakeHost();
    openIRealLink('irealb://song', g.host, () => notices++);
    g.hide();
    g.show();
    g.elapse();
    expect(notices).toBe(0);
  });

  it('the page is hidden at the end of the watch: no notice', () => {
    const f = fakeHost();
    let notices = 0;
    openIRealLink('irealb://song', f.host, () => notices++);
    f.state.visibility = 'hidden';
    f.elapse();
    expect(notices).toBe(0);
  });

  it('stops listening once the watch is over', () => {
    const f = fakeHost();
    openIRealLink('irealb://song', f.host, () => {});
    expect(f.state.hiddenListeners.size).toBe(1);
    f.elapse();
    expect(f.state.hiddenListeners.size).toBe(0);
  });

  it('a link that is too long is not followed at all', () => {
    const f = fakeHost();
    let notices = 0;
    expect(openIRealLink(`irealb://${'x'.repeat(IREAL_URL_MAX_LENGTH)}`, f.host, () => notices++)).toBe('too-long');
    expect(f.state.followed).toEqual([]);
    expect(f.state.timers).toEqual([]);
    expect(notices).toBe(0);
  });
});
