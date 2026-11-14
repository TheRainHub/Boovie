// Bundles the app's own web workers into /public, so they are plain same-origin scripts (served as they are on the
// web, offline and in the apps): the sounds for reading are made in public/ambient-worker.js.
import { build } from 'esbuild';
import { join } from 'node:path';

const root = process.cwd();
await build({
  entryPoints: [join(root, 'src/lib/audio/ambient.worker.ts')],
  outfile: join(root, 'public/ambient-worker.js'),
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
});
console.log('sounds worker → public/ambient-worker.js');
