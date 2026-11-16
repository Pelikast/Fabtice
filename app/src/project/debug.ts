// What the browser checks reach through `window.__fabtice.project` (`?debug`, `?demo`): « Enregistrer », the file of
// the open project, the alert about changes not saved. Nothing here is used by the interface itself.

export { getCurrentFile, setCurrentFile, clearCurrentFile } from './currentFile';
export { confirmLeaveProject, requestNewProject } from './leave';
export { saveProject, saveProjectAs } from './saveFlow';
export { windowTitle } from './windowState';
