"""The reader's dictionary, built from Russian Wiktionary (ru.wiktionary.org, CC BY-SA 4.0) as extracted by
wiktextract (https://kaikki.org/ruwiktionary/):

  - ru: Russian words with their meanings explained in Russian, labels («устар.», «разг.»), an example and the
    stressed form; every inflected form leads to its word («кавалеристом» → «кавалерист»);
  - en: English words with their meanings in Russian, the transcription and an example with its translation;
    forms and «form of» senses lead to the word («went» → «go»).

    python3 scripts/dictionary/build_dict.py <ru.jsonl> <en.jsonl> <out dir>

For each language the output is `<lang>.pack` (gzip-compressed shards, one after another) and `<lang>.index.json`
(shard name → [offset, length] in the pack). A shard holds the words and forms whose key starts with its name;
the app looks up the longest shard name that starts the word and reads just those bytes (an HTTP Range request).
Keys are lower case, without stress marks, «ё» as «е».
"""

import gzip
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

STRESS = re.compile("[̀́]")
TARGET = 48 * 1024  # compressed bytes per shard
MAX_SENSES = {"ru": 6, "en": 8}
POS = {
    "noun": "сущ.", "verb": "гл.", "adj": "прил.", "adv": "нареч.", "pron": "мест.", "prep": "предл.",
    "conj": "союз", "particle": "част.", "intj": "межд.", "num": "числ.", "name": "имя собств.",
    "abbrev": "сокр.", "phrase": "выраж.", "det": "опред.", "article": "артикль", "prefix": "приставка",
    "suffix": "суффикс", "participle": "прич.", "predicative": "предик.", "postp": "послелог",
}
GENDER = {"masculine": "м.", "feminine": "ж.", "neuter": "ср.", "perfective": "сов.", "imperfective": "несов."}


def key(word: str) -> str:
    return STRESS.sub("", word).lower().replace("ё", "е").strip()


def clean(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", text).strip().rstrip(";").strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def label(raw: str) -> str | None:
    """A short usage label («устар.», «разг., преимущ. мн. ч.»); long notes about grammar are left out."""
    raw = raw.strip().strip("[]").strip()
    if not raw or len(raw) > 28 or raw.lower() in {"существительное", "глагол", "прилагательное", "наречие", "междометие"}:
        return None
    if raw.startswith("используется с"):
        return None
    return raw


def entry_of(d: dict, lang: str) -> dict | None:
    meanings = []
    for s in d.get("senses", []):
        tags = s.get("tags", [])
        if "no-gloss" in tags or "form-of" in tags:
            continue
        glosses = [g for g in s.get("glosses", []) if g and g.strip()]
        if not glosses:
            continue
        m = {"d": clean("; ".join(glosses), 320)}
        labels = [x for x in (label(r) for r in s.get("raw_tags", [])) if x]
        if labels:
            m["l"] = labels[:3]
        # A short example for the first meanings: enough to see the word at work, not a page of quotes.
        if len(meanings) < 3:
            for ex in s.get("examples", []):
                text = (ex.get("text") or "").strip()
                if 8 <= len(text) <= 150:
                    m["x"] = clean(text, 150)
                    if ex.get("translation"):
                        m["t"] = clean(ex["translation"], 170)
                    elif ex.get("ref"):
                        m["r"] = clean(ex["ref"].split(",")[0].split("//")[0], 60)
                    break
        meanings.append(m)
        if len(meanings) >= MAX_SENSES[lang]:
            break
    if not meanings:
        return None
    e = {"w": d["word"], "p": POS.get(d.get("pos", ""), "")}
    forms = d.get("forms", [])
    # The stressed word, from its first form (the dictionary form) when that is the word itself.
    if lang == "ru" and forms and key(forms[0].get("form", "")) == key(d["word"]) and STRESS.search(forms[0]["form"]):
        e["s"] = forms[0]["form"]
    grammar = [GENDER[t] for t in d.get("tags", []) if t in GENDER]
    if grammar:
        e["g"] = ", ".join(dict.fromkeys(grammar))
    for snd in d.get("sounds", []):
        if snd.get("ipa"):
            e["i"] = snd["ipa"]
            break
    e["m"] = meanings
    return e


def build(path: str, lang: str):
    entries: dict[str, list] = defaultdict(list)
    forms: dict[str, set] = defaultdict(set)
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            word = d.get("word", "")
            if d.get("lang_code") != lang or not word or " " in word.strip() or len(word) > 40:
                continue
            k = key(word)
            if not k:
                continue
            # «form of» senses: an inflected form with its own page («went» → «go»).
            for s in d.get("senses", []):
                for fo in s.get("form_of", []):
                    target = key(fo.get("word", ""))
                    if target and target != k and " " not in target:
                        forms[k].add(target)
            e = entry_of(d, lang)
            if e:
                entries[k].append(e)
                for f in d.get("forms", []):
                    fk = key(f.get("form", ""))
                    if fk and fk != k and " " not in fk and len(fk) <= 40 and not fk.startswith("-"):
                        forms[fk].add(k)
    # A form leads only to words the dictionary has.
    forms = {f: sorted(t for t in ts if t in entries) for f, ts in forms.items()}
    forms = {f: ts for f, ts in forms.items() if ts}
    return entries, forms


def shard(entries, forms, out: Path, lang: str):
    keys = sorted(set(entries) | set(forms))

    def blob(ks):
        data = {"e": {k: entries[k] for k in ks if k in entries}, "f": {k: forms[k] for k in ks if k in forms}}
        return gzip.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode(), 9, mtime=0)

    leaves: dict[str, bytes] = {}

    def split(prefix: str, ks: list[str]):
        b = blob(ks)
        if len(b) <= TARGET or len(prefix) >= 6:
            leaves[prefix] = b
            return
        exact = [k for k in ks if len(k) == len(prefix)]
        if exact:
            leaves[prefix] = blob(exact)
        groups = defaultdict(list)
        for k in ks:
            if len(k) > len(prefix):
                groups[k[: len(prefix) + 1]].append(k)
        for p, g in sorted(groups.items()):
            split(p, g)

    top = defaultdict(list)
    for k in keys:
        top[k[0]].append(k)
    for p, g in sorted(top.items()):
        split(p, g)

    index = {}
    offset = 0
    with open(out / f"{lang}.pack", "wb") as pack:
        for p in sorted(leaves):
            b = leaves[p]
            pack.write(b)
            index[p] = [offset, len(b)]
            offset += len(b)
    meta = {
        "lang": lang,
        "source": "Викисловарь (ru.wiktionary.org), CC BY-SA 4.0, via wiktextract / kaikki.org",
        "words": len(entries),
        "forms": len(forms),
        "shards": index,
    }
    (out / f"{lang}.index.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return offset, len(leaves)


def main():
    ru_path, en_path, out_dir = sys.argv[1:4]
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for lang, path in (("en", en_path), ("ru", ru_path)):
        entries, forms = build(path, lang)
        size, n = shard(entries, forms, out, lang)
        print(f"{lang}: {len(entries)} words, {len(forms)} forms → {n} shards, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
