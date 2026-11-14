// A plausible stored project document, for storage tests.

import { defaultTempoMap } from '../grid/tempoMap';
import { emptyCorrections } from '../model/corrections';
import { PROJECT_DOCUMENT_VERSION, type ProjectDocument } from '../model/document';
import { defaultView } from '../store/store';

export function sampleDocument(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  const { mode: _mode, ...view } = defaultView();
  return {
    version: PROJECT_DOCUMENT_VERSION,
    project: {
      id: 'project-1',
      title: 'Blues du dimanche',
      source: { kind: 'file', fileName: 'Blues_du_dimanche.mp3' },
      duration: 12,
      sampleRate: 48000,
      createdAt: '2026-11-13T10:00:00.000Z',
    },
    tracks: [
      {
        id: 'track-1',
        name: 'Morceau',
        role: 'morceau',
        mute: false,
        solo: false,
        volume: 1,
        audio: { id: 'audio-1', origin: 'original', channels: 2, sampleRate: 48000, frames: 48000 * 12 },
      },
    ],
    tempoMap: defaultTempoMap(),
    loop: { region: { start: 2, end: 6 }, enabled: true },
    playback: { semitones: 2, cents: -10, tempoRatio: 0.8, metronome: true },
    view,
    analysis: null,
    corrections: emptyCorrections(),
    savedAt: '2026-11-13T10:05:00.000Z',
    ...overrides,
  };
}
