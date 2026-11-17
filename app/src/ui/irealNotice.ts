// The calm notice of « Ouvrir dans iReal Pro » in the web app (`export/irealOpen.ts`): « Si rien ne s'est ouvert… »
// after a link nobody took, or the sentence about a link too long to follow (the file is saved instead).
// Interface state, not saved.

import { createStore } from 'zustand/vanilla';

export type IRealNotice = 'asked' | 'tooLong';

export const irealNotice = createStore<{ notice: IRealNotice | null }>()(() => ({ notice: null }));

export function showIRealNotice(notice: IRealNotice): void {
  irealNotice.setState({ notice });
}

export function closeIRealNotice(): void {
  irealNotice.setState({ notice: null });
}
