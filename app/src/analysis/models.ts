// The models the analysis downloads, as measured in the prototype
// (`web/spikes/analyse/lib/models.js`): public Hugging Face repositories at a
// pinned revision, each checked against its SHA-256 before use. The weights
// are never part of the app and never redistributed by it: they are fetched
// from their public location, at the user's request (the first analysis).
// The conversions to ONNX belong to third parties (see PASSATION.md: a copy
// under a project account is still to be decided).
//
// Two Beat This! networks exist. The small one (10.5 MB) is the default: on
// the reference file it finds the beats where the full one (83 MB) reads the
// tempo at half speed (see README, « Analyseur »). The full one is kept in the
// registry for the advanced setting.

import type { AnalysisModelInfo } from './types';

const HF = 'https://huggingface.co/';
const BEAT_REPO = 'nilsbc/beat-this-onnx/resolve/0d66b58ee1b3b42ec5e82334949626295f3ed82b/';
const CREMA_REPO = 'thebluescreen/crema-chords-onnx/resolve/302ae89e3ed7753fc8da9cb08274aff446d8fe47/';

export interface ModelSpec extends Omit<AnalysisModelInfo, 'cached'> {
  sha256: string;
}

export type ModelId = 'beat-this-logmel' | 'beat-this-small0' | 'beat-this-final0' | 'crema-chords';

/** Which Beat This! network to use: `light` (small0, the default) or `full` (final0). */
export type BeatModelChoice = 'light' | 'full';

export const MODEL_REGISTRY: Record<ModelId, ModelSpec> = {
  'beat-this-logmel': {
    id: 'beat-this-logmel',
    name: 'Beat This! (préparation du son)',
    role: 'temps et premiers temps',
    url: `${HF}${BEAT_REPO}logmel.onnx`,
    host: 'Hugging Face',
    licence: 'MIT',
    bytes: 4468830,
    sha256: 'f5afa499f5a42b05ea89a214561170cd4b76f92d67d3227f7c9833e8d79bbb43',
  },
  'beat-this-small0': {
    id: 'beat-this-small0',
    name: 'Beat This!',
    role: 'temps et premiers temps',
    url: `${HF}${BEAT_REPO}beat_this_small0.onnx`,
    host: 'Hugging Face',
    licence: 'MIT',
    bytes: 10555642,
    sha256: '53fda6e96afae7f44d898fa5f020272eda967a92839306bf7a3d0898fb8a0d9a',
  },
  'beat-this-final0': {
    id: 'beat-this-final0',
    name: 'Beat This! (version complète)',
    role: 'temps et premiers temps',
    url: `${HF}${BEAT_REPO}beat_this_final0.onnx`,
    host: 'Hugging Face',
    licence: 'MIT',
    bytes: 83162700,
    sha256: 'a7e2c68b27f9db6a73416017f784ea8551a01373f4955a98db018827760c4a14',
  },
  'crema-chords': {
    id: 'crema-chords',
    name: 'CREMA',
    role: 'accords',
    url: `${HF}${CREMA_REPO}crema_chords.onnx`,
    host: 'Hugging Face',
    licence: 'BSD-2-Clause',
    bytes: 2728454,
    sha256: '3222e641f23f668caabb48498d8d4db258216753af8d1da2753da002eb786c1e',
  },
};

export const BEAT_MODEL_ID: Record<BeatModelChoice, ModelId> = { light: 'beat-this-small0', full: 'beat-this-final0' };

/** The files an analysis needs, in the order they are downloaded. */
export function modelsFor(choice: BeatModelChoice = 'light'): ModelSpec[] {
  return [MODEL_REGISTRY['beat-this-logmel'], MODEL_REGISTRY[BEAT_MODEL_ID[choice]], MODEL_REGISTRY['crema-chords']];
}

/** The default set (what the mock analyser shows, and what the first analysis downloads). */
export const ANALYSIS_MODELS: readonly ModelSpec[] = modelsFor('light');
