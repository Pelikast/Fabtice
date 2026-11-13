// The AudioWorkletGlobalScope names the DOM library does not declare.

declare const sampleRate: number;
declare const currentFrame: number;
declare const currentTime: number;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: { processorOptions?: unknown });
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare function registerProcessor(name: string, processor: new (options?: { processorOptions?: unknown }) => AudioWorkletProcessor): void;
