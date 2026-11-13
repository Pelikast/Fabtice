// What the import accepts. The decoded piece stays in memory as 32-bit floats
// at 48 kHz (about 22 MB per minute of stereo), next to a copy of the file
// itself and the copy kept on the device, so both limits are on purpose
// modest. They match the Mac app's own limit for links (20 minutes).

/** Longest piece accepted: 20 minutes (about 460 MB once decoded, in stereo). */
export const MAX_DURATION_SECONDS = 20 * 60;

/** Largest file accepted: 256 MB (a 20 minute 16-bit stereo WAV at 44.1 kHz is 212 MB). */
export const MAX_FILE_BYTES = 256 * 1024 * 1024;

/** Anything shorter than this is treated as empty. */
export const MIN_DURATION_SECONDS = 0.05;
