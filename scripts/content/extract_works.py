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


# ---------------------------------------------------------------- more Russian works
#
# These sources differ from the first set: some are hard-wrapped (a paragraph is several lines, only its first line
# indented), Roman numerals are sometimes typed with Cyrillic «Х», headings contain Latin look-alikes («BTОРАЯ»),
# and a few files carry notes, variants or the next story after the work itself.

SUB = "§ "  # a paragraph that is a subheading inside a chapter (section number, letter date); see build_books.py

ROMAN_FIX = str.maketrans({"Х": "X", "х": "X", "І": "I", "С": "C", "Ⅰ": "I"})
TO_CYRILLIC = str.maketrans({"A": "А", "B": "В", "C": "С", "E": "Е", "H": "Н", "K": "К", "M": "М", "O": "О",
                             "P": "Р", "T": "Т", "X": "Х", "Y": "У"})
ORDINALS = ["ПЕРВАЯ", "ВТОРАЯ", "ТРЕТЬЯ", "ЧЕТВЕРТАЯ", "ПЯТАЯ", "ШЕСТАЯ", "СЕДЬМАЯ", "ВОСЬМАЯ", "ДЕВЯТАЯ", "ДЕСЯТАЯ",
            "ОДИННАДЦАТАЯ", "ДВЕНАДЦАТАЯ", "ОСЬМАЯ"]


def roman_of(line: str) -> str | None:
    s = line.strip().rstrip(".").strip().translate(ROMAN_FIX)
    if len(s) > 1:
        s = s.replace("И", "II")  # «ХХVИ» = XXVII
    return s if re.fullmatch(r"[IVXLC]+", s) else None


def to_roman(n: int) -> str:
    out = ""
    for v, r in [(50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]:
        while n >= v:
            out += r
            n -= v
    return out


def heading_text(line: str) -> str:
    """«* ЧАСТЬ BTОРАЯ. *» → «ЧАСТЬ ВТОРАЯ»."""
    s = line.strip().strip("*").strip().rstrip(".").strip()
    return s.translate(TO_CYRILLIC) if re.search("[А-ЯЁ]", s) else s


HEAD_RX = re.compile(r"^(ЧАСТЬ|Часть|ГЛАВА|Глава|ТОМ|КНИГА|ЭПИЛОГ|Эпилог|ОТ АВТОРА|ВАРИАНТЫ)\b")


CAPS_CHAPTER = re.compile(r"^\s*[IVXLCХ]+\.\s+[^а-яё]{3,}$")  # «II. ИЗ ЖИТИЯ … ЗОСИМЫ,»


def is_head(line: str) -> bool:
    s = heading_text(line)
    return bool(roman_of(line) or re.fullmatch(r"\d{1,2}", s) or (len(s) < 90 and HEAD_RX.match(s)) or CAPS_CHAPTER.match(line))


def reflow(lines: list[str]) -> list[str]:
    """Join hard-wrapped lines: a paragraph starts at an indented line, a blank line or a heading."""
    body = [l for l in lines if l.strip()]
    indented = sum(1 for l in body if re.match(r"^\s{2,}\S", l))
    if not body or indented < len(body) * 0.15 or indented > len(body) * 0.85:
        return lines  # already one paragraph per line
    out: list[str] = []
    cur: str | None = None
    for l in lines:
        if not l.strip() or is_head(l):
            if cur is not None:
                out.append(cur)
                cur = None
            out.append(l)
        elif cur is None or re.match(r"^\s{2,}\S", l):
            if cur is not None:
                out.append(cur)
            cur = l
        else:
            cur = cur.rstrip() + " " + l.strip()
    if cur is not None:
        out.append(cur)
    return out


def tidy(p: str) -> str:
    p = re.sub(r"\s*\[\d+\]", "", p)  # note numbers whose notes the corpus doesn't have
    p = re.sub(r"^- ", "— ", p)
    p = p.replace(" - ", " — ")
    return p


def chapter2(title: str, lines: list[str], epigraph: bool = True, sections: bool = False) -> dict:
    """Like chapter(), plus Roman-numbered sections inside the chapter become subheadings."""
    paras: list[str] = []
    for l in lines:
        if sections and roman_of(l):
            paras.append(SUB + roman_of(l))
        elif clean(l):
            p = tidy(clean(l))
            # The corpus cuts very long lines at about 9 900 characters, mid-sentence: glue the pieces back.
            if paras and len(paras[-1]) >= 9800 and not re.search(r"[.!?…»\"”)—:]$", paras[-1]):
                paras[-1] = f"{paras[-1]} {p}"
            else:
                paras.append(p)
    epi, body = split_epigraph(paras) if epigraph and paras and not paras[0].startswith(SUB) else ([], paras)
    return {"title": title, "epigraph": epi, "paragraphs": body}


def join_lines(lines: list[str]) -> list[str]:
    """Prose epigraphs broken into lines: join a line to the previous one unless that one ends a sentence."""
    out: list[str] = []
    for l in lines:
        if out and not re.search(r"[.!?…»\"”)]$", out[-1]) and not l.startswith(("(", "\"", "«")):
            out[-1] = f"{out[-1]} {l}"
        else:
            out.append(l)
    return out


def split_at(lines: list[str], pred, title_of, sections: bool = False, epigraph: bool = True) -> list[dict]:
    """Chapters start at lines where `pred` holds; `title_of(line, next_lines)` → (title, lines to skip)."""
    idx = [i for i, l in enumerate(lines) if pred(l)]
    out = []
    for n, i in enumerate(idx):
        end = idx[n + 1] if n + 1 < len(idx) else len(lines)
        title, skip = title_of(i)
        c = chapter2(title, lines[i + 1 + skip:end], epigraph=epigraph, sections=sections)
        if c["paragraphs"]:
            out.append(c)
    return out


def roman_chapters(lines: list[str], stop: str | None = None) -> list[dict]:
    stop_rx = re.compile(stop) if stop else None
    return split_at(
        lines,
        lambda l: bool(roman_of(l)) or bool(stop_rx and stop_rx.match(heading_text(l))),
        lambda i: ((f"Глава {roman_of(lines[i])}" if roman_of(lines[i]) else heading_text(lines[i]).capitalize()), 0),
    )


def parts_of(lines: list[str], part_rx: str, inner) -> list[dict]:
    rx = re.compile(part_rx)
    idx = [i for i, l in enumerate(lines) if rx.match(heading_text(l))]
    parts = []
    for n, i in enumerate(idx):
        end = idx[n + 1] if n + 1 < len(idx) else len(lines)
        parts.append({"title": heading_text(lines[i]).capitalize(), "children": inner(lines[i + 1:end])})
    return parts


def next_text(lines: list[str], i: int) -> tuple[str, int]:
    """The first non-empty line after `i`, and how many lines that took."""
    j = i + 1
    while j < len(lines) and not lines[j].strip():
        j += 1
    return (clean(lines[j]) if j < len(lines) else ""), j - i


def proper_nouns(lines: list[str]) -> set[str]:
    """Words the text writes capitalized mid-sentence (names), to set ALL-CAPS headings in sentence case."""
    cap: dict[str, int] = {}
    low: dict[str, int] = {}
    for l in lines:
        for m in re.finditer(r"(?<=[а-яё,;:] )([А-ЯЁа-яё][а-яё]+)", l):
            w = m.group(1)
            (cap if w[0].isupper() else low)[w.lower()] = (cap if w[0].isupper() else low).get(w.lower(), 0) + 1
    words = {w for w, n in cap.items() if n >= 3 and n > 4 * low.get(w, 0)}
    # Stems, so other grammatical forms count too: «Хохлаковой» → «Хохлаковых».
    return {w[:max(4, len(w) - 3)] for w in words}


def is_name(word: str, stems: set[str]) -> bool:
    return any(word.startswith(s) and len(word) - len(s) <= 4 for s in stems)


def sentence_case(s: str, names: set[str]) -> str:
    words = s.lower().split(" ")
    out = []
    for k, w in enumerate(words):
        core = re.sub(r"[^а-яё-]", "", w)
        if k == 0 or (core and is_name(core, names)) or (k > 0 and words[k - 1].endswith((".", "!", "?"))):
            w = re.sub(r"[а-яё]", lambda m: m.group(0).upper(), w, count=1)
        out.append(w)
    return " ".join(out)


def ru_works_more(corpus: Path) -> list[dict]:
    works = []

    # Мёртвые души, том первый — «ГЛАВА ПЕРВАЯ» … «ГЛАВА ОДИННАДЦАТАЯ»; translation notes are separate lines.
    lines = read_lines(corpus / "Gogol_Mertvye.txt")
    lines = [l for l in lines if not re.match(r"^\s*\d+\s+.*\((франц|лат|нем|англ|итал|греч)\.\)\s*$", l)]
    lines = reflow(lines[find(lines, r"^\s*ГЛАВА ПЕРВАЯ\s*$"):])
    works.append({"id": "mertvye-dushi", "title": "Мёртвые души", "author": "Николай Гоголь", "subtitle": "Поэма. Том первый",
                  "chapters": split_at(lines, lambda l: bool(re.match(r"^\s*ГЛАВА [А-ЯЁ]+\s*$", l)),
                                       lambda i: (clean(lines[i]).capitalize(), 0))})

    # Тарас Бульба — I…XII; the file goes on with other stories from «Миргорода».
    lines = read_lines(corpus / "Gogol_Taras.txt")
    lines = reflow(lines[:find(lines, r"^\s*Вечер накануне Ивана Купала\s*$")])
    works.append({"id": "taras-bulba", "title": "Тарас Бульба", "author": "Николай Гоголь", "chapters": roman_chapters(lines)})

    # Дубровский — two volumes of «ГЛАВА I» chapters.
    lines = reflow(read_lines(corpus / "Pushkin_Dubrovsky.txt"))
    chap = lambda ls: split_at(ls, lambda l: bool(re.match(r"^\s*ГЛАВА\s+\S+\s*$", l) and roman_of(l.split()[-1])),
                               lambda i: (f"Глава {roman_of(ls[i].split()[-1])}", 0))
    works.append({"id": "dubrovskiy", "title": "Дубровский", "author": "Александр Пушкин",
                  "chapters": parts_of(lines, r"^ТОМ (ПЕРВЫЙ|ВТОРОЙ)$", chap)})

    # Идиот — four parts of «I.» chapters; the translation notes at the end are cut.
    lines = read_lines(corpus / "Dostoyevski_Idiot.txt")
    lines = reflow(lines[:find(lines, r"^\s*1 сударыни \(франц\.\)\s*$")])
    works.append({"id": "idiot", "title": "Идиот", "author": "Фёдор Достоевский",
                  "chapters": parts_of(lines, r"^ЧАСТЬ (" + "|".join(ORDINALS) + ")$", roman_chapters)})

    # Бесы — part → «Глава первая» + its title line → numbered sections (subheadings); the notes at the end are cut.
    lines = read_lines(corpus / "Dostoyevski_Biesy.txt")
    epi = [tidy(clean(l)) for l in lines[find(lines, r"^\s*Роман в трех частях\s*$") + 1:find(lines, r"^\s*Часть первая\s*$")] if clean(l)]
    lines = reflow(lines[find(lines, r"^\s*Часть первая\s*$"):find(lines, r"^\s*1 1\S")])

    def besy_chapters(ls: list[str]) -> list[dict]:
        def title(i: int) -> tuple[str, int]:
            name, skip = next_text(ls, i)
            head = heading_text(ls[i]).capitalize()
            named = name and not roman_of(name)
            return (f"{head}. {name.rstrip('.')}" if named else head), (skip if named else 0)
        return split_at(ls, lambda l: bool(re.match(r"^\s*Глава [а-яё]+\s*$", l)), title, sections=True, epigraph=False)

    works.append({"id": "besy", "title": "Бесы", "author": "Фёдор Достоевский", "subtitle": "Роман в трёх частях",
                  "epigraph": epi, "chapters": parts_of(lines, r"^Часть (первая|вторая|третья)$", besy_chapters)})

    # Бедные люди — a novel in letters: one chapter per month, each letter's date as a subheading.
    lines = read_lines(corpus / "Dostoyevsky_BednyeLyudi.txt")
    months = ["Января", "Февраля", "Марта", "Апреля", "Мая", "Июня", "Июля", "Августа", "Сентября", "Октября", "Ноября", "Декабря"]
    names = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]
    date_rx = re.compile(r"^\s*(" + "|".join(months) + r") (\d{1,2})\.?\s*$")
    first = next(i for i, l in enumerate(lines) if date_rx.match(l))
    epi = [tidy(clean(l)) for l in lines[1:first] if clean(l)]
    chapters: list[dict] = []
    for i in range(first, len(lines)):
        m = date_rx.match(lines[i])
        if m:
            month = names[months.index(m.group(1))]
            if not chapters or chapters[-1]["title"] != month:
                chapters.append({"title": month, "epigraph": [], "paragraphs": []})
            chapters[-1]["paragraphs"].append(f"{SUB}{m.group(1)} {m.group(2)}")
        elif clean(lines[i]):
            chapters[-1]["paragraphs"].append(tidy(clean(lines[i])))
    works.append({"id": "bednye-lyudi", "title": "Бедные люди", "author": "Фёдор Достоевский", "epigraph": epi, "chapters": chapters})

    # Братья Карамазовы — four files: part → book (+ its name) → «I. TITLE.» chapters; epilogue in the last file.
    lines: list[str] = []
    for k in (1, 2, 3, 4):
        lines += read_lines(corpus / f"Dostoyevsky_Karamazow{k}.txt")
    lines = reflow(lines)
    names_ = proper_nouns(lines)
    start = find(lines, r"^\s*ОТ АВТОРА\.?\s*$")
    epi = join_lines([tidy(clean(l)) for l in lines[:start] if clean(l)])
    first_part = find(lines, r"^\s*ЧАСТЬ ПЕРВАЯ\.?\s*$")
    chapters = [chapter2("От автора", lines[start + 1:first_part], epigraph=False)]
    head_rx = re.compile(r"^\s*(КНИГА [А-ЯЁ]+|ЭПИЛОГ)\.?\s*$")
    ch_rx = re.compile(r"^\s*([IVXLCХ]+)\.\s+(.+?)\.?\s*$")
    part = ""
    book: dict | None = None
    cur: tuple[str, int] | None = None

    def close(end: int) -> None:
        if cur and book is not None:
            c = chapter2(cur[0], lines[cur[1]:end], epigraph=False)
            if c["paragraphs"]:
                book["children"].append(c)

    for i in range(first_part, len(lines)):
        l = lines[i]
        p = re.match(r"^\s*ЧАСТЬ ([А-ЯЁ]+)\.?\s*$", l)
        if p:
            close(i)
            cur = None
            part = f"Часть {p.group(1).lower()}"
            continue
        h = head_rx.match(l)
        if h:
            close(i)
            cur = None
            title = h.group(1).capitalize()
            name, _ = next_text(lines, i)
            if title != "Эпилог" and name and not ch_rx.match(name):
                name = name.rstrip(".")
                title = f"{title}. {sentence_case(name, names_) if name.upper() == name else name}"
            book = {"title": f"{part} · {title}" if title != "Эпилог" else "Эпилог", "children": []}
            chapters.append(book)
            continue
        c = ch_rx.match(l)
        if c and len(c.group(2)) < 160 and c.group(2).upper() == c.group(2):
            close(i)
            raw, body_at = clean(l), i + 1
            if raw.endswith(","):  # the title goes on on the next line
                more, skip = next_text(lines, i)
                raw, body_at = f"{raw} {more}", i + 1 + skip
            t = ch_rx.match(raw)
            cur = (f"{roman_of(t.group(1))}. {sentence_case(t.group(2), names_)}", body_at)
    close(len(lines))
    works.append({"id": "bratya-karamazovy", "title": "Братья Карамазовы", "author": "Фёдор Достоевский",
                  "subtitle": "Роман в четырёх частях с эпилогом", "epigraph": epi, "chapters": chapters})

    # Воскресение — three parts of Roman-numbered chapters; the gospel epigraphs open the first part.
    lines = read_lines(corpus / "Tolstoi_Voskreseniye.txt")
    lines = [l for l in lines if clean(l) != "Конец"]
    p1 = find(lines, r"^\s*Часть первая\s*$")
    ch1 = next(i for i in range(p1 + 1, len(lines)) if roman_of(lines[i]))
    epi = [tidy(clean(l)) for l in lines[p1 + 1:ch1] if clean(l)]
    lines = reflow(lines[:p1 + 1] + lines[ch1:])
    works.append({"id": "voskresenie", "title": "Воскресение", "author": "Лев Толстой", "epigraph": epi,
                  "chapters": parts_of(lines, r"^(ЧАСТЬ|Часть) (ПЕРВАЯ|ВТОРАЯ|ТРЕТЬЯ|первая|вторая|третья)$", roman_chapters)})

    # Тургенев — Roman-numbered chapters, some with an epilogue; «Вешние воды» opens with a romance as epigraph.
    for wid, title, fname in [("dvoryanskoe-gnezdo", "Дворянское гнездо", "Turgenev_DvoryanskoyeGnezdo"),
                              ("nakanune", "Накануне", "Turgenev_Nakanune"),
                              ("rudin", "Рудин", "Turgenev_Rudin"),
                              ("veshnie-vody", "Вешние воды", "Turgenev_VeshniyeVody")]:
        lines = read_lines(corpus / f"{fname}.txt")
        first = next(i for i, l in enumerate(lines) if roman_of(l))
        epi = [tidy(clean(l)) for l in lines[:first] if clean(l)]
        chs = roman_chapters(reflow(lines[first:]), stop=r"^ЭПИЛОГ$")
        if wid == "veshnie-vody":
            # The source's headings have typos («ХVI» after XXV, XLII twice): number the chapters in order.
            for n, c in enumerate(chs, 1):
                c["title"] = f"Глава {to_roman(n)}"
            # Before chapter I: the romance as the epigraph, then the unnumbered opening of the frame story.
            cut = epi.index("Из старинного романса") + 1
            chs.insert(0, {"title": "Вступление", "epigraph": [], "paragraphs": epi[cut:]})
            epi = epi[:cut]
        works.append({"id": wid, "title": title, "author": "Иван Тургенев", "epigraph": epi, "chapters": chs})

    # Роковые яйца — «Глава 1. Title» chapters, hard-wrapped.
    lines = reflow(read_lines(corpus / "Bulgakov_RokovyeYaytsa.txt"))
    rx = re.compile(r"^\s*Глава (\d+)\.\s*(.+?)\s*$")
    works.append({"id": "rokovye-yaytsa", "title": "Роковые яйца", "author": "Михаил Булгаков",
                  "chapters": split_at(lines, lambda l: bool(rx.match(l)),
                                       lambda i: (f"Глава {rx.match(lines[i]).group(1)}. {rx.match(lines[i]).group(2)}", 0), epigraph=False)})

    # Белая гвардия — dedication and epigraphs, three parts of arabic-numbered chapters, hard-wrapped.
    lines = read_lines(corpus / "Bulgakov_BelayaGvardiya.txt")
    p1 = find(lines, r"^\s*ЧАСТЬ ПЕРВАЯ\s*$")
    epi = [tidy(clean(l)) for l in lines[:p1] if clean(l)]
    epi = epi[:1] + join_lines(epi[1:])  # the dedication stays its own line
    lines = reflow(lines[p1:])
    num = lambda ls: split_at(ls, lambda l: bool(re.fullmatch(r"\s*\d{1,2}\s*", l)), lambda i: (f"Глава {ls[i].strip()}", 0), epigraph=False)
    works.append({"id": "belaya-gvardiya", "title": "Белая гвардия", "author": "Михаил Булгаков", "epigraph": epi,
                  "chapters": parts_of(lines, r"^ЧАСТЬ (ПЕРВАЯ|ВТОРАЯ|ТРЕТЬЯ)$", num)})

    # Мать — two parts of Roman-numbered chapters.
    lines = reflow(read_lines(corpus / "Gorky_Mat.txt"))
    works.append({"id": "mat", "title": "Мать", "author": "Максим Горький",
                  "chapters": parts_of(lines, r"^Часть (первая|вторая)$", roman_chapters)})

    # Мелкий бес — epigraph, Roman-numbered chapters; the variants printed after the novel are cut.
    lines = read_lines(corpus / "Sologub_MelkijBes.txt")
    lines = lines[:find(lines, r"^\s*ВАРИАНТЫ\s*$")]
    first = next(i for i, l in enumerate(lines) if roman_of(l))
    epi = [tidy(clean(l)) for l in lines[:first] if clean(l)]
    chs = roman_chapters(reflow(lines[first:]))
    # The date ends the novel; the editor's note on it («* Дата окончания…») is dropped.
    chs[-1]["paragraphs"] = [p.rstrip("*").rstrip() for p in chs[-1]["paragraphs"] if not p.startswith("* ")]
    works.append({"id": "melkiy-bes", "title": "Мелкий бес", "author": "Фёдор Сологуб", "epigraph": epi, "chapters": chs})
    return works


def se_work(repo: Path, wid: str) -> dict:
    """Read title/author from a Standard Ebooks content.opf (body files are used verbatim by the EPUB build)."""
    opf = (repo / "src/epub/content.opf").read_text(encoding="utf-8")
    title = re.search(r"<dc:title[^>]*>(.*?)</dc:title>", opf).group(1)
    author = re.search(r"<dc:creator[^>]*>(.*?)</dc:creator>", opf).group(1)
    return {"id": wid, "title": title, "author": author, "standardEbooks": str(repo)}


def main() -> None:
    corpus, se_dir, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    works = ru_works(corpus) + ru_works_more(corpus)
    for wid, repo in [
        ("time-machine", "h-g-wells_the-time-machine"),
        ("war-of-the-worlds", "h-g-wells_the-war-of-the-worlds"),
        ("flatland", "edwin-a-abbott_flatland"),
        ("franklin-autobiography", "benjamin-franklin_the-autobiography-of-benjamin-franklin"),
        ("meditations", "marcus-aurelius_meditations_george-long"),
        ("news-from-nowhere", "william-morris_news-from-nowhere"),
        ("leisure-class", "thorstein-veblen_the-theory-of-the-leisure-class"),
        ("pride-and-prejudice", "jane-austen_pride-and-prejudice"),
        ("frankenstein", "mary-shelley_frankenstein"),
        ("dracula", "bram-stoker_dracula"),
        ("dorian-gray", "oscar-wilde_the-picture-of-dorian-gray"),
        ("alice", "lewis-carroll_alices-adventures-in-wonderland"),
        ("sherlock-holmes", "arthur-conan-doyle_the-adventures-of-sherlock-holmes"),
        ("baskervilles", "arthur-conan-doyle_the-hound-of-the-baskervilles"),
        ("jekyll-and-hyde", "robert-louis-stevenson_the-strange-case-of-dr-jekyll-and-mr-hyde"),
        ("great-gatsby", "f-scott-fitzgerald_the-great-gatsby"),
        ("call-of-the-wild", "jack-london_the-call-of-the-wild"),
        ("eighty-days", "jules-verne_around-the-world-in-eighty-days_george-makepeace-towle"),
        ("treasure-island", "robert-louis-stevenson_treasure-island"),
        ("up-from-slavery", "booker-t-washington_up-from-slavery"),
        ("walden", "henry-david-thoreau_walden"),
        ("origin-of-species", "charles-darwin_the-origin-of-species"),
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
