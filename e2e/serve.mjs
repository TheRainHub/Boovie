// A static server for the built site (out/), as Vercel serves it: folders as their index.html, a trailing slash
// added, Range requests for audio. `node e2e/serve.mjs [port]`, or imported by e2e/run.mjs.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg', '.m4b': 'audio/mp4', '.pdf': 'application/pdf', '.epub': 'application/epub+zip',
  '.fb2': 'application/x-fictionbook+xml', '.zip': 'application/zip', '.ico': 'image/x-icon',
};

export function serve(root, port) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(root, path));
    if (!file.startsWith(root)) return res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) {
      if (!path.endsWith('/')) return res.writeHead(308, { Location: `${path}/` }).end();
      file = join(file, 'index.html');
    }
    if (!existsSync(file)) {
      res.writeHead(404, { 'Content-Type': TYPES['.html'] });
      return createReadStream(join(root, '404.html')).pipe(res);
    }
    const size = statSync(file).size;
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
    if (range) {
      const start = range[1] ? Number(range[1]) : size - Number(range[2]);
      const end = range[1] && range[2] ? Number(range[2]) : size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' });
      return createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] ?? 4173);
  await serve(join(process.cwd(), 'out'), port);
  console.log(`out/ on http://localhost:${port}`);
}
