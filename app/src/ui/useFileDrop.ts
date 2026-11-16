import { useEffect, useState } from 'react';
import { startFileImport } from '../import/controller';
import { openProjectFileFromUser } from '../project/choose';
import { handleOfDropped, type FileHandle } from '../project/fileSystem';
import { confirmLeaveProject } from '../project/leave';
import { isProjectFileName, looksLikeProjectFile } from '../project/open';
import { blobSource } from '../project/zip';
import { openNewPiece } from '../store/actions';
import { appStore } from '../store/store';

/**
 * Changes not saved in the open project: the alert first (« Enregistrer », « Ne pas enregistrer », « Annuler »).
 * Then a `.fab` project (by its name, or by its first bytes) opens as a project (its file, when the browser gives
 * a handle, becomes the project's file); anything else is imported as audio.
 */
async function openDropped(file: File, handle: Promise<FileHandle | null>): Promise<void> {
  const source = blobSource(file);
  if (isProjectFileName(file.name) || (await looksLikeProjectFile(source))) {
    await openProjectFileFromUser(file, await handle);
    return;
  }
  if (!(await confirmLeaveProject())) return;
  openNewPiece();
  await startFileImport(file);
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/**
 * Drag and drop of an audio file anywhere in the window. Returns true while a
 * file is dragged over the window (to show the drop overlay).
 */
export function useFileDrop(): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setOver(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const file = e.dataTransfer?.files[0];
      if (!file || appStore.getState().ui.import.kind === 'busy') return;
      // The handle must be asked for during the event itself.
      const handle = handleOfDropped(e.dataTransfer?.items[0]);
      void openDropped(file, handle);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
  return over;
}
