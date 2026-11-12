'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVideoId, canonicalUrl } = require('../../src/video-id');

const ID = 'dQw4w9WgXcQ';

test('accepts the supported link shapes', () => {
  const ok = [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&list=PL1234567890&index=3`,
    `https://www.youtube.com/watch?list=PL1234567890&v=${ID}&t=42s`,
    `http://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&si=abc`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=xyz&t=10`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/shorts/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}?start=5`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?si=abc`,
    `www.youtube.com/watch?v=${ID}`,
    `youtu.be/${ID}`,
    `  https://youtu.be/${ID}  `,
    `https://www.youtube.com/watch?v=${ID}#t=30`,
    ID,
  ];
  for (const link of ok) assert.equal(parseVideoId(link), ID, link);
});

test('rejects everything else', () => {
  const bad = [
    '',
    'bonjour',
    `https://www.youtube.com/watch?v=${ID}x`,
    `https://www.youtube.com/watch?v=${ID.slice(1)}`,
    `https://www.youtube.com/watch?v=${ID}&v=${ID}`,
    `https://www.youtube.com/playlist?list=PL1234567890`,
    `https://www.youtube.com/channel/UC1234567890`,
    `https://evil.example/watch?v=${ID}`,
    `https://youtube.com.evil.example/watch?v=${ID}`,
    `https://www.youtube.com:8443/watch?v=${ID}`,
    `https://user@www.youtube.com/watch?v=${ID}`,
    `ftp://www.youtube.com/watch?v=${ID}`,
    `file:///watch?v=${ID}`,
    `https://youtu.be/${ID}/extra`,
    `https://www.youtube.com/shorts/${ID}/extra`,
    `https://www.youtube.com/watch?v=--rm -rf x`,
    `https://www.youtube.com/watch?v=${ID.slice(0, 10)};`,
    null,
    42,
    'x'.repeat(5000),
  ];
  for (const link of bad) assert.equal(parseVideoId(link), null, String(link));
});

test('canonical URL is rebuilt from the id only', () => {
  assert.equal(canonicalUrl(ID), `https://www.youtube.com/watch?v=${ID}`);
  assert.throws(() => canonicalUrl('not an id'));
});
