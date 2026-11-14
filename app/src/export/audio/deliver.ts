// Handing the exported file to the user, the same way in a browser and in the
// Mac app: a normal link to the file with its name (`download`), which the
// browser saves in its downloads and the Mac app turns into a real
// download (Electron asks where to save it). As with « Grille pour iReal
// Pro », the dialog shows the link itself: clicking it is the user's gesture,
// so no browser ever blocks it.

export interface Delivered {
  href: string;
  name: string;
  bytes: number;
  /** Frees the file's memory once it has been saved (or the dialog closes). */
  release: () => void;
}

export function deliverable(blob: Blob, name: string): Delivered {
  const href = URL.createObjectURL(blob);
  let released = false;
  return {
    href,
    name,
    bytes: blob.size,
    release: () => {
      if (released) return;
      released = true;
      // Not at once: a download started by the click may still be reading it.
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    },
  };
}
