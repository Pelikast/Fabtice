// The step of the start-up message of the chord charts, read from the app as it is now: the standards state,
// the windows that are open (the message waits its turn) and what this device can download.

import { otherWindowOpen } from '../ui/windows';
import { downloadableCollections, messageStep, standardsStore, type MessageStep } from './offer';

export function currentMessageStep(): MessageStep {
  const state = standardsStore.getState();
  // The cheap answers first: the list is only looked at when the question could come.
  if (!state.messageEnabled) return null;
  return messageStep(state, { otherWindowOpen: otherWindowOpen(), downloadable: downloadableCollections().length });
}

/** True while the message's window is on screen (the commands of the menu are then greyed out). */
export function standardsMessageOpen(): boolean {
  return currentMessageStep() !== null;
}
