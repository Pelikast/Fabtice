export function rng(seed: number): () => number;
export function tonePiece(sr: number, seconds: number, cents: number, seed?: number): Float32Array;
export function beatActivations(frames: number, period: number, seed?: number, phase?: number): { beat: Float32Array; down: Float32Array; frames: number; fps: number };
export function downProbs(n: number, bpb: number, offset: number, seed?: number): number[];
export function chordFrames(
  progression: number[],
  options: { bars: number; bpb?: number; bpm?: number; start?: number; seed?: number },
): { T: number; fps: number; probs: Float32Array; pitch: Float32Array; bass: Float32Array; root: Float32Array };
export function steadyGrid(beats: number, bpb: number, start?: number, bpm?: number): { beats: number[]; numbers: number[]; beatsPerBar: number };
