// The one quality of each lossy or lossless format of « Exporter le son ».
// Fixed on purpose: nobody should have to choose a bit rate to save a loop.

/**
 * mp3: 256 kbit/s, constant. LAME's joint stereo (its default for two
 * channels) at that rate is transparent on music for nearly every listener,
 * and a constant rate is the setting every player reads right: a variable-rate
 * file without a Xing header shows a wrong length and seeks badly in many
 * players, and this encoder writes none. 256 kbit/s is 1.9 MB per minute.
 */
export const MP3_BITRATE = 256;

/** flac: libFLAC's default level (5): the usual size, fast. The audio is the same at every level. */
export const FLAC_LEVEL = 5;
