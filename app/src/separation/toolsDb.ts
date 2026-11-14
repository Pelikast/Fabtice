// Where the downloaded separation tools are kept: a database of their own
// (same layout as the analysis tools', `analysis/models/store.ts`), so that
// their room shows and is freed on its own. Files are kept as Blobs (one tool
// weighs up to 353 MB): checking or listing them never reads them back.

/** Name of the database the separation tools are kept in. */
export const SEPARATION_TOOLS_DB = 'fabtice-separation-tools';

/** How the separation tools' store is opened (main thread and worker alike). */
export const SEPARATION_STORE_OPTIONS = { blobs: true } as const;
