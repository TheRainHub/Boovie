"""Narrate public-domain works with RHVoice and package them as real audiobook files.

Formats produced (one per catalog item, to exercise every import path of the app):
  m4b          single AAC file with embedded MP4 chapters + cover
  mp3-multi    one MP3 per chapter with ID3 tags (TIT2/TALB/TPE1/TRCK/APIC)
  mp3-chapters single MP3 with ID3v2 CHAP/CTOC chapter frames
  mp3-single   single MP3 without chapters (the app auto-generates 20-minute markers)

Usage: python3 -I build_audio.py <works.json> <catalog.source.json> <public-dir> <scratch-dir>
"""

import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ORDINALS = ["первая", "вторая", "третья", "четвёртая", "пятая", "шестая", "седьмая", "восьмая", "девятая", "десятая"]
ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10}


def spoken_title(title: str) -> str:
    if title.startswith("Глава "):
        n = ROMAN.get(title.split()[1].rstrip("."))
        if n:
            return f"Глава {ORDINALS[n - 1]}."
    return title.rstrip(".") + "."


def leaves(chapters):
    for c in chapters:
        if "children" in c:
            yield from leaves(c["children"])
        else:
            yield c


def run(cmd: list[str], stdin: bytes | None = None) -> None:
    subprocess.run(cmd, input=stdin, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         check=True, capture_output=True, text=True).stdout
    return float(out.strip())


def synth(text: str, voice: str, out: Path) -> None:
    run(["RHVoice-test", "-p", voice, "-o", str(out)], stdin=text.encode("utf-8"))


def build(item: dict, work: dict, public: Path, scratch: Path) -> dict:
    chapters = list(leaves(work["chapters"]))
    work_dir = scratch / item["id"]
    work_dir.mkdir(parents=True, exist_ok=True)
    cover = public / "store" / "covers" / f"{item['id']}.jpg"
    out_dir = public / "store" / "audio"
    out_dir.mkdir(parents=True, exist_ok=True)
    narrator = item["narrator"]

    wavs = []
    for i, c in enumerate(chapters):
        parts = []
        if i == 0:
            parts.append(f"{work['author']}. {work['title']}.")
            parts.extend(p for p in work.get("epigraph", []))
        if len(chapters) > 1:
            parts.append(spoken_title(c["title"]))
        parts.extend(c.get("epigraph", []))
        parts.extend(c["paragraphs"])
        wav = work_dir / f"{i + 1:02d}.wav"
        if not wav.exists():
            synth("\n".join(parts), item["voice"], wav)
        wavs.append(wav)
    durs = [duration(w) for w in wavs]
    titles = [c["title"] for c in chapters] if len(chapters) > 1 else [work["title"]]

    common_meta = ["-metadata", f"album={work['title']}", "-metadata", f"artist={work['author']}",
                   "-metadata", f"album_artist={work['author']}", "-metadata", f"composer={narrator}",
                   "-metadata", "genre=Audiobook", "-metadata", f"date={item['year']}",
                   "-metadata", "comment=Narrated with the RHVoice speech synthesizer. Public-domain text."]
    files = []

    def concat_list() -> Path:
        lst = work_dir / "concat.txt"
        lst.write_text("".join(f"file '{w.as_posix()}'\n" for w in wavs))
        return lst

    def ffmetadata(with_chapters: bool) -> Path:
        meta = work_dir / "meta.txt"
        lines = [";FFMETADATA1", f"title={work['title']}"]
        if with_chapters:
            t = 0.0
            for title, d in zip(titles, durs):
                lines += ["[CHAPTER]", "TIMEBASE=1/1000", f"START={int(t * 1000)}", f"END={int((t + d) * 1000)}", f"title={title}"]
                t += d
        meta.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return meta

    fmt = item["format"]
    if fmt == "m4b":
        out = out_dir / f"{item['id']}.m4b"
        run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list()), "-i", str(ffmetadata(True)),
             "-i", str(cover), "-map", "0:a", "-map", "2:v", "-map_metadata", "1", "-map_chapters", "1",
             "-c:a", "aac", "-b:a", "40k", "-ac", "1", "-c:v", "mjpeg", "-disposition:v", "attached_pic",
             *common_meta, "-metadata", f"title={work['title']}", "-movflags", "+faststart", "-f", "ipod", str(out)])
        files.append({"url": f"/store/audio/{out.name}", "name": out.name, "size": out.stat().st_size})
    elif fmt == "mp3-multi":
        for i, (wav, title) in enumerate(zip(wavs, titles)):
            out = out_dir / f"{item['id']}-{i + 1:02d}.mp3"
            run(["ffmpeg", "-y", "-i", str(wav), "-i", str(cover), "-map", "0:a", "-map", "1:v",
                 "-c:a", "libmp3lame", "-b:a", "32k", "-ac", "1", "-c:v", "mjpeg", "-id3v2_version", "3",
                 "-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)",
                 *common_meta, "-metadata", f"title={title}", "-metadata", f"track={i + 1}/{len(wavs)}", str(out)])
            files.append({"url": f"/store/audio/{out.name}", "name": out.name, "size": out.stat().st_size})
    elif fmt in ("mp3-chapters", "mp3-single"):
        out = out_dir / f"{item['id']}.mp3"
        run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list()), "-i", str(ffmetadata(fmt == "mp3-chapters")),
             "-i", str(cover), "-map", "0:a", "-map", "2:v", "-map_metadata", "1", "-map_chapters", "1" if fmt == "mp3-chapters" else "-1",
             "-c:a", "libmp3lame", "-b:a", "32k", "-ac", "1", "-c:v", "mjpeg", "-id3v2_version", "4",
             "-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)",
             *common_meta, "-metadata", f"title={work['title']}", str(out)])
        files.append({"url": f"/store/audio/{out.name}", "name": out.name, "size": out.stat().st_size})
    else:
        raise ValueError(fmt)

    total = sum(durs)
    print(f"{item['id']:26} {fmt:13} {total / 60:6.1f} min  {sum(f['size'] for f in files) / 1e6:5.1f} MB", flush=True)
    return {"files": files, "duration": round(total, 2),
            "chapters": [{"title": t, "duration": round(d, 2)} for t, d in zip(titles, durs)]}


def main() -> None:
    works_path, catalog_path, public, scratch = map(Path, sys.argv[1:5])
    works = {w["id"]: w for w in json.loads(works_path.read_text(encoding="utf-8"))}
    items = [i for i in json.loads(catalog_path.read_text(encoding="utf-8"))["items"] if i["kind"] == "audiobook"]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = dict(zip([i["id"] for i in items], pool.map(lambda i: build(i, works[i["work"]], public, scratch), items)))
    out_manifest = Path(__file__).parent / ".manifests" / "audio.json"
    out_manifest.parent.mkdir(exist_ok=True)
    out_manifest.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
