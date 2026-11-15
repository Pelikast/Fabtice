// « Ouvrir un projet… »: the system's file picker for a `.fabtice` file. The
// field is made on the spot, outside the dialog (which keeps one file field,
// for audio), and removed once the picker answers; the click that calls this
// is the user's gesture.

import { startProjectOpen } from '../import/controller';
import { FILE_EXTENSION, PROJECT_MIME } from './fileFormat';
import { blobSource } from './zip';

/** The field of the last picker opened, kept in the page until it answers (a detached field may never hear back). */
let pending: HTMLInputElement | null = null;

export function chooseProjectFile(): void {
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
    if (file) void startProjectOpen(blobSource(file), file.name);
  });
  document.body.append(input);
  input.click();
}
