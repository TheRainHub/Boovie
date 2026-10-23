// Post-build: write out/sw.js with the precache list of the static export (app shell, chunks, covers, icons).
// Large store media (/store/books, /store/audio) is excluded: the app downloads it into IndexedDB/OPFS on demand.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const out = join(process.cwd(), "out");
const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(out);

const hash = createHash("sha256");
const urls = [];
for (const f of files.sort()) {
  const rel = "/" + relative(out, f).split(sep).join("/");
  if (rel.startsWith("/store/books/") || rel.startsWith("/store/audio/") || rel === "/sw.js") continue;
  if (rel.endsWith(".map") || rel.split("/").pop().startsWith(".")) continue;
  hash.update(rel).update(readFileSync(f));
  urls.push(base + (rel.endsWith("/index.html") ? rel.slice(0, -"index.html".length) : rel));
}
const version = hash.digest("hex").slice(0, 12);
const template = readFileSync(join(process.cwd(), "scripts/sw-template.js"), "utf8");
writeFileSync(join(out, "sw.js"), template.replace("__BUILD_VERSION__", version).replace("__PRECACHE__", JSON.stringify(urls)));
console.log(`sw.js: ${urls.length} precached URLs, version ${version}`);
