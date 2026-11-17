// « Changer la signature rythmique » (C13). Opened from the bar menu
// (`ui/barDialogs.ts#openMeterDialog`); it calls `store/meterActions.ts`.

import { useStore } from 'zustand';
import { meterDialog } from '../ui/barDialogs';

export function MeterDialog() {
  const at = useStore(meterDialog, (s) => s.at);
  if (!at) return null;
  return null;
}
