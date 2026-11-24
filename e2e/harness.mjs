// What the end-to-end checks share: a browser (CHROMIUM_PATH, or Playwright's own), the site's address, and
// ok/FAIL lines with a summary.
import { chromium } from 'playwright-core';

export const BASE = process.env.BASE ?? 'http://localhost:4173';

export async function browser() {
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
}

export function checks(name) {
  const fails = [];
  return {
    check(ok, what) {
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
      if (!ok) fails.push(what);
    },
    log: (...a) => console.log('    ', ...a),
    done() {
      console.log(fails.length ? `${name}: ${fails.length} failed` : `${name}: all passed`);
      return fails.length;
    },
  };
}
