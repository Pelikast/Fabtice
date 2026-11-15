// Bundles the bench (TypeScript) with the app's analysis engine into dist/.
// The engine is imported from app/src/analysis/engine as is: nothing is copied.
// Every file of banc/variantes/ becomes its own entry, so `--variant <name>`
// can load it; shared code goes into common chunks.

import { build } from 'esbuild';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const variants = readdirSync(join(here, 'variantes')).filter((f) => f.endsWith('.ts')).map((f) => join(here, 'variantes', f));

await build({
  entryPoints: ['run.ts', 'verif-demo.ts'].map((f) => join(here, f)).filter((f) => existsSync(f)).concat(variants),
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
