// Bundles the evaluation of the structural evidence (banc/structure.ts) into
// dist/structure.mjs, like banc/build.mjs does for the bench.

import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [join(here, 'structure.ts')],
  outfile: join(here, '..', 'dist', 'structure.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['onnxruntime-web', 'onnxruntime-node'],
  logLevel: 'warning',
  sourcemap: 'inline',
});
