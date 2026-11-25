// End-to-end checks of the built site: `npm run build`, then `npm run e2e` (or `npm run e2e -- lang`). Serves out/
// on a local port and runs each check in a browser — Playwright's Chromium (`npx playwright-core install chromium`),
// or the one in CHROMIUM_PATH.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from './serve.mjs';

const root = join(process.cwd(), 'out');
if (!existsSync(join(root, 'index.html'))) {
  console.error('No out/: run `npm run build` first.');
  process.exit(1);
}
const port = Number(process.env.PORT ?? 4173);
const server = await serve(root, port);
const only = process.argv.slice(2);
const suites = ['lang', 'install', 'repost'].filter((s) => !only.length || only.includes(s));
let failed = 0;
for (const s of suites) {
  console.log(`\n── ${s} ──`);
  // Asynchronously: the server answers from this process meanwhile.
  const status = await new Promise((resolve) =>
    spawn(process.execPath, [join('e2e', `${s}.mjs`)], { stdio: 'inherit', env: { ...process.env, BASE: `http://localhost:${port}` } }).on('exit', resolve),
  );
  if (status !== 0) failed++;
}
server.close();
console.log(failed ? `\n${failed} of ${suites.length} suites failed` : `\nall ${suites.length} suites passed`);
process.exit(failed ? 1 : 0);
