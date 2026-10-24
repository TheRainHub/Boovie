"use client";

/**
 * Your Librarr server as a source of books: its OPDS catalog (`/opds/books`) is listed in the store and any book
 * can be downloaded into Boowie (then it is parsed and kept offline like a local file). Requests carry the API key
 * as `?apikey=` — Librarr answers those from any origin.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { importLocalFiles } from "../library/importer";
import { getDB } from "../storage/db";
import { formatLabel, parseOpds, resolveHref, type OpdsEntry, type OpdsFeed } from "./opds";

interface LibrarrPrefs {
  url: string;
  apiKey: string;
  /** OPDS entry id → Boowie book id, for «already downloaded». */
  owned: Record<string, string>;
  set: (patch: Partial<Omit<LibrarrPrefs, "set">>) => void;
}

export const useLibrarr = create<LibrarrPrefs>()(
  persist((set) => ({ url: "", apiKey: "", owned: {}, set: (patch) => set(patch) }), { name: "boowie-librarr", version: 1 }),
);

export class LibrarrError extends Error {}

/** «nas:5050» → «https://nas:5050»; trailing slashes and a pasted `/opds` are dropped. */
export function normalizeServerUrl(input: string): string {
  let u = input.trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, "").replace(/\/opds$/i, "");
}

function withKey(href: string, key: string): string {
  if (!key) return href;
  const u = new URL(href);
  u.searchParams.set("apikey", key);
  return u.href;
}

async function get(href: string, key: string): Promise<Response> {
  if (typeof location !== "undefined" && location.protocol === "https:" && href.startsWith("http:")) {
    throw new LibrarrError("Браузер не пустит приложение с https-сайта к серверу по http. Откройте Librarr по HTTPS (например, через Tailscale или Cloudflare Tunnel) и укажите https-адрес.");
  }
  let res: Response;
  try {
    res = await fetch(withKey(href, key), { headers: { accept: "application/atom+xml, application/xml, */*" } });
  } catch {
    throw new LibrarrError("Не удалось подключиться к Librarr. Проверьте адрес и что сервер доступен с этого устройства (HTTPS, тот же Wi-Fi или VPN).");
  }
  if (res.status === 401 || res.status === 403) throw new LibrarrError("Librarr не принял ключ. Нужен API_KEY из настроек сервера.");
  if (!res.ok) throw new LibrarrError(`Librarr ответил ошибкой ${res.status}.`);
  return res;
}

export async function fetchFeed(href: string): Promise<OpdsFeed> {
  const { url, apiKey } = useLibrarr.getState();
  const res = await get(href, apiKey);
  return parseOpds(await res.text(), url);
}

/** First page of the whole library (ebooks and audiobooks); follow `next` for more. */
export function libraryFeedUrl(type?: "ebook" | "audiobook"): string {
  const { url } = useLibrarr.getState();
  return `${url}/opds/books${type ? `?type=${type}` : ""}`;
}

/** Check a server before saving it. */
export async function testConnection(url: string, apiKey: string): Promise<{ title: string; total?: number }> {
  const base = normalizeServerUrl(url);
  const res = await get(`${base}/opds/books`, apiKey);
  const feed = parseOpds(await res.text(), base);
  return { title: feed.title, total: feed.total ?? feed.entries.length };
}

/** The file's real type: Librarr serves FB2 and others as octet-stream, but its `dc:format` says what they are. */
function realType(entry: OpdsEntry, served: string): string {
  const known = (t?: string | null) => !!t && !/octet-stream|^binary/i.test(t);
  return [served, ...entry.formats, entry.acquisitions[0]?.type].find(known) ?? served;
}

function fileNameFor(entry: OpdsEntry, res: Response, type: string): string {
  // Cross-origin JS only sees Content-Disposition when the server exposes it, so the name usually comes from the type.
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
  if (m) {
    try {
      return decodeURIComponent(m[1] ?? m[2]);
    } catch {
      return m[1] ?? m[2];
    }
  }
  const ext = { EPUB: "epub", FB2: "fb2", PDF: "pdf", MP3: "mp3", M4B: "m4b", ZIP: "zip" }[formatLabel(type)] ?? "bin";
  return `${entry.title.replace(/[\\/:*?"<>|]+/g, " ").trim()}.${ext}`;
}

/** Download a catalog entry into the library; returns the new book id. */
export async function downloadEntry(entry: OpdsEntry): Promise<string | null> {
  const { apiKey, owned, set } = useLibrarr.getState();
  const link = entry.acquisitions[0];
  if (!link) throw new LibrarrError("У этой книги нет файла для скачивания.");
  const res = await get(link.href, apiKey);
  const type = realType(entry, res.headers.get("content-type") ?? link.type ?? "");
  if (/text\/html/i.test(type)) throw new LibrarrError("Librarr отдал папку, а не файл. Аудиокниги из нескольких файлов скачивайте одним M4B или ZIP.");
  const blob = await res.blob();
  const file = new File([blob], fileNameFor(entry, res, type), { type: type.includes("/") ? type : blob.type });
  const [id] = await importLocalFiles([file]);
  if (id) {
    set({ owned: { ...owned, [entry.id]: id } });
    return id;
  }
  return null;
}

/** Entry ids whose downloaded book is still in the library. */
export async function ownedEntries(): Promise<Map<string, string>> {
  const { owned } = useLibrarr.getState();
  const ids = Object.values(owned);
  const books = await getDB().books.bulkGet(ids);
  const alive = new Set(books.filter(Boolean).map((b) => b!.id));
  return new Map(Object.entries(owned).filter(([, id]) => alive.has(id)));
}

export { resolveHref };
