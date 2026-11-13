// Model tiers of the separation spike. Every file is fetched from a public Hugging Face
// repository at a pinned revision and checked against its SHA-256 before use.

const hf = (repo, rev, file) => `https://huggingface.co/${repo}/resolve/${rev}/${file}`;

export const STEM_LABELS = {
  vocals: 'Voix',
  drums: 'Batterie',
  bass: 'Basse',
  guitar: 'Guitare',
  piano: 'Piano',
  other: 'Autres',
};

export const MODELS = {
  // SCNet (Tong et al., ICASSP 2024), author's MUSDB18-HQ checkpoint, int8 weights by audiojs.
  leger: {
    id: 'leger',
    label: 'Léger',
    name: 'SCNet (int8)',
    summary: '4 pistes · 13 Mo · pensé pour le téléphone',
    url: hf('audiojs/scnet', 'e71bcdb42bce1d62b7fae25ba90fcbcf90f73f46', 'scnet.int8.onnx'),
    bytes: 12900277,
    sha256: '98228931494151762a1c4ab1ec7899a894b1f81fd4a509921a9d2f9bacc50845',
    licence: 'code et poids MIT (confirmé par l’auteur) ; entraîné sur MUSDB18-HQ',
    family: 'msst',
    stems: ['drums', 'bass', 'other', 'vocals'],
    io: 'scnet',
    segment: 485100,          // 11 s at 44.1 kHz
    overlap: 2,               // MSST config says 4; 2 halves the time for ~0.1 dB
    normalize: true,
    stft: { nfft: 4096, hop: 1024, window: 'ones', normalized: true },
  },
  // Hybrid Transformer Demucs, 6 sources (Rouard, Massa, Défossez 2023), fp16 weights by unblend.
  standard: {
    id: 'standard',
    label: 'Standard',
    name: 'HTDemucs 6 sources (fp16)',
    summary: '6 pistes · 56 Mo · ordinateur sans carte graphique puissante',
    url: hf('Ryan5453/unblend', '30b749fd691312b1e4b3f8fe79df0b51cde836cd', 'htdemucs_6s_fp16.onnx'),
    bytes: 55845005,
    sha256: '8cde625ece6fddb022a1a021cc1f2bef65a16711c20710e0e96e317f38fe994c',
    licence: 'code MIT ; licence des poids non accordée (probablement CC BY-NC selon l’auteur)',
    family: 'demucs',
    stems: ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'],
    io: 'unblend-demucs',
    segment: 343980,          // 7.8 s
    overlap: 0.25,
    stft: { nfft: 4096, hop: 1024, window: 'hann', normalized: true },
  },
  // BS-RoFormer "SW" 6-stem checkpoint, exported for the browser by elicwhite (4 s graph).
  maximal: {
    id: 'maximal',
    label: 'Maximal',
    name: 'BS-RoFormer SW (poids fp16)',
    summary: '6 pistes · 353 Mo · carte graphique puissante (Mac M1 et plus)',
    url: hf('elicwhite/bs-roformer-sw-6stem-onnx', 'a744f80957374e1735ad70fa122670b7961da8cc', 'bs_roformer_sw_6stem_fp16.onnx'),
    bytes: 352778874,
    sha256: 'd3d2bac77a7023282cb5f35a5807179e34076b60589867b572275f1a8ec36444',
    licence: 'poids sans licence ni provenance connue : test uniquement',
    family: 'msst',
    stems: ['bass', 'drums', 'other', 'vocals', 'guitar', 'piano'],
    io: 'roformer',
    segment: 176400,          // the graph is traced at 4 s
    overlap: 2,
    normalize: false,
    stft: { nfft: 2048, hop: 512, window: 'hann', normalized: false, zeroDC: true }, // BSRoformer zero_dc
  },
};

export const TIER_ORDER = ['leger', 'standard', 'maximal'];
