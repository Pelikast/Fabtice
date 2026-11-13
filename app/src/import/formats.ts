// Audio formats accepted by the import.

export const SUPPORTED_EXTENSIONS = ['mp3', 'wav', 'aiff', 'aif', 'm4a', 'flac'] as const;

/** `accept` attribute of the file picker. */
export const FILE_ACCEPT = SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(',');

const MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/aiff',
  'audio/x-aiff',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/flac',
  'audio/x-flac',
]);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Accepts by extension first (browsers often leave the type empty), then by MIME type. */
export function isSupportedAudioFile(name: string, mimeType = ''): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extensionOf(name)) || MIME_TYPES.has(mimeType.toLowerCase());
}

/** Project title from a file name: extension removed, underscores turned into spaces. */
export function titleFromFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/_/g, ' ').trim();
  return base || name;
}
