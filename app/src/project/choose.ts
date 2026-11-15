// « Ouvrir un projet… »: the system's file picker for a `.fabtice` file. The
// field is made on the spot and dropped (the dialog keeps one file field, for
// audio); the click that calls this is the user's gesture.

import { startProjectOpen } from '../import/controller';
import { FILE_EXTENSION, PROJECT_MIME } from './fileFormat';
import { blobSource } from './zip';

export function chooseProjectFile(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = `${FILE_EXTENSION},${PROJECT_MIME}`;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void startProjectOpen(blobSource(file), file.name);
  });
  input.click();
}
