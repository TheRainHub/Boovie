/**
 * Cover search by title/author across public catalogues (no API keys):
 *  - Apple Books via the iTunes Search API (best for audiobooks, has Russian storefront results)
 *  - Google Books volumes API
 *  - Open Library search + covers
 * Results are ranked by title/author similarity. Images that can be fetched with CORS are stored offline;
 * others can still be used as a remote cover URL.
 */
import { cleanTitle, similarity, surname } from "./names";

export interface CoverCandidate {
  id: string;
  source: "Apple Books" | "Google Books" | "Open Library";
  title: string;
  author?: string;
  /** Small image for the picker grid. */
  thumb: string;
  /** Largest available image. */
  full: string;
  square: boolean;
  score: number;
}

const TIMEOUT = 7000;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), mode: "cors", credentials: "omit" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

interface ItunesResult {
  collectionId?: number;
  trackId?: number;
  collectionName?: string;
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
}

async function searchApple(term: string, kind: "audio" | "text"): Promise<Omit<CoverCandidate, "score">[]> {
  const media = kind === "audio" ? "audiobook" : "ebook";
  const out: Omit<CoverCandidate, "score">[] = [];
  for (const country of ["RU", "US"]) {
    const data = await getJson<{ results?: ItunesResult[] }>(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=${media}&country=${country}&limit=12`,
    );
    for (const r of data?.results ?? []) {
      if (!r.artworkUrl100) continue;
      out.push({
        id: `apple-${r.collectionId ?? r.trackId}`,
        source: "Apple Books",
        title: r.collectionName ?? r.trackName ?? "",
        author: r.artistName,
        thumb: r.artworkUrl100.replace(/\/\d+x\d+bb\./, "/300x300bb."),
        full: r.artworkUrl100.replace(/\/\d+x\d+bb\./, "/1000x1000bb."),
        square: kind === "audio",
      });
    }
    if (out.length >= 6) break;
  }
  return out;
}

interface GoogleVolume {
  id: string;
  volumeInfo?: { title?: string; authors?: string[]; imageLinks?: { thumbnail?: string; smallThumbnail?: string } };
}

async function searchGoogle(title: string, author?: string): Promise<Omit<CoverCandidate, "score">[]> {
  const q = `intitle:${title}${author ? ` inauthor:${surname(author)}` : ""}`;
  const data = await getJson<{ items?: GoogleVolume[] }>(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=12&printType=books`,
  );
  return (data?.items ?? [])
    .filter((v) => v.volumeInfo?.imageLinks?.thumbnail)
    .map((v) => {
      const base = v.volumeInfo!.imageLinks!.thumbnail!.replace(/^http:/, "https:").replace(/&edge=curl/, "");
      return {
        id: `google-${v.id}`,
        source: "Google Books" as const,
        title: v.volumeInfo!.title ?? "",
        author: v.volumeInfo!.authors?.join(", "),
        thumb: base,
        full: base.replace(/zoom=\d/, "zoom=0"),
        square: false,
      };
    });
}

interface OpenLibraryDoc {
  key: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
}

async function searchOpenLibrary(title: string, author?: string): Promise<Omit<CoverCandidate, "score">[]> {
  const params = new URLSearchParams({ title, limit: "12", fields: "key,title,author_name,cover_i" });
  if (author) params.set("author", surname(author));
  const data = await getJson<{ docs?: OpenLibraryDoc[] }>(`https://openlibrary.org/search.json?${params}`);
  return (data?.docs ?? [])
    .filter((d) => d.cover_i)
    .map((d) => ({
      id: `ol-${d.cover_i}`,
      source: "Open Library" as const,
      title: d.title ?? "",
      author: d.author_name?.join(", "),
      thumb: `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`,
      full: `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`,
      square: false,
    }));
}

export function scoreCandidate(c: Pick<CoverCandidate, "title" | "author" | "source">, title: string, author?: string, kind?: "audio" | "text"): number {
  let s = similarity(cleanTitle(c.title), title);
  const sn = surname(author);
  if (sn && c.author && surname(c.author) === sn) s += 0.35;
  else if (sn && c.author?.toLowerCase().replace(/ё/g, "е").includes(sn)) s += 0.25;
  if (kind === "audio" && c.source === "Apple Books") s += 0.05;
  return Math.round(s * 100) / 100;
}

export async function searchCovers(query: { title: string; author?: string; kind: "audio" | "text" }): Promise<CoverCandidate[]> {
  const title = cleanTitle(query.title);
  const author = query.author && !/неизвестн/i.test(query.author) ? query.author : undefined;
  const term = [title, author && surname(author)].filter(Boolean).join(" ");
  const batches = await Promise.all([
    searchApple(term, query.kind).catch(() => []),
    searchGoogle(title, author).catch(() => []),
    searchOpenLibrary(title, author).catch(() => []),
  ]);
  const seen = new Set<string>();
  return batches
    .flat()
    .filter((c) => (seen.has(c.full) ? false : (seen.add(c.full), true)))
    .map((c) => ({ ...c, score: scoreCandidate(c, title, author, query.kind) }))
    .sort((a, b) => b.score - a.score);
}

/** Download an image for offline use; null when the host does not allow cross-origin reads. */
export async function downloadCover(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    // Open Library returns a 1×1 placeholder (~800 B) when a cover is missing.
    return blob.type.startsWith("image/") && blob.size > 2000 ? blob : null;
  } catch {
    return null;
  }
}
