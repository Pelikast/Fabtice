'use strict';

// « Ouvrir dans iReal Pro »: the interface hands the main process an
// `irealb://` link and the main process asks the system to open it
// (`shell.openExternal`). That call can start any program the system knows for
// a scheme, so nothing but an iReal Pro chart link is accepted here:
//
//   - the scheme is exactly `irealb:` (not `irealbook:`, not `http:`, not `file:`),
//   - the length is bounded,
//   - the rest is what `encodeURIComponent` writes (letters, digits and
//     `- _ . ! ~ * ' ( )`, `%XX` escapes that are complete), plus `=` and `/`:
//     no space, no control character, no backslash, no `#`, `?`, `&`, `@`, `:` or `"`.
//     iReal Pro's own links and the app's are made of exactly that.

// The app writes the same bound (app/src/export/ireal.ts, IREAL_URL_MAX_LENGTH).
const MAX_LENGTH = 200_000;
const PREFIX = 'irealb://';
const BODY = /^[A-Za-z0-9\-_.!~*'()=/%]+$/;
const BAD_ESCAPE = /%(?![0-9A-Fa-f]{2})/;

/**
 * @param {unknown} link
 * @returns {{ ok: true, url: string } | { ok: false, reason: 'invalid' }}
 */
function validateIRealLink(link) {
  if (typeof link !== 'string') return { ok: false, reason: 'invalid' };
  if (link.length <= PREFIX.length || link.length > MAX_LENGTH) return { ok: false, reason: 'invalid' };
  if (!link.startsWith(PREFIX)) return { ok: false, reason: 'invalid' };
  const body = link.slice(PREFIX.length);
  if (!BODY.test(body) || BAD_ESCAPE.test(body)) return { ok: false, reason: 'invalid' };
  // The system gets what `URL` makes of it, so check that it is still an irealb: link with nothing else.
  let parsed;
  try {
    parsed = new URL(link);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (parsed.protocol !== 'irealb:' || parsed.username !== '' || parsed.password !== '' || parsed.port !== '') return { ok: false, reason: 'invalid' };
  return { ok: true, url: link };
}

module.exports = { validateIRealLink, MAX_LENGTH };
