'use strict';

// Reduces whatever the user pasted to an 11-character YouTube video id, or null.
// Only the id leaves this function: the yt-dlp URL is rebuilt from it, so query
// parameters such as list=, t= or si= can never reach yt-dlp.

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const SHORT_HOSTS = new Set(['youtu.be', 'www.youtu.be']);
const PATH_PREFIXES = new Set(['shorts', 'embed', 'live', 'v']);

function parseVideoId(input) {
  if (typeof input !== 'string') return null;
  let text = input.trim();
  if (!text || text.length > 2048) return null;
  if (ID_RE.test(text)) return text;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;

  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || url.port) return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);
  let candidate = null;

  if (SHORT_HOSTS.has(host)) {
    candidate = segments.length === 1 ? segments[0] : null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (segments.length === 1 && segments[0] === 'watch') {
      const values = url.searchParams.getAll('v');
      candidate = values.length === 1 ? values[0] : null;
    } else if (segments.length === 2 && PATH_PREFIXES.has(segments[0])) {
      candidate = segments[1];
    }
  }
  return candidate && ID_RE.test(candidate) ? candidate : null;
}

function canonicalUrl(videoId) {
  if (!ID_RE.test(videoId)) throw new Error('invalid video id');
  return `https://www.youtube.com/watch?v=${videoId}`;
}

module.exports = { parseVideoId, canonicalUrl, ID_RE };
