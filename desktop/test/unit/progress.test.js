'use strict';

// The progress lines below were printed by the real yt-dlp (PyPI release
// 2026.10.26, run with the same download arguments as the app, against a local
// HTTP server: a file with a Content-Length, one without, and a throttled one).
// They are pasted as observed, spacing included.

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseProgressLine, progressEvent, parseSize, parseSpeed } = require('../../src/progress');

// Known total (Content-Length present).
const KNOWN = [
  '[download]   0.0% of    6.00MiB at  Unknown B/s ETA Unknown',
  '[download]   0.1% of    6.00MiB at    5.47MiB/s ETA 00:01',
  '[download]   1.0% of    6.00MiB at   28.82MiB/s ETA 00:00',
  '[download]  33.3% of    6.00MiB at  172.27MiB/s ETA 00:00',
  '[download] 100.0% of    6.00MiB at  218.75MiB/s ETA 00:00',
  '[download] 100% of    6.00MiB in 00:00:00 at 150.31MiB/s',
];

// Unknown total (no Content-Length): only the amount received.
const UNKNOWN = [
  '[download]    1.00KiB at  Unknown B/s (00:00:00)',
  '[download]   15.00KiB at   14.30MiB/s (00:00:00)',
  '[download] 1023.00KiB at    1.32MiB/s (00:00:00)',
  '[download]    2.00MiB at    1.28MiB/s (00:00:01)',
  '[download] 100% of    2.00MiB in 00:00:01 at 1.23MiB/s',
];

test('known total: a real percentage, with the total and the speed', () => {
  assert.deepEqual(parseProgressLine(KNOWN[0]), { kind: 'progress', percent: 0, totalBytes: 6 * 1024 * 1024, estimated: false, speedBps: null });
  const third = parseProgressLine(KNOWN[2]);
  assert.equal(third.kind, 'progress');
  assert.equal(third.percent, 1);
  assert.ok(Math.abs(third.speedBps - 28.82 * 1024 * 1024) < 1);
  assert.equal(parseProgressLine(KNOWN[3]).percent, 33.3);
  assert.equal(parseProgressLine(KNOWN[4]).percent, 100);
});

test('the last line is a summary, not a progress line', () => {
  const done = parseProgressLine(KNOWN[5]);
  assert.equal(done.kind, 'finished');
  assert.equal(done.totalBytes, 6 * 1024 * 1024);
  assert.ok(Math.abs(done.speedBps - 150.31 * 1024 * 1024) < 1);
  assert.equal(parseProgressLine(UNKNOWN[4]).kind, 'finished');
});

test('unknown total: the amount received and no percentage at all', () => {
  assert.deepEqual(parseProgressLine(UNKNOWN[0]), { kind: 'received', receivedBytes: 1024, speedBps: null });
  assert.equal(parseProgressLine(UNKNOWN[1]).receivedBytes, 15 * 1024);
  assert.equal(parseProgressLine(UNKNOWN[2]).receivedBytes, 1023 * 1024);
  assert.equal(parseProgressLine(UNKNOWN[3]).receivedBytes, 2 * 1024 * 1024);
  for (const line of UNKNOWN.slice(0, 4)) assert.equal(progressEvent(parseProgressLine(line)).percent, null);
});

test('the other forms yt-dlp can print (from its source): estimated total, fragments, a percentage without size', () => {
  const estimated = parseProgressLine('[download]  12.5% of ~   3.50MiB at  100.00KiB/s ETA 00:30 (frag 5/40)');
  assert.equal(estimated.kind, 'progress');
  assert.equal(estimated.estimated, true);
  assert.equal(estimated.percent, 12.5);
  assert.equal(estimated.totalBytes, Math.round(3.5 * 1024 * 1024));
  assert.equal(parseProgressLine('[download]   5.0% of    1.00MiB at    1.00MiB/s ETA 00:01 (frag 2)').kind, 'progress');
  assert.deepEqual(parseProgressLine('[download]  12.0% at    1.00MiB/s ETA 00:10'), { kind: 'percent', percent: 12, speedBps: 1024 * 1024 });
  const fragmentedUnknown = parseProgressLine('[download]    3.00MiB at    1.00MiB/s (00:00:03) (frag 3)');
  assert.equal(fragmentedUnknown.kind, 'received');
  assert.equal(fragmentedUnknown.receivedBytes, 3 * 1024 * 1024);
});

test('the lines that say nothing about progress are ignored', () => {
  for (const line of [
    '[info] abc: Downloading 1 format(s): 140',
    '[debug] Command-line config: ["--ignore-config"]',
    '[download] Resuming download at byte 1024',
    '[download] Download completed',
    '',
    'ERROR: something',
  ]) {
    assert.equal(parseProgressLine(line), null, line);
  }
  assert.deepEqual(parseProgressLine('[download] Destination: /tmp/fabtice-x/audio.m4a'), { kind: 'destination' });
  assert.equal(progressEvent({ kind: 'destination' }), null);
  assert.equal(progressEvent(null), null);
});

test('what the interface is told', () => {
  assert.deepEqual(progressEvent(parseProgressLine(KNOWN[3])), {
    phase: 'download',
    percent: 33.3,
    totalBytes: 6 * 1024 * 1024,
    receivedBytes: Math.round(0.333 * 6 * 1024 * 1024),
    speedBps: parseProgressLine(KNOWN[3]).speedBps,
  });
  assert.deepEqual(progressEvent(parseProgressLine(UNKNOWN[3])), { phase: 'download', percent: null, totalBytes: null, receivedBytes: 2 * 1024 * 1024, speedBps: 1.28 * 1024 * 1024 });
  const finished = progressEvent(parseProgressLine(KNOWN[5]));
  assert.equal(finished.percent, 100);
  assert.equal(finished.receivedBytes, 6 * 1024 * 1024);
  assert.deepEqual(progressEvent(parseProgressLine('[download]  12.0% at    1.00MiB/s ETA 00:10')), { phase: 'download', percent: 12, totalBytes: null, receivedBytes: null, speedBps: 1024 * 1024 });
});

test('sizes and speeds', () => {
  assert.equal(parseSize('6.00MiB'), 6291456);
  assert.equal(parseSize('123.00B'), 123);
  assert.equal(parseSize('1.50GiB'), 1610612736);
  assert.equal(parseSize('about 5'), null);
  assert.equal(parseSpeed('Unknown B/s'), null);
  assert.equal(parseSpeed('1.28MiB/s'), 1.28 * 1024 * 1024);
});
