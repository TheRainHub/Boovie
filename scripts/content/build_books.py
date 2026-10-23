"""Build real EPUB 3 and FB2 files for the bundled store from extracted works.

Usage: python3 -I build_books.py <works.json> <catalog.source.json> <public-dir>
"""

import base64
import html
import json
import re
import shutil
import sys
import uuid
import zipfile
from pathlib import Path

NS_UUID = uuid.UUID("6f1d7c1e-2b9a-4d55-9d8e-7c3a0a6b5e21")
TODAY = "2026-10-23"


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def leaves(chapters, group=None):
    for c in chapters:
        if "children" in c:
            for i, leaf in enumerate(leaves(c["children"], c["title"])):
                yield leaf
        else:
            yield c, group


def split_author(full: str) -> tuple[str, str]:
    parts = full.split()
    return (" ".join(parts[:-1]), parts[-1]) if len(parts) > 1 else ("", full)


# ---------------------------------------------------------------- EPUB (Russian works)

EPUB_CSS = """
body { font-family: Georgia, serif; line-height: 1.55; margin: 0 5%; }
h1.part { text-align: center; font-size: 1.5em; margin: 2em 0 1.2em; letter-spacing: .04em; }
h2 { text-align: center; font-size: 1.25em; margin: 1.6em 0 1em; }
p { text-indent: 1.5em; margin: 0; text-align: justify; }
blockquote.epigraph { margin: 1em 0 1.6em 40%; font-style: italic; font-size: .92em; }
blockquote.epigraph p { text-indent: 0; text-align: left; }
.titlepage { text-align: center; margin-top: 2em; }
.titlepage img { max-width: 70%; height: auto; }
.titlepage .author { font-size: 1.1em; letter-spacing: .12em; text-transform: uppercase; margin-top: 2em; }
.titlepage .title { font-size: 2em; margin-top: .4em; }
"""


def xhtml(title: str, body: str, lang: str = "ru") -> str:
    return f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="{lang}" lang="{lang}">
<head><title>{esc(title)}</title><link rel="stylesheet" type="text/css" href="../styles/book.css"/></head>
<body>
{body}
</body>
</html>
"""


def chapter_body(c: dict, part_title: str | None) -> str:
    out = []
    if part_title:
        out.append(f'<h1 class="part">{esc(part_title)}</h1>')
    out.append(f"<h2>{esc(c['title'])}</h2>")
    if c.get("epigraph"):
        out.append('<blockquote class="epigraph">' + "".join(f"<p>{esc(p)}</p>" for p in c["epigraph"]) + "</blockquote>")
    out.extend(f"<p>{esc(p)}</p>" for p in c["paragraphs"])
    return "<section epub:type=\"chapter\">\n" + "\n".join(out) + "\n</section>"


def write_zip_epub(out: Path, files: list[tuple[str, bytes]]) -> None:
    with zipfile.ZipFile(out, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), b"application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for name, data in files:
            z.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)


def build_epub(work: dict, item: dict, cover: Path, out: Path) -> None:
    book_id = f"urn:uuid:{uuid.uuid5(NS_UUID, item['id'])}"
    files: list[tuple[str, bytes]] = []
    files.append(("META-INF/container.xml", b"""<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"""))
    files.append(("OEBPS/styles/book.css", EPUB_CSS.encode()))
    files.append(("OEBPS/images/cover.jpg", cover.read_bytes()))

    epigraph = "".join(f"<p>{esc(p)}</p>" for p in work.get("epigraph", []))
    title_body = f"""<div class="titlepage">
<img src="../images/cover.jpg" alt="{esc(work['title'])}"/>
<p class="author">{esc(work['author'])}</p>
<p class="title">{esc(work['title'])}</p>
{f'<blockquote class="epigraph">{epigraph}</blockquote>' if epigraph else ''}
</div>"""
    files.append(("OEBPS/text/title.xhtml", xhtml(work["title"], title_body).encode()))

    manifest = ['<item id="css" href="styles/book.css" media-type="text/css"/>',
                '<item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>',
                '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
                '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
                '<item id="title" href="text/title.xhtml" media-type="application/xhtml+xml"/>']
    spine = ['<itemref idref="title"/>']

    # Navigation trees (nav.xhtml nested <ol>, toc.ncx nested navPoints).
    nav_items: list[str] = []
    ncx_points: list[str] = []
    play = [0]

    def nav_point(label: str, src: str, inner: str = "") -> str:
        play[0] += 1
        return (f'<navPoint id="np{play[0]}" playOrder="{play[0]}"><navLabel><text>{esc(label)}</text></navLabel>'
                f'<content src="{src}"/>{inner}</navPoint>')

    n = 0
    for top in work["chapters"]:
        kids = top.get("children")
        group_chapters = kids if kids else [top]
        hrefs = []
        for i, c in enumerate(group_chapters):
            n += 1
            href = f"text/ch{n:03d}.xhtml"
            part_title = top["title"] if kids and i == 0 else None
            files.append((f"OEBPS/{href}", xhtml(c["title"], chapter_body(c, part_title)).encode()))
            manifest.append(f'<item id="ch{n:03d}" href="{href}" media-type="application/xhtml+xml"/>')
            spine.append(f'<itemref idref="ch{n:03d}"/>')
            hrefs.append((c["title"], href))
        if kids:
            inner_nav = "".join(f'<li><a href="{h}">{esc(t)}</a></li>' for t, h in hrefs)
            nav_items.append(f'<li><a href="{hrefs[0][1]}">{esc(top["title"])}</a><ol>{inner_nav}</ol></li>')
            start = play[0] + 1
            play[0] += 1
            inner_ncx = "".join(nav_point(t, h) for t, h in hrefs)
            ncx_points.append(f'<navPoint id="np{start}" playOrder="{start}"><navLabel><text>{esc(top["title"])}</text></navLabel>'
                              f'<content src="{hrefs[0][1]}"/>{inner_ncx}</navPoint>')
        else:
            nav_items.append(f'<li><a href="{hrefs[0][1]}">{esc(top["title"])}</a></li>')
            ncx_points.append(nav_point(top["title"], hrefs[0][1]))

    nav = f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ru" lang="ru">
<head><title>Оглавление</title></head>
<body><nav epub:type="toc" id="toc"><h1>Оглавление</h1><ol>{''.join(nav_items)}</ol></nav></body></html>"""
    files.append(("OEBPS/nav.xhtml", nav.encode()))
    ncx = f"""<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="{book_id}"/></head>
<docTitle><text>{esc(work['title'])}</text></docTitle>
<navMap>{''.join(ncx_points)}</navMap></ncx>"""
    files.append(("OEBPS/toc.ncx", ncx.encode()))

    opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="ru">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="bookid">{book_id}</dc:identifier>
  <dc:title>{esc(work['title'])}</dc:title>
  <dc:creator>{esc(work['author'])}</dc:creator>
  <dc:language>ru</dc:language>
  <dc:date>{item['year']}</dc:date>
  <dc:description>{esc(item['synopsis'])}</dc:description>
  <dc:rights>Public domain</dc:rights>
  <meta property="dcterms:modified">{TODAY}T00:00:00Z</meta>
  <meta name="cover" content="cover-image"/>
</metadata>
<manifest>
  {chr(10).join('  ' + m for m in manifest)}
</manifest>
<spine toc="ncx">
  {chr(10).join('  ' + s for s in spine)}
</spine>
</package>"""
    files.insert(1, ("OEBPS/content.opf", opf.encode()))
    write_zip_epub(out, files)


def build_se_epub(work: dict, cover: Path, out: Path) -> None:
    """Package a Standard Ebooks source tree into an EPUB, swapping in our cover."""
    src = Path(work["standardEbooks"]) / "src"
    files: list[tuple[str, bytes]] = []
    for p in sorted(src.rglob("*")):
        if p.is_file() and p.name != "mimetype":
            rel = p.relative_to(src).as_posix()
            data = p.read_bytes()
            if rel == "epub/content.opf":
                opf = data.decode()
                opf = re.sub(r'<item href="images/cover\.svg" id="cover\.svg" media-type="image/svg\+xml" properties="cover-image"/>',
                             '<item href="images/cover.svg" id="cover.svg" media-type="image/svg+xml"/>\n\t\t'
                             '<item href="images/cover.jpg" id="cover.jpg" media-type="image/jpeg" properties="cover-image"/>', opf)
                data = opf.encode()
            files.append((rel, data))
    files.append(("epub/images/cover.jpg", cover.read_bytes()))
    write_zip_epub(out, files)


# ---------------------------------------------------------------- FB2

def fb2_paras(paras: list[str]) -> str:
    return "".join(f"<p>{esc(p)}</p>" for p in paras)


def fb2_section(c: dict) -> str:
    inner = f"<title><p>{esc(c['title'])}</p></title>"
    if "children" in c:
        return f"<section>{inner}{''.join(fb2_section(k) for k in c['children'])}</section>"
    if c.get("epigraph"):
        inner += f"<epigraph>{fb2_paras(c['epigraph'])}</epigraph>"
    return f"<section>{inner}{fb2_paras(c['paragraphs'])}</section>"


def build_fb2(work: dict, item: dict, cover: Path, encoding: str = "utf-8") -> bytes:
    first, last = split_author(work["author"])
    genre = "prose_rus_classic" if item["language"] == "ru" else "prose_classic"
    epigraph = f"<epigraph>{fb2_paras(work['epigraph'])}</epigraph>" if work.get("epigraph") else ""
    doc = f"""<?xml version="1.0" encoding="{encoding}"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description>
<title-info>
<genre>{genre}</genre>
<author><first-name>{esc(first)}</first-name><last-name>{esc(last)}</last-name></author>
<book-title>{esc(work['title'])}</book-title>
<annotation><p>{esc(item['synopsis'])}</p></annotation>
<date>{item['year']}</date>
<coverpage><image l:href="#cover.jpg"/></coverpage>
<lang>{item['language']}</lang>
</title-info>
<document-info>
<author><nickname>Titan</nickname></author>
<program-used>Titan store content pipeline</program-used>
<date value="{TODAY}">{TODAY}</date>
<id>{uuid.uuid5(NS_UUID, item['id'])}</id>
<version>1.0</version>
</document-info>
</description>
<body>
<title><p>{esc(work['author'])}</p><p>{esc(work['title'])}</p></title>
{epigraph}
{''.join(fb2_section(c) for c in work['chapters'])}
</body>
<binary id="cover.jpg" content-type="image/jpeg">{base64.b64encode(cover.read_bytes()).decode()}</binary>
</FictionBook>
"""
    return doc.encode(encoding, errors="xmlcharrefreplace")


def main() -> None:
    works_path, catalog_path, public = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    works = {w["id"]: w for w in json.loads(works_path.read_text(encoding="utf-8"))}
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    out_dir = public / "store" / "books"
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for item in catalog["items"]:
        if item["kind"] != "ebook" or item["format"].startswith("pdf"):
            continue
        work = works[item["work"]]
        cover = public / "store" / "covers" / f"{item['id']}.jpg"
        fmt = item["format"]
        if fmt == "epub":
            out = out_dir / f"{item['id']}.epub"
            if "standardEbooks" in work:
                build_se_epub(work, cover, out)
            else:
                build_epub(work, item, cover, out)
        elif fmt in ("fb2", "fb2-cp1251"):
            out = out_dir / f"{item['id']}.fb2"
            out.write_bytes(build_fb2(work, item, cover, "windows-1251" if fmt == "fb2-cp1251" else "utf-8"))
        elif fmt == "fb2.zip":
            out = out_dir / f"{item['id']}.fb2.zip"
            with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
                z.writestr(f"{item['id']}.fb2", build_fb2(work, item, cover))
        else:
            raise ValueError(fmt)
        manifest[item["id"]] = {"file": f"/store/books/{out.name}", "size": out.stat().st_size}
        print(f"{item['id']:28} {out.name:36} {out.stat().st_size / 1024:8.0f} KB")
    out_manifest = Path(__file__).parent / ".manifests" / "books.json"
    out_manifest.parent.mkdir(exist_ok=True)
    out_manifest.write_text(json.dumps(manifest, indent=1))


if __name__ == "__main__":
    main()
