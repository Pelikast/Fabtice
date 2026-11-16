'use strict';

// Closing the window or quitting the app with changes not saved (C5): the main
// process does not know whether the project changed, the page does. So it asks
// the page, and waits for its answer before letting the window go.
//
//   main -> page   `fabtice:confirm-close` { id }
//   page -> main   `fabtice:close-ack` (id)      the page heard, and is asking the user
//   page -> main   `fabtice:close-answer` (id, true | false)   true: go on, false: stay
//
// A page that cannot answer must not keep the window open for ever: no
// acknowledgement within `ackMs` (the page is hung, still loading, an older
// page that does not know the question), or a page that goes away while the
// user decides, and the window closes. After the acknowledgement the user may
// take as long as they like (the alert, a save in progress).

const crypto = require('node:crypto');

const ACK_MS = 2000;

/**
 * @param {{ ackMs?: number, setTimeout?: typeof setTimeout, clearTimeout?: typeof clearTimeout }} [options]
 */
function createCloseGuard(options = {}) {
  const ackMs = options.ackMs ?? ACK_MS;
  const later = options.setTimeout || setTimeout;
  const cancel = options.clearTimeout || clearTimeout;
  /** @type {{ id: string, acked: boolean, resolve: (ok: boolean) => void, timer: any, off: () => void } | null} */
  let asking = null;

  function finish(ok) {
    const a = asking;
    if (!a) return;
    asking = null;
    cancel(a.timer);
    a.off();
    a.resolve(ok);
  }

  /**
   * Asks the page whether the window may close. Resolves true (close) or false (stay). Only one question is
   * open at a time: asking again while one is open resolves false (the first one is still the answer to wait for).
   * @param {{ send: (channel: string, payload: any) => void, onGone: (listener: () => void) => () => void }} page
   * @returns {Promise<boolean>}
   */
  function ask(page) {
    if (asking) return Promise.resolve(false);
    return new Promise((resolve) => {
      const id = crypto.randomBytes(8).toString('hex');
      const off = page.onGone(() => finish(true));
      asking = { id, acked: false, resolve, timer: later(() => finish(true), ackMs), off };
      try {
        page.send('fabtice:confirm-close', { id });
      } catch {
        finish(true);
      }
    });
  }

  /** The page heard the question. */
  function ack(id) {
    const a = asking;
    if (!a || a.id !== id || a.acked) return false;
    a.acked = true;
    cancel(a.timer);
    a.timer = null;
    return true;
  }

  /** The page's answer. */
  function answer(id, ok) {
    const a = asking;
    if (!a || a.id !== id) return false;
    finish(ok === true);
    return true;
  }

  return { ask, ack, answer, isAsking: () => asking !== null };
}

module.exports = { createCloseGuard, ACK_MS };
