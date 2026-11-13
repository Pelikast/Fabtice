// Keeps the engine in step with the store: settings flow store -> engine,
// engine state flows engine -> store. Called once at start-up (`main.tsx`).

import { metronomeClicks } from '../grid/lines';
import type { AppState, AppStore } from '../store/store';
import type { AudioEngine } from './AudioEngine';

export function connectEngine(store: AppStore, engine: AudioEngine): () => void {
  const offState = engine.on('state', (state) =>
    store.setState((s) => ({ transport: { engine: state, error: state === 'error' ? s.transport.error : null } })),
  );
  const offError = engine.on('error', (error) => store.setState((s) => ({ transport: { ...s.transport, error } })));

  const apply = (s: AppState, prev: AppState | null) => {
    if (!prev || s.playback.semitones !== prev.playback.semitones || s.playback.cents !== prev.playback.cents) {
      engine.setTransposition(s.playback.semitones, s.playback.cents);
    }
    if (!prev || s.playback.tempoRatio !== prev.playback.tempoRatio) engine.setTempoRatio(s.playback.tempoRatio);
    if (!prev || s.playback.metronome !== prev.playback.metronome) engine.setMetronome(s.playback.metronome);
    if (!prev || s.loop !== prev.loop) engine.setLoop(s.loop.enabled ? s.loop.region : null);
    if (!prev || s.tempoMap !== prev.tempoMap || s.project?.duration !== prev.project?.duration) {
      engine.setClickTrack(metronomeClicks(s.tempoMap, 0, s.project?.duration ?? 0));
    }
    if (!prev || s.tracks !== prev.tracks) {
      for (const tr of s.tracks) {
        const before = prev?.tracks.find((x) => x.id === tr.id);
        if (before !== tr) engine.setTrackMix(tr.id, { mute: tr.mute, solo: tr.solo, volume: tr.volume });
      }
    }
  };

  apply(store.getState(), null);
  const offStore = store.subscribe((s, prev) => apply(s, prev));
  store.setState((s) => ({ transport: { ...s.transport, engine: engine.getState() } }));

  return () => {
    offState();
    offError();
    offStore();
  };
}
