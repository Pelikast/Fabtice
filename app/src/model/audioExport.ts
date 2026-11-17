// What the user last chose in « Audio… » (« Exporter »), kept with the piece
// (document version 3; the Wave, MP3 and file choices were added to version 6
// without a new number: an older document reads with their defaults) so the
// window opens as it was left.

export type AudioFormat = 'wav' | 'mp3' | 'flac';
export const AUDIO_FORMATS: readonly AudioFormat[] = ['wav', 'mp3', 'flac'];

/**
 * `mix`: one file, the tracks mixed AS HEARD (mute, solo and volume applied).
 * `tracks`: the tracks the user ticked, ignoring mute and solo (a separated
 * part is raw material): one file per track at its own full level, all in one
 * archive, or (`separate` off) one file, those tracks mixed at their volumes.
 */
export type ExportWhat = 'mix' | 'tracks';
export const EXPORT_WHATS: readonly ExportWhat[] = ['mix', 'tracks'];

/** The whole piece, or the loop only. */
export type ExportRange = 'whole' | 'loop';
export const EXPORT_RANGES: readonly ExportRange[] = ['whole', 'loop'];

/** Wave sampling rates, in hertz. The app works at 48 kHz: a higher rate adds no quality. */
export const WAVE_RATES: readonly number[] = [44100, 48000, 88200, 96000];
export const WAVE_BASE_RATE = 48000;

/** Wave quantization: 16 or 24 bits (integers), or 32 bits floating point. */
export type WaveBits = 16 | 24 | 32;
export const WAVE_BITS: readonly WaveBits[] = [16, 24, 32];

/** MP3 constant bit rates, in kbit/s. */
export const MP3_KBPS: readonly number[] = [96, 128, 160, 192, 256, 320];

export interface ExportPreferences {
  what: ExportWhat;
  range: ExportRange;
  format: AudioFormat;
  /** Wave only. */
  waveRate: number;
  /** Wave only: 32 is 32-bit floating point. */
  waveBits: WaveBits;
  /** MP3 only. */
  mp3Kbps: number;
  /** Several tracks ticked: one file each (in an archive) when true, else one file mixing them. */
  separate: boolean;
}

export function defaultExportPreferences(): ExportPreferences {
  return { what: 'mix', range: 'whole', format: 'wav', waveRate: 48000, waveBits: 16, mp3Kbps: 320, separate: true };
}
