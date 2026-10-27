"""Merge catalog.source.json with the build manifests into src/data/catalog.generated.json.

Usage: python3 -I generate_catalog.py <works.json> <catalog.source.json> <public-dir> <out.json>
"""

import json
import math
import re
import sys
from pathlib import Path

FORMAT = {
    "epub": "EPUB", "fb2": "FB2", "fb2.zip": "FB2 · ZIP", "fb2-cp1251": "FB2 · CP1251", "pdf": "PDF",
    "pdf-no-outline": "PDF", "m4b": "M4B", "mp3-multi": "MP3 × 4", "mp3-chapters": "MP3", "mp3-single": "MP3",
}


def chars(chapters) -> int:
    return sum(chars(c["children"]) if "children" in c else sum(len(p) for p in c["paragraphs"]) for c in chapters)


def count(chapters) -> int:
    return sum(count(c["children"]) if "children" in c else 1 for c in chapters)


def main() -> None:
    works_path, src_path, public, out = map(Path, sys.argv[1:5])
    works = {w["id"]: w for w in json.loads(works_path.read_text(encoding="utf-8"))}
    src = json.loads(src_path.read_text(encoding="utf-8"))
    manifests = Path(__file__).parent / ".manifests"
    books_manifest = json.loads((manifests / "books.json").read_text())
    audio_manifest = json.loads((manifests / "audio.json").read_text(encoding="utf-8"))

    items = []
    for it in src["items"]:
        item = {k: v for k, v in it.items() if k not in ("cover", "work", "voice")}
        item["coverUrl"] = f"/store/covers/{it['id']}.jpg"
        if it["cover"].get("credit"):
            item["coverCredit"] = it["cover"]["credit"]
        item["formatLabel"] = FORMAT[it["format"]]
        work = works[it["work"]]
        if it["kind"] == "audiobook":
            a = audio_manifest[it["id"]]
            item["files"] = [{"url": f["url"], "name": f["name"], "size": f["size"]} for f in a["files"]]
            item["duration"] = a["duration"]
            item["chapterCount"] = len(a["chapters"]) if it["format"] != "mp3-single" else max(1, math.ceil(a["duration"] / 1200 - 0.05))  # mirrors autoChapters()
        else:
            if it["format"].startswith("pdf"):
                f = public / "store/books" / f"{it['id']}.pdf"
                pdf = f.read_bytes()
                item["files"] = [{"url": f"/store/books/{f.name}", "name": f.name, "size": f.stat().st_size}]
                item["pages"] = len(re.findall(rb"/Type\s*/Page[^s]", pdf))
            else:
                m = books_manifest[it["id"]]
                name = m["file"].rsplit("/", 1)[1]
                # The size on disk, not the one the build logged (a book can be kept from an earlier build).
                item["files"] = [{"url": m["file"], "name": name, "size": (public / m["file"].lstrip("/")).stat().st_size}]
            if "chapters" in work:
                item["chapterCount"] = count(work["chapters"])
                item.setdefault("pages", round(chars(work["chapters"]) / 1800))
            elif not it["format"].startswith("pdf"):
                # Standard Ebooks source: count body spine documents and their text.
                epub = Path(work["standardEbooks"]) / "src/epub"
                opf = (epub / "content.opf").read_text(encoding="utf-8")
                hrefs = dict(re.findall(r'<item href="([^"]+)" id="([^"]+)"', opf))
                ids = {v: k for k, v in hrefs.items()}
                spine = [ids[i] for i in re.findall(r'<itemref idref="([^"]+)"', opf)]
                body = [h for h in spine if not re.search(r"(titlepage|imprint|colophon|uncopyright|halftitle|endnotes|loi)", h)]
                text = "".join(re.sub(r"<[^>]+>", "", (epub / h).read_text(encoding="utf-8")) for h in body)
                item["chapterCount"] = len(body)
                item["pages"] = round(len(re.sub(r"\s+", " ", text)) / 1800)
        item["fileSize"] = sum(f["size"] for f in item["files"])
        items.append(item)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"categories": src["categories"], "items": items}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(items)} catalog items → {out}")


if __name__ == "__main__":
    main()
