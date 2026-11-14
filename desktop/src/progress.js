'use strict';

// What yt-dlp's progress lines say, and what the interface is told about them.
//
// With `--newline` yt-dlp prints one of these forms on its standard output
// (observed with the real yt-dlp against a local server, with and without a
// Content-Length, and throttled; the templates are in yt-dlp's
// downloader/common.py, `report_progress`). Sizes are padded to ten characters:
//
//   [download]   0.0% of    6.00MiB at  Unknown B/s ETA Unknown     known total
//   [download]  33.3% of    6.00MiB at  172.27MiB/s ETA 00:00
//   [download]  33.3% of ~  6.00MiB at  172.27MiB/s ETA 00:00 (frag 3/40)   estimated total
//   [download] 100% of    6.00MiB in 00:00:00 at 150.31MiB/s        finished
//   [download]    1.00KiB at  Unknown B/s (00:00:00)                unknown total:
//   [download]    2.00MiB at    1.28MiB/s (00:00:01)                  only the amount received
//   [download]  12.0% at    1.00MiB/s ETA 00:10                     a percentage with no size at all
//   [download] Destination: /tmp/…/audio.m4a                        the file is about to be written
//
// Anything else (including the `[info]` lines) says nothing about progress.
// This module only reads; it changes nothing about what yt-dlp is asked to do.

const UNITS = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4 };
const UNIT = '(?:B|KiB|MiB|GiB|TiB)';

// "6.00MiB", "1.00KiB", "123.00B" -> bytes; anything else -> null.
function parseSize(text) {
  const m = new RegExp(`^([\\d.]+)\\s*(${UNIT})$`).exec(String(text).trim());
  return m ? Math.round(Number(m[1]) * UNITS[m[2]]) : null;
}

// "5.47MiB/s" -> bytes per second; "Unknown B/s" and the like -> null.
function parseSpeed(text) {
  const m = new RegExp(`^([\\d.]+)\\s*(${UNIT})/s$`).exec(String(text).trim());
  return m ? Number(m[1]) * UNITS[m[2]] : null;
}

const SIZE = `([\\d.]+\\s*${UNIT})`;
const SPEED = `(Unknown B/s|[\\d.]+\\s*${UNIT}/s)`;
const FRAG = '(?:\\s+\\(frag (\\d+)(?:/(\\d+))?\\))?';
const RE_FINISHED = new RegExp(`^\\[download\\]\\s+100%\\s+of\\s+(~)?\\s*${SIZE}\\s+in\\s+(\\S+)(?:\\s+at\\s+${SPEED})?\\s*$`);
const RE_TOTAL = new RegExp(`^\\[download\\]\\s+([\\d.]+)%\\s+of\\s+(~)?\\s*${SIZE}\\s+at\\s+${SPEED}(?:\\s+ETA\\s+(\\S+))?${FRAG}\\s*$`);
const RE_RECEIVED = new RegExp(`^\\[download\\]\\s+${SIZE}\\s+at\\s+${SPEED}(?:\\s+\\((\\S+)\\))?${FRAG}\\s*$`);
const RE_PERCENT_ONLY = new RegExp(`^\\[download\\]\\s+([\\d.]+)%\\s+at\\s+${SPEED}(?:\\s+ETA\\s+(\\S+))?${FRAG}\\s*$`);

/**
 * One line of yt-dlp's standard output -> what it says about the download, or null.
 *   { kind: 'progress', percent, totalBytes, estimated, speedBps }
 *   { kind: 'received', receivedBytes, speedBps }      total unknown
 *   { kind: 'percent',  percent, speedBps }            a percentage, no size
 *   { kind: 'finished', totalBytes, speedBps }
 *   { kind: 'destination' }
 */
function parseProgressLine(line) {
  const text = String(line).trim();
  if (!text.startsWith('[download]')) return null;
  let m = RE_FINISHED.exec(text);
  if (m) return { kind: 'finished', totalBytes: parseSize(m[2]), speedBps: m[4] ? parseSpeed(m[4]) : null };
  m = RE_TOTAL.exec(text);
  if (m) {
    return { kind: 'progress', percent: Math.min(100, Number(m[1])), totalBytes: parseSize(m[3]), estimated: Boolean(m[2]), speedBps: parseSpeed(m[4]) };
  }
  m = RE_RECEIVED.exec(text);
  if (m) return { kind: 'received', receivedBytes: parseSize(m[1]), speedBps: parseSpeed(m[2]) };
  m = RE_PERCENT_ONLY.exec(text);
  if (m) return { kind: 'percent', percent: Math.min(100, Number(m[1])), speedBps: parseSpeed(m[2]) };
  if (/^\[download\]\s+Destination:/.test(text)) return { kind: 'destination' };
  return null;
}

/**
 * What the interface is told for a parsed line, or null when there is nothing
 * to measure. `percent` is null when no percentage exists (then
 * `receivedBytes` may still be known); `receivedBytes` is null when it cannot
 * be told.
 */
function progressEvent(parsed) {
  switch (parsed && parsed.kind) {
    case 'progress':
      return {
        phase: 'download',
        percent: parsed.percent,
        totalBytes: parsed.totalBytes,
        receivedBytes: parsed.totalBytes === null ? null : Math.round((parsed.percent / 100) * parsed.totalBytes),
        speedBps: parsed.speedBps,
      };
    case 'received':
      return { phase: 'download', percent: null, totalBytes: null, receivedBytes: parsed.receivedBytes, speedBps: parsed.speedBps };
    case 'percent':
      return { phase: 'download', percent: parsed.percent, totalBytes: null, receivedBytes: null, speedBps: parsed.speedBps };
    case 'finished':
      return { phase: 'download', percent: 100, totalBytes: parsed.totalBytes, receivedBytes: parsed.totalBytes, speedBps: parsed.speedBps };
    default:
      return null;
  }
}

module.exports = { parseProgressLine, progressEvent, parseSize, parseSpeed };
