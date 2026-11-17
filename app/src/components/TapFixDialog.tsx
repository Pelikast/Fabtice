// « Correction de la courbe en tapant le tempo » (C12). Opened from the bar
// menu (`ui/barDialogs.ts#openTapFix`); what it computes is `analysis/tapFix.ts`.

import { useStore } from 'zustand';
import { tapFixDialog } from '../ui/barDialogs';

export function TapFixDialog() {
  const at = useStore(tapFixDialog, (s) => s.at);
  if (!at) return null;
  return null;
}
