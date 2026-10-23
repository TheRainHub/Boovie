// Copies the pdf.js worker into /public so it is served from the same origin (and works offline / in Capacitor).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const src = join(dirname(require.resolve('pdfjs-dist/package.json')), 'build', 'pdf.worker.min.mjs');
const out = join(process.cwd(), 'public', 'pdf.worker.min.mjs');
if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });
copyFileSync(src, out);
console.log('pdf.js worker →', out);
