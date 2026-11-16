'use strict';

// Closing the window with changes not saved: the page is asked, and the window
// waits for its answer; a page that cannot answer must not keep it open.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCloseGuard } = require('../../src/close-guard');

function fakePage() {
  const sent = [];
  let gone = null;
  return {
    sent,
    page: {
      send: (channel, payload) => sent.push({ channel, payload }),
      onGone: (listener) => {
        gone = listener;
        return () => {
          gone = null;
        };
      },
    },
    leave: () => gone && gone(),
    listening: () => gone !== null,
  };
}

/** A clock the test moves by hand. */
function fakeTimers() {
  let next = 1;
  const timers = new Map();
  return {
    setTimeout: (fn, ms) => (timers.set(next, { fn, ms }), next++),
    clearTimeout: (id) => void timers.delete(id),
    fire: () => {
      for (const [id, t] of [...timers]) {
        timers.delete(id);
        t.fn();
      }
    },
    count: () => timers.size,
  };
}

test('the page says yes: the window may go', async () => {
  const timers = fakeTimers();
  const guard = createCloseGuard({ ackMs: 2000, ...timers });
  const p = fakePage();
  const answer = guard.ask(p.page);
  assert.equal(p.sent.length, 1);
  assert.equal(p.sent[0].channel, 'fabtice:confirm-close');
  const { id } = p.sent[0].payload;
  assert.equal(guard.ack(id), true);
  assert.equal(guard.answer(id, true), true);
  assert.equal(await answer, true);
  assert.equal(guard.isAsking(), false);
  assert.equal(p.listening(), false, 'nothing is left listening');
});

test('the page says no (« Annuler »): the window stays', async () => {
  const guard = createCloseGuard(fakeTimers());
  const p = fakePage();
  const answer = guard.ask(p.page);
  const { id } = p.sent[0].payload;
  guard.ack(id);
  guard.answer(id, false);
  assert.equal(await answer, false);
});

test('the user may take as long as they like once the page has said it is asking', async () => {
  const timers = fakeTimers();
  const guard = createCloseGuard(timers);
  const p = fakePage();
  const answer = guard.ask(p.page);
  const { id } = p.sent[0].payload;
  guard.ack(id);
  assert.equal(timers.count(), 0, 'no timeout once acknowledged');
  timers.fire();
  assert.equal(guard.isAsking(), true);
  guard.answer(id, false);
  assert.equal(await answer, false);
});

test('a hung page (no acknowledgement) cannot keep the window open', async () => {
  const timers = fakeTimers();
  const guard = createCloseGuard(timers);
  const p = fakePage();
  const answer = guard.ask(p.page);
  timers.fire();
  assert.equal(await answer, true);
  assert.equal(guard.isAsking(), false);
  assert.equal(p.listening(), false);
});

test('a page that goes away while the user decides lets the window go', async () => {
  const guard = createCloseGuard(fakeTimers());
  const p = fakePage();
  const answer = guard.ask(p.page);
  guard.ack(p.sent[0].payload.id);
  p.leave();
  assert.equal(await answer, true);
});

test('a page that cannot even be written to lets the window go', async () => {
  const guard = createCloseGuard(fakeTimers());
  const answer = guard.ask({
    send: () => {
      throw new Error('destroyed');
    },
    onGone: () => () => {},
  });
  assert.equal(await answer, true);
});

test('answers for another question, or none, are ignored; a second question waits for the first', async () => {
  const guard = createCloseGuard(fakeTimers());
  const p = fakePage();
  const first = guard.ask(p.page);
  const { id } = p.sent[0].payload;
  assert.equal(guard.answer('someone else', true), false);
  assert.equal(guard.ack('someone else'), false);
  assert.equal(await guard.ask(fakePage().page), false, 'only one question at a time');
  assert.equal(guard.isAsking(), true);
  guard.answer(id, true);
  assert.equal(await first, true);
  assert.equal(guard.answer(id, true), false, 'answered once');
  // Anything but a plain `true` is a no.
  const again = guard.ask(p.page);
  guard.answer(p.sent[1].payload.id, 'yes');
  assert.equal(await again, false);
});
