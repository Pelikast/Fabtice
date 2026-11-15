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
const TSUMUGI_REPO = 'anime-song/Tsumugi-Chords/resolve/a6731e1eea7353773188421702ff67049a84ce7a/';

export interface ModelSpec extends Omit<AnalysisModelInfo, 'cached'> {
  sha256: string;
}

export type ModelId = 'beat-this-logmel' | 'beat-this-small0' | 'beat-this-final0' | 'crema-chords' | 'tsumugi-chords';

/**
 * Which chord model reads the chords (« Réglages avancés », a device preference:
 * `chordModel.ts`). `crema`, the default: light, a few seconds. `fine`: Tsumugi-Chords,
 * much better on jazz and old records (bench, `engine/tsumugi.ts`) but several minutes per
 * piece and about 2.5 GB of memory; its weights (68 MB) are downloaded only when chosen.
 */
export type ChordModelChoice = 'crema' | 'fine';

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
  // The author's own weights, untouched (safetensors): the graph that reads them ships with
  // the app (`engine/tsumugiGraph.ts`). Non-commercial licence, shown before the download.
  'tsumugi-chords': {
    id: 'tsumugi-chords',
    name: 'Tsumugi-Chords',
    role: 'accords détaillés',
    url: `${HF}${TSUMUGI_REPO}chord-model.safetensors`,
    host: 'Hugging Face',
    licence: 'CC BY-NC 4.0 (usage non commercial)',
    bytes: 67647992,
    sha256: '6b62daef6d164ca433486abdda1b74a5e513c48297a4f57e0e19fdf536c0ee0a',
  },
};

/**
 * The fine model's graph without weights, shipped with the app (`assets/`, provenance in
 * `assets/README.md`), checked against this SHA-256 before use.
 */
export const TSUMUGI_GRAPH = {
  bytes: 1356051,
  sha256: '235901fcd3142a866d706aeba78df574fc0b0bc772f7eaa1d21f8885d5906977',
  codeLicence: 'MIT',
  code: 'https://github.com/anime-song/Tsumugi-Chords',
} as const;

/** Where each chord model comes from, for the setting (« source »). */
export const CHORD_MODEL_SOURCE: Record<ChordModelChoice, string> = {
  crema: 'https://huggingface.co/thebluescreen/crema-chords-onnx',
  fine: 'https://huggingface.co/anime-song/Tsumugi-Chords',
};

export const BEAT_MODEL_ID: Record<BeatModelChoice, ModelId> = { light: 'beat-this-small0', full: 'beat-this-final0' };

/**
 * The files an analysis needs, in the order they are downloaded. CREMA is always there:
 * with the fine model it is what the analysis falls back to if the fine model cannot run.
 */
export function modelsFor(choice: BeatModelChoice = 'light', chords: ChordModelChoice = 'crema'): ModelSpec[] {
  const base = [MODEL_REGISTRY['beat-this-logmel'], MODEL_REGISTRY[BEAT_MODEL_ID[choice]], MODEL_REGISTRY['crema-chords']];
  return chords === 'fine' ? [...base, MODEL_REGISTRY['tsumugi-chords']] : base;
}

/** The id of the chord model a result was read with (recorded in `AnalysisResult.analyser.models`). */
export const CHORD_MODEL_ID: Record<ChordModelChoice, ModelId> = { crema: 'crema-chords', fine: 'tsumugi-chords' };

/** The default set (what the mock analyser shows, and what the first analysis downloads). */
export const ANALYSIS_MODELS: readonly ModelSpec[] = modelsFor('light');
