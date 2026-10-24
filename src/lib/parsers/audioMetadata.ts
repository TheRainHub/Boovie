/**
 * Minimal, dependency-free audio metadata readers working on Blob slices (files are never fully loaded):
 *  - ID3v2.2/2.3/2.4 text frames, APIC/PIC cover art, CHAP + CTOC chapters
 *  - MPEG audio duration from the Xing/Info/VBRI header or the CBR bitrate
 *  - MP4/M4A/M4B: mvhd duration, iTunes ilst tags + covr, Nero `chpl` chapters and QuickTime chapter tracks
 */

export interface AudioChapterMark {
  title: string;
  start: number; // seconds
  end?: number;
}

export interface AudioMetadata {
  container: "mp3" | "mp4" | "unknown";
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  composer?: string;
  track?: number;
  disc?: number;
  duration?: number;
  cover?: Blob;
  chapters: AudioChapterMark[];
  /** Sample entry of the sound track (mp4a, alac, drms, enca…) for MP4 containers. */
  codec?: string;
  /** FairPlay (drms) or Common Encryption (enca): not playable outside the vendor's app. */
  encrypted?: boolean;
}

async function read(blob: Blob, start: number, length: number): Promise<Uint8Array> {
  const end = Math.min(blob.size, start + length);
  if (start >= end) return new Uint8Array(0);
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u24 = (b: Uint8Array, o: number) => (b[o] << 16) + (b[o + 1] << 8) + b[o + 2];
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) + b[o + 1];
const u64 = (b: Uint8Array, o: number) => u32(b, o) * 2 ** 32 + u32(b, o + 4);
const syncsafe = (b: Uint8Array, o: number) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const fourcc = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

/** ISO-8859-1 strings in Russian MP3s are very often actually windows-1251. */
function decodeLatin1OrCp1251(bytes: Uint8Array): string {
  let high = 0;
  for (const c of bytes) if (c >= 0xc0) high++;
  const enc = high > bytes.length * 0.3 ? "windows-1251" : "iso-8859-1";
  return new TextDecoder(enc).decode(bytes);
}

function decodeId3Text(enc: number, bytes: Uint8Array): string {
  let s: string;
  if (enc === 1 || enc === 2) {
    let le = enc === 1;
    let start = 0;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) { le = true; start = 2; }
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) { le = false; start = 2; }
    s = new TextDecoder(le ? "utf-16le" : "utf-16be").decode(bytes.subarray(start));
  } else if (enc === 3) {
    s = new TextDecoder("utf-8").decode(bytes);
  } else {
    s = decodeLatin1OrCp1251(bytes);
  }
  return s.replace(/\u0000+$/g, "").split("\u0000")[0].trim();
}

/** Find the end of a null-terminated string honoring 2-byte terminators for UTF-16. */
function strEnd(b: Uint8Array, from: number, enc: number): number {
  if (enc === 1 || enc === 2) {
    for (let i = from; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i;
    return b.length;
  }
  const i = b.indexOf(0, from);
  return i < 0 ? b.length : i;
}

interface Id3Frame {
  id: string;
  data: Uint8Array;
}

function parseId3Frames(b: Uint8Array, start: number, end: number, major: number): Id3Frame[] {
  const frames: Id3Frame[] = [];
  let o = start;
  const idLen = major === 2 ? 3 : 4;
  const headLen = major === 2 ? 6 : 10;
  while (o + headLen <= end) {
    if (b[o] === 0) break; // padding
    const id = String.fromCharCode(...b.subarray(o, o + idLen));
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
    const size = major === 2 ? u24(b, o + 3) : major === 4 ? syncsafe(b, o + 4) : u32(b, o + 4);
    const dataStart = o + headLen;
    if (size <= 0 || dataStart + size > end) break;
    frames.push({ id, data: b.subarray(dataStart, dataStart + size) });
    o = dataStart + size;
  }
  return frames;
}

function textFrame(f: Id3Frame): string {
  return decodeId3Text(f.data[0], f.data.subarray(1));
}

function parseApic(f: Id3Frame, major: number): Blob | undefined {
  const d = f.data;
  const enc = d[0];
  let o = 1;
  let mime: string;
  if (major === 2) {
    const fmt = String.fromCharCode(d[1], d[2], d[3]).toUpperCase();
    mime = fmt === "PNG" ? "image/png" : "image/jpeg";
    o = 4;
  } else {
    const e = d.indexOf(0, 1);
    mime = new TextDecoder("iso-8859-1").decode(d.subarray(1, e)) || "image/jpeg";
    if (!mime.includes("/")) mime = `image/${mime.toLowerCase() === "jpg" ? "jpeg" : mime.toLowerCase()}`;
    o = e + 1;
  }
  o += 1; // picture type
  const descEnd = strEnd(d, o, enc);
  o = descEnd + (enc === 1 || enc === 2 ? 2 : 1);
  if (o >= d.length) return undefined;
  return new Blob([d.slice(o)], { type: mime });
}

interface Id3Result {
  tagSize: number;
  meta: Partial<AudioMetadata>;
}

async function readId3(blob: Blob): Promise<Id3Result | null> {
  const head = await read(blob, 0, 10);
  if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return null;
  const major = head[3];
  const flags = head[5];
  const size = syncsafe(head, 6);
  const tagSize = 10 + size + (flags & 0x10 ? 10 : 0);
  const b = await read(blob, 0, 10 + size);
  let start = 10;
  if (flags & 0x40) start += major === 4 ? syncsafe(b, 10) : u32(b, 10) + 4;
  const frames = parseId3Frames(b, start, b.length, major);
  const meta: Partial<AudioMetadata> = { chapters: [] };
  const chaps = new Map<string, AudioChapterMark>();
  let order: string[] = [];
  for (const f of frames) {
    switch (f.id) {
      case "TIT2": case "TT2": meta.title = textFrame(f); break;
      case "TPE1": case "TP1": meta.artist = textFrame(f); break;
      case "TPE2": case "TP2": meta.albumArtist = textFrame(f); break;
      case "TALB": case "TAL": meta.album = textFrame(f); break;
      case "TCOM": case "TCM": meta.composer = textFrame(f); break;
      case "TRCK": case "TRK": meta.track = parseInt(textFrame(f), 10) || undefined; break;
      case "TPOS": case "TPA": meta.disc = parseInt(textFrame(f), 10) || undefined; break;
      case "TLEN": { const ms = parseInt(textFrame(f), 10); if (ms > 0) meta.duration = ms / 1000; break; }
      case "APIC": case "PIC": if (!meta.cover) meta.cover = parseApic(f, major); break;
      case "CHAP": {
        const d = f.data;
        const idEnd = d.indexOf(0);
        const elementId = new TextDecoder("iso-8859-1").decode(d.subarray(0, idEnd));
        const o = idEnd + 1;
        const startMs = u32(d, o);
        const endMs = u32(d, o + 4);
        const sub = parseId3Frames(d, o + 16, d.length, major);
        const t = sub.find((s) => s.id === "TIT2");
        chaps.set(elementId, { title: t ? textFrame(t) : "", start: startMs / 1000, end: endMs / 1000 });
        break;
      }
      case "CTOC": {
        const d = f.data;
        const idEnd = d.indexOf(0);
        const tocFlags = d[idEnd + 1];
        const count = d[idEnd + 2];
        let o = idEnd + 3;
        const ids: string[] = [];
        for (let i = 0; i < count && o < d.length; i++) {
          const e = d.indexOf(0, o);
          ids.push(new TextDecoder("iso-8859-1").decode(d.subarray(o, e < 0 ? d.length : e)));
          o = (e < 0 ? d.length : e) + 1;
        }
        // Prefer the top-level table of contents.
        if (tocFlags & 0x02 || order.length === 0) order = ids;
        break;
      }
    }
  }
  const list = order.length ? order.map((id) => chaps.get(id)).filter((c): c is AudioChapterMark => !!c) : [...chaps.values()];
  meta.chapters = list.sort((a, b) => a.start - b.start);
  return { tagSize, meta };
}

const MPEG_BITRATES: Record<string, number[]> = {
  "1-1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  "1-2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  "1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  "2-1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  "2-2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  "2-3": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MPEG_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

interface MpegHeader {
  bitrate: number;
  sampleRate: number;
  samplesPerFrame: number;
  frameLength: number;
  mpeg1: boolean;
  mono: boolean;
}

function parseMpegHeader(b: Uint8Array, o: number): MpegHeader | null {
  if (b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return null;
  const ver = (b[o + 1] >> 3) & 3;
  const layerBits = (b[o + 1] >> 1) & 3;
  if (ver === 1 || layerBits === 0) return null;
  const layer = 4 - layerBits;
  const bri = b[o + 2] >> 4;
  const sri = (b[o + 2] >> 2) & 3;
  if (bri === 0 || bri === 15 || sri === 3) return null;
  const mpeg1 = ver === 3;
  const bitrate = MPEG_BITRATES[`${mpeg1 ? 1 : 2}-${layer}`][bri] * 1000;
  const sampleRate = MPEG_RATES[ver][sri];
  const padding = (b[o + 2] >> 1) & 1;
  const samplesPerFrame = layer === 1 ? 384 : layer === 2 || mpeg1 ? 1152 : 576;
  const frameLength = layer === 1
    ? (Math.floor((12 * bitrate) / sampleRate) + padding) * 4
    : Math.floor(((samplesPerFrame / 8) * bitrate) / sampleRate) + padding;
  return { bitrate, sampleRate, samplesPerFrame, frameLength, mpeg1, mono: b[o + 3] >> 6 === 3 };
}

/**
 * The bare MPEG frames of an MP3: without the ID3v2 header, the Xing/Info/VBRI frame and a trailing ID3v1 tag.
 * Pieces cut this way can be concatenated into one playable file (synthesized speech arrives in chunks), and the
 * result is timed from its bitrate instead of a header that only described the first piece.
 */
export function mp3Frames(b: Uint8Array): Uint8Array {
  let start = 0;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    start = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f));
  }
  let end = b.length;
  if (end - start > 128 && b[end - 128] === 0x54 && b[end - 127] === 0x41 && b[end - 126] === 0x47) end -= 128;
  for (let o = start; o + 4 < Math.min(end, start + 8192); o++) {
    const h = parseMpegHeader(b, o);
    if (!h) continue;
    const sideInfo = h.mpeg1 ? (h.mono ? 17 : 32) : h.mono ? 9 : 17;
    const tag = String.fromCharCode(...b.subarray(o + 4 + sideInfo, o + 8 + sideInfo));
    const vbri = String.fromCharCode(...b.subarray(o + 36, o + 40));
    start = tag === "Xing" || tag === "Info" || vbri === "VBRI" ? o + h.frameLength : o;
    break;
  }
  return b.subarray(start, end);
}

async function mpegDuration(blob: Blob, audioStart: number): Promise<number | undefined> {
  const b = await read(blob, audioStart, 64 * 1024);
  for (let o = 0; o + 4 < b.length; o++) {
    const h = parseMpegHeader(b, o);
    if (!h) continue;
    const next = o + h.frameLength;
    if (next + 4 < b.length && !parseMpegHeader(b, next)) continue; // false sync
    const sideInfo = h.mpeg1 ? (h.mono ? 17 : 32) : h.mono ? 9 : 17;
    const xing = o + 4 + sideInfo;
    const tag = fourcc(b, xing);
    if ((tag === "Xing" || tag === "Info") && u32(b, xing + 4) & 1) {
      const frames = u32(b, xing + 8);
      if (frames > 0) return (frames * h.samplesPerFrame) / h.sampleRate;
    }
    if (fourcc(b, o + 36) === "VBRI") {
      const frames = u32(b, o + 36 + 14);
      if (frames > 0) return (frames * h.samplesPerFrame) / h.sampleRate;
    }
    let audioBytes = blob.size - audioStart - o;
    // Trailing ID3v1 tag.
    const tail = await read(blob, blob.size - 128, 3);
    if (tail[0] === 0x54 && tail[1] === 0x41 && tail[2] === 0x47) audioBytes -= 128;
    return (audioBytes * 8) / h.bitrate;
  }
  return undefined;
}

// ---------------------------------------------------------------- MP4

interface Atom {
  type: string;
  start: number; // offset of the header
  size: number;
  header: number;
}

function atomsIn(b: Uint8Array, start: number, end: number): Atom[] {
  const out: Atom[] = [];
  let o = start;
  while (o + 8 <= end) {
    let size = u32(b, o);
    const type = fourcc(b, o + 4);
    let header = 8;
    if (size === 1) { size = u64(b, o + 8); header = 16; }
    else if (size === 0) size = end - o;
    if (size < header || o + size > end) break;
    out.push({ type, start: o, size, header });
    o += size;
  }
  return out;
}

function child(b: Uint8Array, parent: Atom, type: string, skip = 0): Atom | undefined {
  return atomsIn(b, parent.start + parent.header + skip, parent.start + parent.size).find((a) => a.type === type);
}

function path(b: Uint8Array, root: Atom, types: string[]): Atom | undefined {
  let cur: Atom | undefined = root;
  for (const t of types) {
    if (!cur) return undefined;
    // `meta` is a full box (4 bytes of version/flags before children) in MP4, but not always in QuickTime files.
    const skip = cur.type === "meta" ? (fourcc(b, cur.start + cur.header + 4) === "hdlr" ? 0 : 4) : 0;
    cur = child(b, cur, t, skip);
  }
  return cur;
}

async function findTopLevel(blob: Blob, type: string): Promise<{ start: number; size: number } | null> {
  let o = 0;
  for (let guard = 0; guard < 64 && o + 8 <= blob.size; guard++) {
    const h = await read(blob, o, 16);
    let size = u32(h, 0);
    const t = fourcc(h, 4);
    if (size === 1) size = u64(h, 8);
    else if (size === 0) size = blob.size - o;
    if (size < 8) return null;
    if (t === type) return { start: o, size };
    o += size;
  }
  return null;
}

function ilstValue(b: Uint8Array, item: Atom): { type: number; data: Uint8Array } | null {
  const data = child(b, item, "data");
  if (!data) return null;
  const type = u24(b, data.start + data.header + 1);
  const from = data.start + data.header + 8;
  return { type, data: b.subarray(from, data.start + data.size) };
}

async function readMp4(blob: Blob): Promise<AudioMetadata | null> {
  const head = await read(blob, 0, 12);
  if (fourcc(head, 4) !== "ftyp") return null;
  const moovPos = await findTopLevel(blob, "moov");
  if (!moovPos || moovPos.size > 64 * 1024 * 1024) return null;
  const b = await read(blob, moovPos.start, moovPos.size);
  const moov: Atom = { type: "moov", start: 0, size: b.length, header: 8 };
  const meta: AudioMetadata = { container: "mp4", chapters: [] };

  const mvhd = child(b, moov, "mvhd");
  if (mvhd) {
    const o = mvhd.start + mvhd.header;
    const v = b[o];
    const timescale = v === 1 ? u32(b, o + 20) : u32(b, o + 12);
    const dur = v === 1 ? u64(b, o + 24) : u32(b, o + 16);
    if (timescale) meta.duration = dur / timescale;
  }

  const ilst = path(b, moov, ["udta", "meta", "ilst"]);
  if (ilst) {
    for (const item of atomsIn(b, ilst.start + ilst.header, ilst.start + ilst.size)) {
      const v = ilstValue(b, item);
      if (!v) continue;
      const text = () => new TextDecoder("utf-8").decode(v.data).trim();
      switch (item.type) {
        case "©nam": meta.title = text(); break;
        case "©ART": meta.artist = text(); break;
        case "aART": meta.albumArtist = text(); break;
        case "©alb": meta.album = text(); break;
        case "©wrt": meta.composer = text(); break;
        case "trkn": meta.track = u16(v.data, 2) || undefined; break;
        case "disk": meta.disc = u16(v.data, 2) || undefined; break;
        case "covr": meta.cover = new Blob([v.data.slice()], { type: v.type === 14 ? "image/png" : "image/jpeg" }); break;
      }
    }
  }

  const traks = atomsIn(b, moov.start + moov.header, moov.size).filter((a) => a.type === "trak");
  const sound = traks.find((t) => {
    const hdlr = path(b, t, ["mdia", "hdlr"]);
    return hdlr && fourcc(b, hdlr.start + hdlr.header + 8) === "soun";
  });
  const stsd = sound && path(b, sound, ["mdia", "minf", "stbl", "stsd"]);
  if (stsd && stsd.size >= stsd.header + 16) {
    meta.codec = fourcc(b, stsd.start + stsd.header + 12);
    meta.encrypted = meta.codec === "drms" || meta.codec === "enca";
  }

  // QuickTime chapter track (Apple's standard; written by iTunes, ffmpeg, most audiobook tools).
  const trackId = (t: Atom) => {
    const tkhd = child(b, t, "tkhd");
    if (!tkhd) return -1;
    const o = tkhd.start + tkhd.header;
    return b[o] === 1 ? u32(b, o + 20) : u32(b, o + 12);
  };
  let chapterTrackIds: number[] = [];
  for (const t of traks) {
    const chap = path(b, t, ["tref", "chap"]);
    if (chap) {
      for (let o = chap.start + chap.header; o + 4 <= chap.start + chap.size; o += 4) chapterTrackIds.push(u32(b, o));
    }
  }
  chapterTrackIds = [...new Set(chapterTrackIds)];
  const chapterTrak = traks.find((t) => chapterTrackIds.includes(trackId(t)));
  if (chapterTrak) {
    try {
      meta.chapters = await readChapterTrack(blob, b, chapterTrak);
    } catch {
      meta.chapters = [];
    }
  }

  // Nero chapters (udta/chpl) as a fallback.
  if (meta.chapters.length === 0) {
    const chpl = path(b, moov, ["udta", "chpl"]);
    if (chpl) {
      let o = chpl.start + chpl.header;
      const version = b[o];
      o += 4;
      if (version) o += 4;
      const count = b[o++];
      for (let i = 0; i < count && o + 9 <= chpl.start + chpl.size; i++) {
        const start = u64(b, o) / 1e7;
        const len = b[o + 8];
        const title = new TextDecoder("utf-8").decode(b.subarray(o + 9, o + 9 + len));
        meta.chapters.push({ title, start });
        o += 9 + len;
      }
    }
  }
  meta.chapters.forEach((c, i) => {
    c.end = meta.chapters[i + 1]?.start ?? meta.duration;
  });
  return meta;
}

async function readChapterTrack(blob: Blob, b: Uint8Array, trak: Atom): Promise<AudioChapterMark[]> {
  const mdhd = path(b, trak, ["mdia", "mdhd"]);
  const stbl = path(b, trak, ["mdia", "minf", "stbl"]);
  if (!mdhd || !stbl) return [];
  const mo = mdhd.start + mdhd.header;
  const timescale = b[mo] === 1 ? u32(b, mo + 20) : u32(b, mo + 12);
  const box = (t: string) => child(b, stbl, t);
  const stts = box("stts");
  const stsz = box("stsz");
  const stsc = box("stsc");
  const stco = box("stco") ?? box("co64");
  if (!stts || !stsz || !stsc || !stco || !timescale) return [];

  const durations: number[] = [];
  {
    let o = stts.start + stts.header + 4;
    const n = u32(b, o); o += 4;
    for (let i = 0; i < n; i++, o += 8) {
      const count = u32(b, o);
      const delta = u32(b, o + 4);
      for (let k = 0; k < count; k++) durations.push(delta);
    }
  }
  const sizes: number[] = [];
  {
    let o = stsz.start + stsz.header + 4;
    const fixed = u32(b, o);
    const n = u32(b, o + 4); o += 8;
    for (let i = 0; i < n; i++, o += 4) sizes.push(fixed || u32(b, o));
  }
  const chunkOffsets: number[] = [];
  {
    let o = stco.start + stco.header + 4;
    const n = u32(b, o); o += 4;
    const wide = stco.type === "co64";
    for (let i = 0; i < n; i++, o += wide ? 8 : 4) chunkOffsets.push(wide ? u64(b, o) : u32(b, o));
  }
  const stscEntries: { first: number; perChunk: number }[] = [];
  {
    let o = stsc.start + stsc.header + 4;
    const n = u32(b, o); o += 4;
    for (let i = 0; i < n; i++, o += 12) stscEntries.push({ first: u32(b, o), perChunk: u32(b, o + 4) });
  }
  // Absolute file offset of every sample.
  const offsets: number[] = [];
  let sample = 0;
  for (let c = 0; c < chunkOffsets.length && sample < sizes.length; c++) {
    const entry = [...stscEntries].reverse().find((e) => e.first <= c + 1);
    let off = chunkOffsets[c];
    for (let k = 0; k < (entry?.perChunk ?? 1) && sample < sizes.length; k++) {
      offsets.push(off);
      off += sizes[sample++];
    }
  }
  const out: AudioChapterMark[] = [];
  let t = 0;
  for (let i = 0; i < sizes.length; i++) {
    const raw = await read(blob, offsets[i], Math.min(sizes[i], 1024));
    const len = u16(raw, 0);
    const text = raw.subarray(2, 2 + len);
    const title = text[0] === 0xfe && text[1] === 0xff
      ? new TextDecoder("utf-16be").decode(text.subarray(2))
      : new TextDecoder("utf-8").decode(text);
    out.push({ title: title.trim(), start: t / timescale });
    t += durations[i] ?? 0;
  }
  return out;
}

export async function readAudioMetadata(blob: Blob): Promise<AudioMetadata> {
  const mp4 = await readMp4(blob).catch(() => null);
  if (mp4) return mp4;
  const id3 = await readId3(blob).catch(() => null);
  const audioStart = id3?.tagSize ?? 0;
  const head = await read(blob, audioStart, 4);
  const isMpeg = head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
  const meta: AudioMetadata = { container: id3 || isMpeg ? "mp3" : "unknown", chapters: [], ...id3?.meta };
  meta.chapters = id3?.meta.chapters ?? [];
  if (meta.container === "mp3") {
    const d = await mpegDuration(blob, audioStart).catch(() => undefined);
    if (d) meta.duration = d;
  }
  if (meta.duration) {
    meta.chapters.forEach((c, i) => {
      if (!c.end || c.end <= c.start) c.end = meta.chapters[i + 1]?.start ?? meta.duration;
    });
  }
  return meta;
}
