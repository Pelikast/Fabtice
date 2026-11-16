// « Ouvrir un projet… »: the system's file picker for a `.fab` file.
//   - Chromium on the web: `showOpenFilePicker`, which gives a handle: the file
//     opened becomes the project's file (« Enregistrer » overwrites it);
//   - elsewhere (Safari, Firefox, the Mac app): a field made on the spot, outside
//     the dialog (which keeps one file field, for audio), and removed once the
//     picker answers. In the Mac app the path behind the file is kept by the
//     main process, which makes it the project's file.
// The click that calls this is the user's gesture. Once a file is chosen, the
// alert about changes not saved comes first (`project/leave.ts`), then the
// project replaces the open piece.

import { startProjectOpen } from '../import/controller';
import { getDesktopBridge } from '../platform/desktopBridge';
import { openNewPiece } from '../store/actions';
import { setCurrentFile } from './currentFile';
import { FILE_EXTENSION, PROJECT_MIME } from './fileFormat';
import { canOpenWithHandle, pickOpenHandle, type FileHandle } from './fileSystem';
import { confirmLeaveProject } from './leave';
import { blobSource } from './zip';

/** The field of the last picker opened, kept in the page until it answers (a detached field may never hear back). */
let pending: HTMLInputElement | null = null;

/**
 * A project file the user chose or dropped replaces the open piece, after the alert if there are changes not
 * saved; once open, it is the project's file (the handle on the web, the path kept by the Mac app).
 */
export async function openProjectFileFromUser(file: File, handle: FileHandle | null): Promise<void> {
  if (!(await confirmLeaveProject())) return;
  const bridge = getDesktopBridge();
  // Mac app: it goes in the recent projects.
  void bridge?.rememberProjectFile?.(file).catch(() => false);
  openNewPiece();
  await startProjectOpen(blobSource(file), file.name, async (projectId) => {
    if (handle) {
      setCurrentFile({ projectId, name: handle.name, ref: { kind: 'handle', handle } });
    } else if (bridge?.adoptChosenProjectFile) {
      const found = await bridge.adoptChosenProjectFile(projectId, file).catch(() => null);
      if (found) setCurrentFile({ projectId, name: found.name, ref: { kind: 'desktop' } });
    }
  });
}

async function chooseWithHandle(): Promise<void> {
  const handle = await pickOpenHandle();
  if (!handle) return;
  await openProjectFileFromUser(await handle.getFile(), handle);
}

export function chooseProjectFile(): void {
  // Chromium on the web: the picker that gives a handle (the Mac app has its own way to know the path).
  if (!getDesktopBridge() && canOpenWithHandle()) {
    void chooseWithHandle().catch(() => {});
    return;
  }
  pending?.remove();
  const input = document.createElement('input');
  pending = input;
  input.type = 'file';
  input.hidden = true;
  input.dataset.projet = '';
  input.accept = `${FILE_EXTENSION},${PROJECT_MIME}`;
  const done = () => {
    input.remove();
    if (pending === input) pending = null;
  };
  // Not removed on `cancel`: some pickers say « cancel » before the files come; the next picker replaces it.
  input.addEventListener('change', () => {
    done();
    const file = input.files?.[0];
    if (!file) return;
    void openProjectFileFromUser(file, null);
  });
  document.body.append(input);
  input.click();
}
