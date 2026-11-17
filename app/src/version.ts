// The version number of the app (C17): the one of app/package.json, set at build time by vite.config.ts.
// desktop/package.json carries the same number (a unit test of desktop/ checks it); the Mac app reads its own.

declare const __FABTICE_VERSION__: string;

export const APP_VERSION: string = __FABTICE_VERSION__;
