// `?demo` start-up: opens the synthetic piece and exposes a debugging handle
// for the browser checks (`window.__fabtice`). Never loaded without `?demo`.
//
//   ?demo                   analysed (moving tempo, chords, sections), as if analysed earlier
//   ?demo&analyse=lente     not analysed yet: the (mock) analysis runs slowly, with a first download
//   ?demo&analyse=instant   not analysed yet: the (mock) analysis runs at once
//   ?demo&analyse=echec     not analysed yet: the (mock) analysis fails
//   ?demo&analyse=aucune    lot 1 as it was: fixed 110 BPM grid entered by hand, no analysis
//   &vue=grille             opens on the chord chart

import { MockAnalyzer, replaceAnalyzer } from '../analysis';
import { getEngine } from '../audio';
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
      ready: Promise<void>;
    };
  }
}

export const lot2Actions = { analysis: analysisActions, grid: gridActions, harmony: harmonyActions };

export function startDemo(params: URLSearchParams): Promise<void> {
  const mode = params.get('analyse');
  const ready = (async () => {
    if (mode === 'aucune') {
      const input = demoProject('fixed');
      const duration = input.tracks[0]!.audio.channels[0]!.length / input.tracks[0]!.audio.sampleRate;
      // Not analysed by itself; « Analyser le morceau » finds the demo's chords on the grid entered by hand.
      replaceAnalyzer(new MockAnalyzer({ durationMs: 900, downloadMs: 0, fixture: () => demoAnalysis(input.tempoMap!, duration) }));
      await actions.openProject(input);
      if (input.loop) actions.seek(input.loop.start);
    } else {
      const input = demoProject('variable');
      const map = input.tempoMap!;
      const duration = input.tracks[0]!.audio.channels[0]!.length / input.tracks[0]!.audio.sampleRate;
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
  })();
  window.__fabtice = { store: appStore, engine: getEngine(), actions, lot2: lot2Actions, ready };
  return ready;
}
