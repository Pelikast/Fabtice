// « Exporter le son » (lot 3): see `types.ts` for the contract.

import { getAudio } from '../../audio/registry';
import { getRenderer } from '../../render';
import { appliedAudioFor } from '../../render/controller';
import { appStore } from '../../store/store';
import { runAudioExport } from './run';
import type { ExportedFile, ExportPlan } from './types';

export * from './types';
export { planAudioExport, audibleTracks, safeFileName, changesSuffix } from './plan';
export { runAudioExport } from './run';
export { getEncoder, hasEncoder, registerEncoder } from './encoders';
export { deliverable, type Delivered } from './deliver';
export { zipStore, crc32 } from './zip';
export { wavEncoder, wavHeader } from './wav';

/** Runs a plan with the app's renderer and audio (and the applied render when it matches). */
export function exportWithApp(plan: ExportPlan, options: { onProgress?: (f: number) => void; signal?: AbortSignal }): Promise<ExportedFile> {
  return runAudioExport(plan, {
    renderer: getRenderer(),
    audioOf: getAudio,
    appliedOf: (trackId) => appliedAudioFor(appStore.getState(), trackId),
    onProgress: options.onProgress,
    signal: options.signal,
  });
}
