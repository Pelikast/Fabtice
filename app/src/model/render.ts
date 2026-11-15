// The « Appliquer » render (lot 3), as the interface sees it. Since the
// owner's decision of 15 November (document version 5), the LAST applied
// render is kept with the piece (`KeptRender`, its samples on the device and
// in the `.fab` file): one at a time, a new « Appliquer » replaces it, never
// the original nor the separations.
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

/**
 * The last applied render, kept with the piece (version 5). It is heard again
 * (reopened, or the key and tempo set back) only when the live settings are
 * its `target` again; otherwise it waits, and « Appliquer » is offered.
 */
export interface KeptRender {
  target: RenderTarget;
  /** ISO date of the render. */
  renderedAt: string;
  /** One rendered audio per track of `target.audioKey`, in the same order. */
  tracks: { trackId: string; audioId: string; frames: number; channels: number }[];
}
