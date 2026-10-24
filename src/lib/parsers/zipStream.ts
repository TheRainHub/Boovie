/**
 * Streaming ZIP reader for large archives (e.g. an audiobook folder compressed in the iOS Files app).
 * Only the central directory is read up front; each entry is extracted on demand from a Blob slice
 * (stored entries are sliced directly, deflated ones go through DecompressionStream), so multi-GB archives
 * never have to fit in memory. Supports ZIP64 and UTF-8 / CP866 (Windows, Russian) file names.
 */

export interface ZipEntry {
  path: string;
  size: number;
  compressedSize: number;
  method: number;
  localHeaderOffset: number;
}

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);
const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true));

async function slice(blob: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

function decodeName(bytes: Uint8Array, utf8Flag: boolean): string {
  if (utf8Flag) return new TextDecoder("utf-8").decode(bytes);
  try {
    // macOS/iOS write UTF-8 without setting the flag; Windows archivers use the OEM code page (CP866 for Russian).
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("ibm866").decode(bytes);
  }
}

export async function isZip(blob: Blob): Promise<boolean> {
  if (blob.size < 22) return false;
  const v = await slice(blob, 0, 4);
  return u32(v, 0) === 0x04034b50;
}

export async function listZip(blob: Blob): Promise<ZipEntry[]> {
  const tailLen = Math.min(blob.size, 65557);
  const tailStart = blob.size - tailLen;
  const tail = await slice(blob, tailStart, blob.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP: не найден каталог архива");
  let count = u16(tail, eocd + 10);
  let cdSize = u32(tail, eocd + 12);
  let cdOffset = u32(tail, eocd + 16);
  // ZIP64 end of central directory locator sits right before the classic record.
  if ((cdOffset === 0xffffffff || count === 0xffff) && eocd >= 20 && u32(tail, eocd - 20) === 0x07064b50) {
    const rec = await slice(blob, u64(tail, eocd - 12), u64(tail, eocd - 12) + 56);
    if (u32(rec, 0) === 0x06064b50) {
      count = u64(rec, 32);
      cdSize = u64(rec, 40);
      cdOffset = u64(rec, 48);
    }
  }
  const cd = await slice(blob, cdOffset, cdOffset + cdSize);
  const entries: ZipEntry[] = [];
  let o = 0;
  for (let n = 0; n < count && o + 46 <= cd.byteLength; n++) {
    if (u32(cd, o) !== 0x02014b50) break;
    const flags = u16(cd, o + 8);
    const method = u16(cd, o + 10);
    let compressedSize = u32(cd, o + 20);
    let size = u32(cd, o + 24);
    const nameLen = u16(cd, o + 28);
    const extraLen = u16(cd, o + 30);
    const commentLen = u16(cd, o + 32);
    let localHeaderOffset = u32(cd, o + 42);
    const nameBytes = new Uint8Array(cd.buffer, cd.byteOffset + o + 46, nameLen);
    const path = decodeName(nameBytes, (flags & 0x800) !== 0);
    // ZIP64 extended information extra field.
    let e = o + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = u16(cd, e);
      const len = u16(cd, e + 2);
      if (id === 0x0001) {
        let p = e + 4;
        if (size === 0xffffffff) { size = u64(cd, p); p += 8; }
        if (compressedSize === 0xffffffff) { compressedSize = u64(cd, p); p += 8; }
        if (localHeaderOffset === 0xffffffff) { localHeaderOffset = u64(cd, p); }
      }
      e += 4 + len;
    }
    if (!path.endsWith("/")) entries.push({ path, size, compressedSize, method, localHeaderOffset });
    o += 46 + nameLen + extraLen + commentLen;
  }
  // Skip macOS resource forks and metadata.
  return entries.filter((en) => !/(^|\/)__MACOSX\//.test(en.path) && !/(^|\/)\._/.test(en.path) && !/(^|\/)\.DS_Store$/.test(en.path));
}

export async function extractZipEntry(blob: Blob, entry: ZipEntry, type = ""): Promise<Blob> {
  const head = await slice(blob, entry.localHeaderOffset, entry.localHeaderOffset + 30);
  if (u32(head, 0) !== 0x04034b50) throw new Error(`ZIP: повреждён заголовок ${entry.path}`);
  const dataStart = entry.localHeaderOffset + 30 + u16(head, 26) + u16(head, 28);
  const raw = blob.slice(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return type ? new Blob([raw], { type }) : raw;
  if (entry.method !== 8) throw new Error(`ZIP: неподдерживаемое сжатие (${entry.method}) в ${entry.path}`);
  const stream = raw.stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const out = await new Response(stream).blob();
  return type ? new Blob([out], { type }) : out;
}
