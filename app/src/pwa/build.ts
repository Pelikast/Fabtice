// Which build of the web app this page is (C16): a random id drawn once per build by `vite.config.ts`, written
// into the page's code and into the service worker of the same build (`sw.js`, `BUILD`). A worker waiting with
// another id is a new version of the site (`update/updates.ts`).

declare const __FABTICE_BUILD__: string;

export const BUILD_ID: string = typeof __FABTICE_BUILD__ === 'string' ? __FABTICE_BUILD__ : 'dev';
