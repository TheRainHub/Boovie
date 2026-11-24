// Builds the static site in both languages: the Russian export at the root and the English one under /en/, each
// prerendered in its language (NEXT_PUBLIC_LANG), then the service worker over both. The files from public/ (store
// media, icons, workers) are shared: the English export's copies are dropped and it uses the root's. A script in
// each page's head sends a visitor to the right language before anything shows (src/app/layout.tsx).
//
// SITE_LOCALES=ru builds the Russian site alone.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const out = join(root, 'out');
const locales = (process.env.SITE_LOCALES ?? 'ru,en').split(',').map((s) => s.trim()).filter(Boolean);
const build = (lang) => {
  console.log(`\n── ${lang === 'en' ? 'English (/en/)' : 'Russian (/)'} ──`);
  execSync('npx next build', { stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_LANG: lang } });
};

const ruDir = join(root, '.site-ru');
rmSync(ruDir, { recursive: true, force: true });
build('ru');
renameSync(out, ruDir);

if (locales.includes('en')) {
  build('en');
  // Shared files live once, at the root: the English export's copies of public/ go (file by file — a folder such as
  // store/ also holds the English store page), and the folders they leave empty.
  const pub = join(root, 'public');
  (function drop(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) drop(p);
      else rmSync(join(out, relative(pub, p)), { force: true });
    }
  })(pub);
  (function prune(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) prune(p);
    }
    if (dir !== out && readdirSync(dir).length === 0) rmdirSync(dir);
  })(out);
  const enDir = join(ruDir, 'en');
  rmSync(enDir, { recursive: true, force: true });
  renameSync(out, enDir);

  // The English site's manifest: its own start and scope, the shared icons.
  const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8'));
  Object.assign(manifest, {
    name: 'Boowie — books and audiobooks',
    description: 'A reader for PDF, FB2 and EPUB and a player for MP3 and M4B audiobooks — offline.',
    lang: 'en',
    icons: manifest.icons.map((i) => ({ ...i, src: `../${i.src}` })),
  });
  writeFileSync(join(enDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
}

renameSync(ruDir, out);
if (!existsSync(join(out, 'index.html'))) throw new Error('the build left no out/index.html');
execSync('node scripts/generate-sw-manifest.mjs', { stdio: 'inherit' });
