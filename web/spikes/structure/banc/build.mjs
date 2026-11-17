// Bundles Tier R (TypeScript) with the app's code and the chords bench's
// harness (networks, `app` variant) into dist/. Nothing is copied: the app's
// engine and app/src/structure/bench/ are imported as they are.

import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

await build({
  entryPoints: ['run.ts'].map((f) => join(here, f)),
  outdir: join(root, 'dist'),
  outbase: here,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outExtension: { '.js': '.mjs' },
  external: ['onnxruntime-web', 'onnxruntime-node'],
  logLevel: 'warning',
  sourcemap: 'inline',
});
