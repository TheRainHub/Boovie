"""Extract structured public-domain works (title, author, nested chapters) from plain-text sources.

Usage: python3 -I extract_works.py <russian-novels-corpus-dir> <standard-ebooks-dir> <out.json>

Russian texts come from the JoannaBy/RussianNovels corpus (19th-century authors only, public domain).
English texts come from Standard Ebooks source repositories (CC0).
"""

import json
import re
import sys
from pathlib import Path

ROMAN = re.compile(r"^\s*([IVXLC]+)\.?\s*$")


def read_lines(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8-sig")
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace(" ", " ")
    return text.split("\n")


def clean(line: str) -> str:
    line = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", line)
    line = re.sub(r"\s+", " ", line).strip()
    # Corpus uses "--" for dashes in some texts.
    line = re.sub(r"(^|\s)--(\s|$)", r"\1—\2", line)
    line = line.replace(" -- ", " — ").replace("--", "—")
    line = re.sub(r"(?<=\w)#(?=\w)", "-", line)  # corpus artifact: "как#то" -> "как-то"
    line = re.sub(r"(?<=[\w)»]) +([,;:.!?])(?!\.)", r"\1", line)
    line = re.sub(r"([.,!?;:])—", r"\1 —", line)
    if re.fullmatch(r"[-_*=—\s]*", line):
        return ""
    return line


def paragraphs(lines: list[str]) -> list[str]:
    return [clean(l) for l in lines if clean(l)]


def split_epigraph(paras: list[str]) -> tuple[list[str], list[str]]:
    """Leading short lines before the first prose paragraph form an epigraph."""
    epi: list[str] = []
    for i, p in enumerate(paras):
        if len(p) > 90 or i >= 16:
            break
        epi.append(p)
    else:
        return [], paras
    if not epi or len(epi) == len(paras):
        return [], paras
    return epi, paras[len(epi):]


def chapter(title: str, lines: list[str], detect_epigraph: bool = True) -> dict:
    paras = paragraphs(lines)
    epi, body = split_epigraph(paras) if detect_epigraph else ([], paras)
    return {"title": title, "epigraph": epi, "paragraphs": body}


def split_by_roman(lines: list[str], fmt=lambda r: f"Глава {r}", stop: re.Pattern | None = None) -> list[dict]:
    chapters: list[dict] = []
    current: tuple[str, int] | None = None
    for i, line in enumerate(lines):
        m = ROMAN.match(line)
        if m or (stop and stop.match(line)):
            if current:
                chapters.append(chapter(current[0], lines[current[1]:i]))
            title = fmt(m.group(1)) if m else clean(line)
            current = (title, i + 1)
    if current:
        chapters.append(chapter(current[0], lines[current[1]:]))
    return [c for c in chapters if c["paragraphs"]]


def find(lines: list[str], pattern: str, start: int = 0) -> int:
    rx = re.compile(pattern)
    for i in range(start, len(lines)):
        if rx.match(lines[i]):
            return i
    raise ValueError(f"pattern not found: {pattern}")


ORDINAL_PARTS = ["ПЕРВАЯ", "ВТОРАЯ", "ТРЕТЬЯ", "ЧЕТВЕРТАЯ", "ПЯТАЯ", "ШЕСТАЯ", "СЕДЬМАЯ", "ВОСЬМАЯ"]


def split_parts(lines: list[str], part_rx: str) -> list[dict]:
    rx = re.compile(part_rx, re.IGNORECASE)
    idx = [i for i, l in enumerate(lines) if rx.match(l.strip())]
    parts = []
    for n, start in enumerate(idx):
        end = idx[n + 1] if n + 1 < len(idx) else len(lines)
        title = clean(lines[start]).capitalize()
        parts.append({"title": title, "children": split_by_roman(lines[start + 1:end])})
    return parts


def ru_works(corpus: Path) -> list[dict]:
    works = []

    # Пиковая дама — 6 chapters + conclusion, book epigraph.
    lines = read_lines(corpus / "Pushkin_Pikovaya.txt")
    start = find(lines, r"^\s*I\s*$")
    chs = split_by_roman(lines[start:], stop=re.compile(r"^\s*Заключение\s*$"))
    works.append({
        "id": "pikovaya-dama", "title": "Пиковая дама", "author": "Александр Пушкин",
        "epigraph": ["Пиковая дама означает тайную недоброжелательность.", "Новейшая гадательная книга."],
        "chapters": chs,
    })

    # Чехов: «Дама с собачкой», «Черный монах», «Ионыч» from the stories collection.
    lines = read_lines(corpus / "Chekhov_Dama.txt")
    dama = lines[find(lines, r"^\s*I\s*$"):find(lines, r"^\s*Черный монах\s*$")]
    works.append({"id": "dama-s-sobachkoy", "title": "Дама с собачкой", "author": "Антон Чехов",
                  "chapters": split_by_roman(dama)})
    monah_start = find(lines, r"^\s*Черный монах\s*$")
    monah = lines[monah_start + 1:find(lines, r"^\s*Антон Павлович Чехов\s*$", monah_start)]
    works.append({"id": "chernyi-monah", "title": "Черный монах", "author": "Антон Чехов",
                  "chapters": split_by_roman(monah)})

    # Повести Белкина — nested: each story is a section; «Выстрел» has two chapters.
    lines = read_lines(corpus / "Pushkin_PovestiPokoynogoIvanaPetrovichaBelkina.txt")
    heads = [(i, clean(l)) for i, l in enumerate(lines)
             if re.match(r"^\s*(ОТ ИЗДАТЕЛЯ|ВЫСТРЕЛ|МЕТЕЛЬ|ГРОБОВЩИК|СТАНЦИОННЫЙ СМОТРИТЕЛЬ|БАРЫШНЯ-КРЕСТЬЯНКА)\s*$", l)]
    stories = []
    for n, (i, title) in enumerate(heads):
        end = heads[n + 1][0] if n + 1 < len(heads) else len(lines)
        body = lines[i + 1:end]
        nice = title.capitalize().replace("-крестьянка", "-крестьянка")
        if any(ROMAN.match(l) for l in body):
            stories.append({"title": nice, "children": split_by_roman(body)})
        else:
            stories.append(chapter(nice, body))
    works.append({"id": "povesti-belkina", "title": "Повести Белкина", "author": "Александр Пушкин",
                  "chapters": stories})
    vystrel = next(s for s in stories if s["title"] == "Выстрел")
    works.append({"id": "vystrel", "title": "Выстрел", "author": "Александр Пушкин",
                  "chapters": vystrel["children"]})

    # Вий — a single continuous text (no chapters in the original).
    lines = read_lines(corpus / "Gogol_Viy.txt")
    works.append({"id": "viy", "title": "Вий", "author": "Николай Гоголь",
                  "chapters": [chapter("Вий", lines, detect_epigraph=False)]})

    # Капитанская дочка — "ГЛАВА I" followed by a title line.
    lines = read_lines(corpus / "Pushkin_CapitanskaaDochka.txt")
    idx = [i for i, l in enumerate(lines) if re.match(r"^\s*ГЛАВА\s+[IVX]+\s*$", l)]
    chs = []
    for n, i in enumerate(idx):
        end = idx[n + 1] if n + 1 < len(idx) else len(lines)
        num = clean(lines[i]).split()[1]
        j = i + 1
        while j < end and not clean(lines[j]):
            j += 1
        name = clean(lines[j]).capitalize()
        c = chapter(f"Глава {num}. {name}", lines[j + 1:end])
        chs.append(c)
    # The corpus appends unheaded fragments of the "missing chapter" after the publisher's afterword.
    last = chs[-1]["paragraphs"]
    cut = next(i for i, p in enumerate(last) if p.startswith("19 окт. 1836"))
    chs[-1]["paragraphs"] = last[:cut + 1]
    works.append({"id": "kapitanskaya-dochka", "title": "Капитанская дочка", "author": "Александр Пушкин",
                  "chapters": chs})

    # Анна Каренина — 8 parts × chapters.
    lines = read_lines(corpus / "Tolstoi_AnnaKarenina.txt")
    works.append({"id": "anna-karenina", "title": "Анна Каренина", "author": "Лев Толстой",
                  "epigraph": ["Мне отмщение, и аз воздам."],
                  "chapters": split_parts(lines, r"^ЧАСТЬ (" + "|".join(ORDINAL_PARTS) + r")$")})

    # Преступление и наказание — 6 parts + epilogue.
    lines = read_lines(corpus / "Dostoyevsky_PrestupleniyeINakazaniye.txt")
    works.append({"id": "prestuplenie-i-nakazanie", "title": "Преступление и наказание",
                  "author": "Фёдор Достоевский",
                  "chapters": split_parts(lines, r"^(ЧАСТЬ (" + "|".join(ORDINAL_PARTS) + r")|ЭПИЛОГ)$")})

    # Отцы и дети — 28 chapters.
    lines = read_lines(corpus / "Turgenev_OttsyIDeti.txt")
    works.append({"id": "otcy-i-deti", "title": "Отцы и дети", "author": "Иван Тургенев",
                  "chapters": split_by_roman(lines)})

    # Дядя Ваня — dramatis personae + 4 acts.
    lines = read_lines(corpus / "Chekhov_Dyadya.txt")
    acts = [(i, clean(l)) for i, l in enumerate(lines)
            if re.match(r"^\s*(Действующие лица|Действие (первое|второе|третье|четвертое))\s*$", l)]
    chs = []
    for n, (i, title) in enumerate(acts):
        end = acts[n + 1][0] if n + 1 < len(acts) else len(lines)
        body = [l for l in lines[i + 1:end] if not re.match(r"^\s*\d{4}\s*$", l)]
        chs.append(chapter(title, body, detect_epigraph=False))
    works.append({"id": "dyadya-vanya", "title": "Дядя Ваня", "author": "Антон Чехов",
                  "subtitle": "Сцены из деревенской жизни в четырёх действиях", "chapters": chs})
    return works


def se_work(repo: Path, wid: str) -> dict:
    """Read title/author from a Standard Ebooks content.opf (body files are used verbatim by the EPUB build)."""
    opf = (repo / "src/epub/content.opf").read_text(encoding="utf-8")
    title = re.search(r"<dc:title[^>]*>(.*?)</dc:title>", opf).group(1)
    author = re.search(r"<dc:creator[^>]*>(.*?)</dc:creator>", opf).group(1)
    return {"id": wid, "title": title, "author": author, "standardEbooks": str(repo)}


def main() -> None:
    corpus, se_dir, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    works = ru_works(corpus)
    for wid, repo in [
        ("time-machine", "h-g-wells_the-time-machine"),
        ("war-of-the-worlds", "h-g-wells_the-war-of-the-worlds"),
        ("flatland", "edwin-a-abbott_flatland"),
        ("franklin-autobiography", "benjamin-franklin_the-autobiography-of-benjamin-franklin"),
        ("meditations", "marcus-aurelius_meditations_george-long"),
        ("news-from-nowhere", "william-morris_news-from-nowhere"),
        ("leisure-class", "thorstein-veblen_the-theory-of-the-leisure-class"),
    ]:
        works.append(se_work(se_dir / repo, wid))

    for w in works:
        if "chapters" in w:
            def count(chs):
                return sum(count(c["children"]) if "children" in c else 1 for c in chs)
            def chars(chs):
                return sum(chars(c["children"]) if "children" in c else sum(len(p) for p in c["paragraphs"]) for c in chs)
            print(f"{w['id']:28} chapters={count(w['chapters']):4} chars={chars(w['chapters']):8}")
    out.write_text(json.dumps(works, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
