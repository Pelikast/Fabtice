import { describe, expect, it } from 'vitest';
import { FILE_ACCEPT, isSupportedAudioFile, titleFromFileName } from './formats';

describe('audio formats', () => {
  it('accepts the five formats by extension, any case', () => {
    for (const n of ['a.mp3', 'b.WAV', 'c.aiff', 'd.aif', 'e.m4a', 'f.FLAC']) expect(isSupportedAudioFile(n)).toBe(true);
  });
  it('accepts by MIME type when the extension is missing', () => {
    expect(isSupportedAudioFile('enregistrement', 'audio/mp4')).toBe(true);
  });
  it('refuses other files', () => {
    expect(isSupportedAudioFile('partition.pdf', 'application/pdf')).toBe(false);
    expect(isSupportedAudioFile('video.mp4', 'video/mp4')).toBe(false);
  });
  it('builds the picker filter and titles', () => {
    expect(FILE_ACCEPT).toBe('.mp3,.wav,.aiff,.aif,.m4a,.flac');
    expect(titleFromFileName('Blues_du_dimanche.mp3')).toBe('Blues du dimanche');
    expect(titleFromFileName('.flac')).toBe('.flac');
  });
});
