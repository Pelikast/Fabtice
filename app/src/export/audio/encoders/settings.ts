// The quality of each format of « Audio… ».

/**
 * mp3: a constant bit rate, 96 to 320 kbit/s, 320 by default (the list is
 * `model/audioExport.ts#MP3_KBPS`). LAME's joint stereo (its default for two
 * channels). The rate is constant on purpose: a variable-rate file without a
 * Xing header shows a wrong length and seeks badly in many players, and this
 * encoder writes none. 320 kbit/s is 2.4 MB per minute, 96 is 0.7.
 */
import { MP3_KBPS } from '../../../model/audioExport';

export const MP3_DEFAULT_KBPS = 320;

/** The rate asked, or the default when it is not one LAME's layer III table has among the choices. */
export function mp3Bitrate(kbps: number | undefined): number {
  return kbps !== undefined && MP3_KBPS.includes(kbps) ? kbps : MP3_DEFAULT_KBPS;
}

/** flac: libFLAC's default level (5): the usual size, fast. The audio is the same at every level. */
export const FLAC_LEVEL = 5;
