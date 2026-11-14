// The models the analysis downloads, as measured in the prototype
// (`web/spikes/analyse/lib/models.js`): public Hugging Face repositories at a
// pinned revision, checked against their SHA-256. The real analyser owns this
// list (it may move the files to a repository of the project, see
// PASSATION.md); the mock reports it so the interface shows the right sources,
// sizes and licences.

import type { AnalysisModelInfo } from './types';

const HF = 'https://huggingface.co/';
const BEAT_REPO = 'nilsbc/beat-this-onnx/resolve/0d66b58ee1b3b42ec5e82334949626295f3ed82b/';
const CREMA_REPO = 'thebluescreen/crema-chords-onnx/resolve/302ae89e3ed7753fc8da9cb08274aff446d8fe47/';

export interface ModelSpec extends Omit<AnalysisModelInfo, 'cached'> {
  sha256: string;
}

export const ANALYSIS_MODELS: readonly ModelSpec[] = [
  {
    id: 'beat-this-logmel',
    name: 'Beat This! (préparation du son)',
    role: 'temps et premiers temps',
    url: `${HF}${BEAT_REPO}logmel.onnx`,
    host: 'Hugging Face',
    licence: 'MIT',
    bytes: 4468830,
    sha256: 'f5afa499f5a42b05ea89a214561170cd4b76f92d67d3227f7c9833e8d79bbb43',
  },
  {
    id: 'beat-this-final0',
    name: 'Beat This!',
    role: 'temps et premiers temps',
    url: `${HF}${BEAT_REPO}beat_this_final0.onnx`,
    host: 'Hugging Face',
    licence: 'MIT',
    bytes: 83162700,
    sha256: 'a7e2c68b27f9db6a73416017f784ea8551a01373f4955a98db018827760c4a14',
  },
  {
    id: 'crema-chords',
    name: 'CREMA',
    role: 'accords',
    url: `${HF}${CREMA_REPO}crema_chords.onnx`,
    host: 'Hugging Face',
    licence: 'BSD-2-Clause',
    bytes: 2728454,
    sha256: '3222e641f23f668caabb48498d8d4db258216753af8d1da2753da002eb786c1e',
  },
];
