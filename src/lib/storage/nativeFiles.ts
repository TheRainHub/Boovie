/**
 * Files in the iOS/Android app's own data directory, through @capacitor/filesystem. Audio has to live here: the
 * native player can't read the WebView's storage. Files are written in base64 pieces over the bridge and read back
 * through the WebView's local server (Capacitor.convertFileSrc), which streams them without the bridge.
 */
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

const DIR = "titan-files";
/** A multiple of 3, so that every piece encodes to base64 on its own. */
const PIECE = 3 * 1024 * 1024;

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function write(path: string, directory: Directory, blob: Blob): Promise<void> {
  if (blob.size === 0) {
    await Filesystem.writeFile({ path, directory, data: "", recursive: true });
    return;
  }
  for (let at = 0; at < blob.size; at += PIECE) {
    const data = await base64(blob.slice(at, at + PIECE));
    if (at === 0) await Filesystem.writeFile({ path, directory, data, recursive: true });
    else await Filesystem.appendFile({ path, directory, data });
  }
}

/** Write a file of the library; returns its path for the FileRecord. */
export async function writeNativeFile(id: string, blob: Blob): Promise<string> {
  const path = `${DIR}/${id}`;
  try {
    await write(path, Directory.Data, blob);
  } catch (e) {
    await deleteNativeFile(path);
    throw e;
  }
  return path;
}

export async function deleteNativeFile(path: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path, directory: Directory.Data });
  } catch {
    /* already gone */
  }
}

let dataDir: Promise<string> | null = null;

/** file:// URI of a library file. The data directory is asked once: on iOS it changes between app updates. */
export async function nativeFileUri(path: string): Promise<string> {
  if (!dataDir) {
    dataDir = Filesystem.getUri({ path: "", directory: Directory.Data }).then((r) => r.uri.replace(/\/+$/, ""));
    dataDir.catch(() => (dataDir = null));
  }
  return `${await dataDir}/${path}`;
}

/** URL the WebView can load (an <img>, a fetch) for a library file. */
export async function nativeFileSrc(path: string): Promise<string> {
  return Capacitor.convertFileSrc(await nativeFileUri(path));
}

export async function readNativeFile(path: string): Promise<Blob | null> {
  try {
    const res = await fetch(await nativeFileSrc(path));
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}

/** A copy in the cache directory (e.g. a cover for the lock screen); returns its file:// URI. */
export async function cacheNativeCopy(name: string, blob: Blob): Promise<string> {
  const path = `${DIR}/${name}`;
  await write(path, Directory.Cache, blob);
  return (await Filesystem.getUri({ path, directory: Directory.Cache })).uri;
}
