/**
 * Turns a picked file set (a folder, a multi-selection, or an expanded ZIP) into import units:
 * every directory that holds audio becomes one audiobook (files = chapters), CD/Disc/Часть subfolders are merged
 * into their parent, images next to the audio become cover candidates, documents stay separate books.
 */
import { splitAuthorTitle } from "../covers/names";
import { isAudioName } from "../parsers";

export interface PickedFile {
  blob: Blob;
  name: string;
  /** Path inside the picked folder / archive, e.g. "Ведьмак/CD1/01.mp3" ("" for loose files). */
  path: string;
}

export interface AudioGroup {
  key: string;
  folderName?: string;
  hint: { title?: string; author?: string };
  audio: PickedFile[];
  cover?: PickedFile;
}

export interface ImportPlan {
  audioGroups: AudioGroup[];
  documents: PickedFile[];
  ignored: PickedFile[];
}

const IMAGE = /\.(jpe?g|png|webp|gif|avif)$/i;
const DOC = /\.(epub|fb2|fb2\.zip|pdf|zip)$/i;
const DISC_DIR = /^(?:cd|disc|disk|диск|часть|part|том|vol(?:ume)?)[\s._-]*\d+$/i;
const COVER_NAME = /^(?:cover|folder|front|обложка|albumart|artwork|poster)(?:[\s._-].*)?\.(?:jpe?g|png|webp)$/i;

function dirOf(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts;
}

/** Directory key an audio file belongs to, with disc subfolders folded into the parent. */
function bookDir(path: string): string[] {
  const parts = dirOf(path);
  while (parts.length > 1 && DISC_DIR.test(parts[parts.length - 1])) parts.pop();
  return parts;
}

export function isImageName(name: string): boolean {
  return IMAGE.test(name);
}

export function planImport(files: PickedFile[]): ImportPlan {
  const groups = new Map<string, AudioGroup>();
  const images: PickedFile[] = [];
  const documents: PickedFile[] = [];
  const ignored: PickedFile[] = [];

  for (const f of files) {
    if (isAudioName(f.name) || f.blob.type.startsWith("audio/")) {
      const dir = bookDir(f.path);
      const key = dir.join("/");
      let g = groups.get(key);
      if (!g) {
        const folderName = dir[dir.length - 1];
        const split = folderName ? splitAuthorTitle(folderName) : null;
        g = { key, folderName, hint: split ?? (folderName ? { title: folderName } : {}), audio: [] };
        groups.set(key, g);
      }
      g.audio.push(f);
    } else if (IMAGE.test(f.name) || f.blob.type.startsWith("image/")) {
      images.push(f);
    } else if (DOC.test(f.name)) {
      documents.push(f);
    } else {
      ignored.push(f);
    }
  }

  // Cover: an image in the book's folder (or its disc subfolders); conventional names win, then the largest.
  for (const g of groups.values()) {
    const prefix = g.key ? `${g.key}/` : "";
    const candidates = images.filter((img) => {
      const dir = dirOf(img.path).join("/");
      return g.key ? dir === g.key || (dir.startsWith(prefix) && DISC_DIR.test(dir.slice(prefix.length).split("/")[0] ?? "")) : true;
    });
    g.cover = candidates.find((c) => COVER_NAME.test(c.name)) ?? [...candidates].sort((a, b) => b.blob.size - a.blob.size)[0];
  }
  return { audioGroups: [...groups.values()], documents, ignored };
}
