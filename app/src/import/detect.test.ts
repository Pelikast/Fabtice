import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeAiff, makeFlacHeader, makeMp3, makeMp4Header, makeWav, sine } from '../test/audioFiles';
import { detectAudioFormat, probeDuration } from './detect';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(root, p)));

describe('format detection by content', () => {
  it('recognises each of the five formats', () => {
    expect(detectAudioFormat(makeWav(1, 8000, [sine(440, 8000, 0.1)]))).toBe('wav');
    expect(detectAudioFormat(makeAiff({ channels: 1, sampleRate: 8000, bits: 16, samples: [[0, 0.1]] }))).toBe('aiff');
    expect(detectAudioFormat(makeFlacHeader(44100, 44100))).toBe('flac');
    expect(detectAudioFormat(makeMp4Header(1000, 1000))).toBe('m4a');
    expect(detectAudioFormat(makeMp3(0.2))).toBe('mp3');
    expect(detectAudioFormat(makeMp3(0.2, { id3: true }))).toBe('mp3');
  });

  it('recognises the real files', () => {
    expect(detectAudioFormat(read('web/spikes/analyse/demo/demo-swing.mp3'))).toBe('mp3');
    expect(detectAudioFormat(read('desktop/test/fixtures/tone-dash.m4a'))).toBe('m4a');
  });

  it('recognises the test fixtures and reads their length from the header', () => {
    const fixture = (n: string) => new Uint8Array(fs.readFileSync(path.join(root, 'app/tests/fixtures', n)));
    expect(detectAudioFormat(fixture('tone.wav'))).toBe('wav');
    expect(detectAudioFormat(fixture('tone.aiff'))).toBe('aiff');
    expect(detectAudioFormat(fixture('tone.flac'))).toBe('flac');
    expect(detectAudioFormat(fixture('tone.mp3'))).toBe('mp3');
    expect(probeDuration(fixture('tone.wav'), 'wav')).toBeCloseTo(1.5, 3);
    expect(probeDuration(fixture('tone.aiff'), 'aiff')).toBeCloseTo(1, 3);
    expect(probeDuration(fixture('tone.flac'), 'flac')).toBeCloseTo(1.5, 3);
    expect(probeDuration(fixture('tone.mp3'), 'mp3')).toBeCloseTo(1.5, 1);
  });

  it('answers null for anything else', () => {
    expect(detectAudioFormat(new TextEncoder().encode('%PDF-1.7 ...'))).toBeNull();
    expect(detectAudioFormat(new Uint8Array(0))).toBeNull();
    expect(detectAudioFormat(new Uint8Array([0xff, 0x00, 0x00, 0x00]))).toBeNull();
    // An AAC stream in ADTS framing (layer bits 00) is not MPEG audio layer III.
    expect(detectAudioFormat(new Uint8Array([0xff, 0xf1, 0x50, 0x80]))).toBeNull();
  });
});

describe('length read from the header', () => {
  it('wav', () => {
    expect(probeDuration(makeWav(2, 44100, [sine(440, 44100, 3), sine(440, 44100, 3)]), 'wav')).toBeCloseTo(3, 6);
  });
  it('wav streamed with an unknown size uses what is there', () => {
    const wav = makeWav(1, 8000, [sine(440, 8000, 2)], { dataSizeOverride: 0xffffffff });
    expect(probeDuration(wav, 'wav')).toBeCloseTo(2, 6);
  });
  it('aiff', () => {
    expect(probeDuration(makeAiff({ channels: 1, sampleRate: 22050, bits: 16, samples: [sine(440, 22050, 1.5)] }), 'aiff')).toBeCloseTo(1.5, 6);
  });
  it('flac, even for a long piece', () => {
    expect(probeDuration(makeFlacHeader(44100, 44100 * 90), 'flac')).toBeCloseTo(90, 6);
    expect(probeDuration(makeFlacHeader(96000, 96000 * 7200), 'flac')).toBeCloseTo(7200, 6);
  });
  it('m4a, and nothing for a fragmented file whose header says zero', () => {
    expect(probeDuration(makeMp4Header(44100, 44100 * 61), 'm4a')).toBeCloseTo(61, 6);
    expect(probeDuration(read('desktop/test/fixtures/tone-dash.m4a'), 'm4a')).toBeNull();
  });
  it('mp3: constant bitrate estimate, with or without a tag in front', () => {
    expect(probeDuration(makeMp3(10), 'mp3')).toBeCloseTo(10, 1);
    expect(probeDuration(makeMp3(10, { id3: true }), 'mp3')).toBeCloseTo(10, 1);
  });
  it('mp3: the frame count of an Info tag wins', () => {
    expect(probeDuration(makeMp3(2, { xingFrames: 1000 }), 'mp3')).toBeCloseTo((1000 * 1152) / 44100, 6);
  });
  it('the real mp3 (37.7 s) is read within a second', () => {
    expect(probeDuration(read('web/spikes/analyse/demo/demo-swing.mp3'), 'mp3')).toBeCloseTo(37.69, 0);
  });
  it('says null rather than throwing on garbage', () => {
    expect(probeDuration(new Uint8Array(30), 'wav')).toBeNull();
    expect(probeDuration(new Uint8Array(30), 'mp3')).toBeNull();
    expect(probeDuration(new Uint8Array(30), 'm4a')).toBeNull();
    expect(probeDuration(new Uint8Array(30), 'flac')).toBeNull();
    expect(probeDuration(new Uint8Array(30), 'aiff')).toBeNull();
    expect(probeDuration(new Uint8Array(30), null)).toBeNull();
  });
});
