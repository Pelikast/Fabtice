// `?demo` start-up: opens the synthetic piece and exposes a debugging handle
// for the browser checks (`window.__fabtice`). Never loaded without `?demo`.
//
//   ?demo                   analysed (moving tempo, chords, sections), as if analysed earlier
//   ?demo&analyse=lente     not analysed yet: the (mock) analysis runs slowly, with a first download
//   ?demo&analyse=instant   not analysed yet: the (mock) analysis runs at once
//   ?demo&analyse=echec     not analysed yet: the (mock) analysis fails
//   ?demo&analyse=aucune    lot 1 as it was: fixed 110 BPM grid entered by hand, no analysis
//   &vue=grille             opens on the chord chart
//
// Lot 3 (the four demo instruments mixed into ONE whole-piece track first):
//   &separation=entier      not separated: « Séparer les instruments » to try
//   &separation=faite       already separated (stand-in separator, at once)
//   &separation=lente       a slow separation runs at once, with a first download of the tool
//   &separation=repli       a separation runs; the graphics path « fails », the processor goes on
//   &separation=echec       a separation runs and fails half way
//   &rendu=lent             « Appliquer » slow enough to see its waiting screen
//   &export=ouvert          opens « Exporter le son »

import { MockAnalyzer, replaceAnalyzer } from '../analysis';
import { getEngine } from '../audio';
import { pcmFromChannels, readPcm } from '../audio/pcm';
import { audioSeconds, getAudio, registryBytes, type DecodedAudio } from '../audio/registry';
import { exportWithApp, getEncoder, planAudioExport } from '../export/audio';
import * as renderController from '../render/controller';
import * as renderModule from '../render';
import * as renderBudget from '../render/budget';
import { setDevice } from '../separation/device';
import { getSeparator } from '../separation';
import { getModelList } from '../separation/models';
import { separationReportFor } from '../separation/report';
import { separatePiece } from '../separation/engine/pipeline';
import { parseConfig } from '../separation/engine/plan';
import { makeRunner } from '../separation/engine/runners';
import * as separationRunner from '../separation/runner';
import { getProjectStorage } from '../storage';
import * as exportActions from '../store/exportActions';
import * as separationActions from '../store/separationActions';
import { appStore } from '../store/store';
import * as actions from '../store/actions';
import * as analysisActions from '../store/analysisActions';
import * as gridActions from '../store/gridActions';
import * as harmonyActions from '../store/harmonyActions';
import { demoAnalysis, demoCorrections } from './demoAnalysis';
import { demoProject } from './demoProject';

declare global {
  interface Window {
    __fabtice?: {
      store: typeof appStore;
      engine: ReturnType<typeof getEngine>;
      actions: typeof actions;
      /** Lot 2 actions (analysis, grid corrections, harmony and chart). */
      lot2?: { analysis: typeof analysisActions; grid: typeof gridActions; harmony: typeof harmonyActions };
      /** Lot 3: separation, « Appliquer », audio export, the audio registry and the storage. */
      lot3?: typeof lot3Handle;
      ready: Promise<void>;
    };
  }
}

export const lot2Actions = { analysis: analysisActions, grid: gridActions, harmony: harmonyActions };

/** Lot 3 handles for the browser checks (`?demo`, `?debug`). */
export const lot3Handle = {
  separation: { ...separationRunner, ...separationActions, models: getModelList, separator: getSeparator, setDevice, report: separationReportFor, engine: { separatePiece, makeRunner, parseConfig } },
  render: renderController,
  renderer: { ...renderModule, ...renderBudget },
  exportAudio: { ...exportActions, planAudioExport, exportWithApp, getEncoder },
  registry: { getAudio, registryBytes },
  pcm: { pcmFromChannels, readPcm },
  storage: getProjectStorage,
};

/** The demo's instruments mixed into one track: the piece as an import would give it. */
function wholePiece(tracks: { audio: DecodedAudio | { frames: number } }[]): DecodedAudio {
  const list = tracks.map((tr) => tr.audio as DecodedAudio);
  const n = list[0]!.channels[0]!.length;
  const mix = new Float32Array(n);
  for (const a of list) {
    const c = a.channels[0]!;
    for (let i = 0; i < n; i++) mix[i] = mix[i]! + c[i]! * 0.7;
  }
  return { channels: [mix], sampleRate: list[0]!.sampleRate };
}

export function startDemo(params: URLSearchParams): Promise<void> {
  const mode = params.get('analyse');
  const separation = params.get('separation');
  // A known computer, so that estimates and the automatic choice are the same on every run.
  setDevice({ phone: false, gpu: 'apple', browser: 'chromium', memoryGB: 8, cores: 8, desktopApp: false });
  const ready = (async () => {
    if (mode === 'aucune') {
      const input = demoProject('fixed');
      const duration = audioSeconds(input.tracks[0]!.audio);
      // Not analysed by itself; « Analyser le morceau » finds the demo's chords on the grid entered by hand.
      replaceAnalyzer(new MockAnalyzer({ durationMs: 900, downloadMs: 0, fixture: () => demoAnalysis(input.tempoMap!, duration) }));
      await actions.openProject(input);
      if (input.loop) actions.seek(input.loop.start);
    } else {
      const input = demoProject('variable');
      const map = input.tempoMap!;
      const duration = audioSeconds(input.tracks[0]!.audio);
      const analysedAlready = mode === null || mode === 'factice';
      // The mock analyser answers with the demo's own analysis, at the pace asked.
      replaceAnalyzer(
        new MockAnalyzer({
          durationMs: mode === 'lente' ? 8000 : mode === 'instant' ? 0 : 900,
          downloadMs: mode === 'lente' ? 5000 : 0,
          failWith: mode === 'echec' ? 'failed' : undefined,
          fixture: () => demoAnalysis(map, duration),
        }),
      );
      await actions.openProject({
        ...input,
        // Lot 3: one whole-piece track, to be separated.
        tracks: separation ? [{ role: 'morceau', audio: wholePiece(input.tracks as never) }] : input.tracks,
        // Not analysed yet: the grid is unknown until the analysis has run.
        tempoMap: analysedAlready ? map : undefined,
        loop: analysedAlready ? input.loop : null,
        analysis: analysedAlready ? demoAnalysis(map, duration) : null,
        corrections: demoCorrections(map),
      });
      if (input.loop && analysedAlready) actions.seek(input.loop.start);
    }
    // `?demo&vue=grille` opens on the chord chart view.
    if (params.get('vue') === 'grille') actions.setViewMode('grille');
    if (separation === 'faite') await separationRunner.startSeparation();
    else if (separation === 'lente' || separation === 'repli' || separation === 'echec') void separationRunner.startSeparation();
    if (params.get('export') === 'ouvert') exportActions.openExportAudio();
  })();
  window.__fabtice = { store: appStore, engine: getEngine(), actions, lot2: lot2Actions, lot3: lot3Handle, ready };
  return ready;
}
