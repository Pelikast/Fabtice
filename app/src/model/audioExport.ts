// What the user last chose in « Exporter le son » (lot 3), kept with the piece
// (document version 3) so the dialog opens as it was left.

export type AudioFormat = 'wav' | 'mp3' | 'flac';
export const AUDIO_FORMATS: readonly AudioFormat[] = ['wav', 'mp3', 'flac'];

/**
 * `mix`: one file, the tracks mixed AS HEARD (mute, solo and volume applied).
 * `tracks`: one file per chosen track, each at its own full level (mute, solo
 * and volume ignored: a separated part is raw material), all in one archive.
 */
export type ExportWhat = 'mix' | 'tracks';
export const EXPORT_WHATS: readonly ExportWhat[] = ['mix', 'tracks'];

/** The whole piece, or the loop only. */
export type ExportRange = 'whole' | 'loop';
export const EXPORT_RANGES: readonly ExportRange[] = ['whole', 'loop'];

export interface ExportPreferences {
  what: ExportWhat;
  range: ExportRange;
  format: AudioFormat;
}

export function defaultExportPreferences(): ExportPreferences {
  return { what: 'mix', range: 'whole', format: 'wav' };
}
