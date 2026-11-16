// « Séparer les instruments » of the « Nouveau projet » window: unticked by default, everything selected when
// ticked, a click unselects one, nothing selected is the same as unticked.

import { beforeEach, describe, expect, it } from 'vitest';
import type { StemId } from '../model/separation';
import { closeNewPiece, openNewPiece } from '../store/actions';
import { toggleImportStem } from '../store/separationActions';
import { appStore } from '../store/store';
import { isSeparateTicked, reconcileStems, setSeparateOnImport } from './importChoice';

const OFFERED: StemId[] = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'winds', 'other'];
const stems = () => appStore.getState().ui.importStems;

beforeEach(() => {
  appStore.setState((s) => ({ ui: { ...s.ui, importStems: [], newPieceOpen: true } }));
});

describe('« Séparer les instruments »', () => {
  it('is unticked by default, and opens unticked each time', () => {
    expect(isSeparateTicked(stems())).toBe(false);
    setSeparateOnImport(true, OFFERED);
    openNewPiece('file');
    expect(stems()).toEqual([]);
  });

  it('ticked, selects every instrument the tool offers; unticked, none', () => {
    setSeparateOnImport(true, OFFERED);
    expect(stems()).toEqual(OFFERED);
    expect(isSeparateTicked(stems())).toBe(true);
    setSeparateOnImport(false, OFFERED);
    expect(stems()).toEqual([]);
  });

  it('a click unselects an instrument, another click selects it again; none left is unticked', () => {
    setSeparateOnImport(true, ['vocals', 'bass']);
    toggleImportStem('vocals');
    expect(stems()).toEqual(['bass']);
    expect(isSeparateTicked(stems())).toBe(true);
    toggleImportStem('vocals');
    expect(stems()).toEqual(['bass', 'vocals']);
    toggleImportStem('vocals');
    toggleImportStem('bass');
    expect(isSeparateTicked(stems())).toBe(false);
  });

  it('closing the window without importing forgets the choice', () => {
    appStore.setState((s) => ({ project: {} as never, ui: { ...s.ui, importStems: ['vocals'] } }));
    closeNewPiece();
    expect(stems()).toEqual([]);
    appStore.setState({ project: null });
  });

  it('follows the tool when it changes while ticked', () => {
    const sixSources: StemId[] = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'];
    expect(reconcileStems(OFFERED, OFFERED, sixSources)).toEqual(sixSources);
    // Something unselected by hand stays unselected; a newly offered instrument joins.
    expect(reconcileStems(['vocals', 'bass'], sixSources, OFFERED)).toEqual(['vocals', 'bass', 'winds']);
    // Unticked: nothing happens.
    expect(reconcileStems([], [], OFFERED)).toEqual([]);
  });
});
