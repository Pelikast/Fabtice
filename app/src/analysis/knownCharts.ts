// Where the analysis gets the known charts of a piece from (CLAUDE.md,
// analysis, means 3): the standards library lives on the main thread and is
// optional (downloaded on the user's request), so the runner asks a provider,
// registered by the standards code, for the candidates of the project's
// title. No provider, no title, no library: no known chart (the analysis does
// without). A provider that fails or is slow never holds the analysis back.

import type { KnownCharts } from './engine/chart';

export type KnownChartsProvider = (title: string) => Promise<KnownCharts | null> | KnownCharts | null;

let provider: KnownChartsProvider | null = null;

/** Registers (or, with null, removes) the source of known charts. */
export function setKnownChartsProvider(p: KnownChartsProvider | null): void {
  provider = p;
}

/** How long the analysis waits for the provider before going on without it. */
const WAIT_MS = 3000;

/** The candidates for a title, or null. Never throws. */
export async function knownChartsFor(title: string): Promise<KnownCharts | null> {
  const p = provider;
  if (!p || !title.trim()) return null;
  try {
    const r = await Promise.race([Promise.resolve(p(title)), new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS))]);
    return r && r.candidates.length ? r : null;
  } catch {
    return null;
  }
}
