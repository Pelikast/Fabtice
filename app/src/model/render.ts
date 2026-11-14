// The « Appliquer » render (lot 3), as the interface sees it. Never saved:
// the applied files are temporary and do not survive a relaunch.
//
// Two qualities (CLAUDE.md, « Deux qualités de rendu »): every change of key
// or tempo is heard at once with the light engine (preview). « Appliquer »
// renders the tracks again with the best engine (`render/`) and the player
// then plays those files as they are. Any new change goes back to preview
// until the next « Appliquer ».

/** What a render was made for: if any of it differs from the current state, the render is stale. */
export interface RenderTarget {
  semitones: number;
  cents: number;
  tempoRatio: number;
  /** « Conserver le timbre » (formants), an advanced setting. */
  formants: boolean;
  /** The audio ids of the tracks rendered, in order, joined: another set of tracks makes it stale. */
  audioKey: string;
}

export type RenderErrorCode = 'memory' | 'unsupported' | 'failed';

export type RenderStatus =
  | { status: 'none' }
  | { status: 'rendering'; target: RenderTarget }
  /** The render is in place and handed to the engine (heard while the target matches). */
  | { status: 'applied'; target: RenderTarget }
  | { status: 'error'; target: RenderTarget; code: RenderErrorCode };

export function sameTarget(a: RenderTarget, b: RenderTarget): boolean {
  return a.semitones === b.semitones && a.cents === b.cents && a.tempoRatio === b.tempoRatio && a.formants === b.formants && a.audioKey === b.audioKey;
}
