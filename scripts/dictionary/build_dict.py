"""The reader's dictionary, built from Wiktionary (CC BY-SA 4.0) as extracted by wiktextract (kaikki.org):

  - ru: Russian words with their meanings explained in Russian (Russian Wiktionary), labels («устар.», «разг.»),
    an example and the stressed form; every inflected form leads to its word («кавалеристом» → «кавалерист»);
  - en: English words with Russian translations for each of their meanings (the translation tables of English
    Wiktionary, with a short English note saying which meaning), or the Russian meanings of Russian Wiktionary
    when those say more, or else the English definition; labels («устар.», «брит.»), the transcription; forms,
    «form of» and «alternative form of» senses lead to the word («went» → «go», «colour» → «color»).

    python3 scripts/dictionary/build_dict.py <ru.jsonl> <en.jsonl> <out dir> [<English.jsonl>]

ru.jsonl and en.jsonl are Russian Wiktionary's Russian and English words (https://kaikki.org/ruwiktionary/),
English.jsonl is English Wiktionary's English words (https://kaikki.org/dictionary/English/).

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


EN_LABELS = {
    "archaic": "устар.", "obsolete": "устар.", "dated": "устар.", "rare": "редк.", "dialectal": "диал.",
    "slang": "сленг", "informal": "разг.", "colloquial": "разг.", "figuratively": "перен.", "poetic": "поэт.",
    "literary": "книжн.", "formal": "офиц.", "humorous": "шутл.", "derogatory": "пренебр.", "vulgar": "груб.",
    "British": "брит.", "UK": "брит.", "US": "амер.", "Scotland": "шотл.", "Ireland": "ирл.", "Australia": "австрал.",
    "nautical": "мор.", "military": "воен.", "law": "юр.", "historical": "ист.", "euphemistic": "эвф.",
    "offensive": "оскорб.", "childish": "детск.", "Christianity": "церк.", "biblical": "библ.",
}
EN_SKIP_POS = {"character", "symbol", "suffix", "prefix", "infix", "interfix", "punct", "romanization"}
FORM_SKIP_TAGS = {
    "table-tags", "inflection-template", "class", "romanization", "canonical",
    # Not the same word: «FAIR» is listed among the forms of «findability».
    "abbreviation", "acronym", "initialism", "pronunciation-spelling", "misspelling", "nonstandard",
}
CYRILLIC = re.compile("[а-яё]", re.I)
SPELLING_OF = re.compile(r"\b(?:spelling|form|variant) of ([A-Za-z'-]+)\.?$")


def english_entries(path: str):
    """English Wiktionary's English words: per word, its entries with Russian translations grouped by meaning, its
    English definitions, labels and transcription; and the forms that lead to words."""
    entries: dict[str, list] = defaultdict(list)
    forms: dict[str, set] = defaultdict(set)
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            word = d.get("word", "")
            pos = d.get("pos", "")
            if d.get("lang_code") != "en" or not word or " " in word.strip() or len(word) > 40 or pos in EN_SKIP_POS:
                continue
            # Acronyms («FAIR», «GAN») would stand for the ordinary word they spell.
            if len(word) > 1 and word.isupper():
                continue
            k = key(word)
            if not k:
                continue
            defs = []
            groups: dict[str, list] = {}
            translations = list(d.get("translations", []))
            for s in d.get("senses", []):
                translations += s.get("translations", [])
                targets = [x.get("word", "") for x in s.get("form_of", []) + s.get("alt_of", [])]
                if targets:
                    for t in targets:
                        tk = key(t)
                        if tk and tk != k and " " not in tk:
                            forms[k].add(tk)
                    continue
                glosses = [g for g in s.get("glosses", []) if g and g.strip()]
                tags = s.get("tags", [])
                if not glosses or {"form-of", "alt-of", "abbreviation", "initialism", "acronym"} & set(tags):
                    continue
                # «Commonwealth and Ireland standard spelling of color.»: a way to the word, not a meaning.
                spelling = SPELLING_OF.search(glosses[-1])
                if spelling:
                    tk = key(spelling.group(1))
                    if tk and tk != k:
                        forms[k].add(tk)
                    continue
                if len(defs) < 4:
                    m = {"d": clean(glosses[-1], 160), "en": 1}
                    labels = list(dict.fromkeys(EN_LABELS[t] for t in s.get("tags", []) if t in EN_LABELS))
                    if labels:
                        m["l"] = labels[:3]
                    defs.append(m)
            for t in translations:
                if t.get("code") != "ru" and t.get("lang_code") != "ru":
                    continue
                ru = (t.get("word") or "").strip()
                if not ru or not CYRILLIC.search(ru) or len(ru) > 40:
                    continue
                # «be of the opinion that — see also believe, opine» → «be of the opinion that».
                sense = clean(re.sub(r"\s*[—–-]\s*see also\b.*$", "", t.get("sense") or "", flags=re.I), 70)
                group = groups.setdefault(sense, [])
                if len(group) < 5 and all(key(x) != key(ru) for x in group):
                    group.append(ru)
            if not defs and not groups:
                continue
            ipa = next((x["ipa"] for x in d.get("sounds", []) if x.get("ipa")), None)
            entries[k].append({"w": word, "p": POS.get(pos, ""), "i": ipa, "defs": defs, "groups": list(groups.items())[:8]})
            for f in d.get("forms", []):
                form = f.get("form", "")
                if FORM_SKIP_TAGS & set(f.get("tags", [])) or (len(form) > 1 and form.isupper()):
                    continue
                fk = key(form)
                if fk and fk != k and " " not in fk and len(fk) <= 40 and not fk.startswith("-"):
                    forms[fk].add(k)
    return entries, forms


def merge_english(en_entries, en_forms, ru_entries, ru_forms):
    """One English dictionary from both Wiktionaries (see the module's description)."""
    out: dict[str, list] = {}
    for k in set(en_entries) | set(ru_entries):
        ru_list = list(ru_entries.get(k, []))
        merged = []
        for e in en_entries.get(k, []):
            match = next((r for r in ru_list if r["p"] == e["p"]), None)
            groups = [{"d": ", ".join(words), **({"h": sense} if sense else {})} for sense, words in e["groups"]]
            if groups and (not match or len(match["m"]) <= len(groups) + 1):
                meanings = groups
                if len(groups) == 1:
                    meanings = groups + e["defs"][:2]
            elif match:
                meanings = match["m"]
            else:
                meanings = e["defs"]
            if match:
                ru_list.remove(match)
            if not meanings:
                continue
            entry = {"w": e["w"], "p": e["p"]}
            ipa = e["i"] or (match or {}).get("i")
            if ipa:
                entry["i"] = ipa
            entry["m"] = meanings[:MAX_SENSES["en"]]
            merged.append(entry)
        merged += ru_list
        # What the reader can read first: entries with Russian meanings before those with English definitions only.
        merged.sort(key=lambda e: all(m.get("en") for m in e["m"]))
        if merged:
            out[k] = merged
    forms: dict[str, set] = defaultdict(set)
    for src in (en_forms, ru_forms):
        for f, ts in src.items():
            forms[f].update(ts)
    forms = {f: sorted(t for t in ts if t in out and t != f) for f, ts in forms.items()}
    return out, {f: ts for f, ts in forms.items() if ts}


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
    enwikt_path = sys.argv[4] if len(sys.argv) > 4 else None
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for lang, path in (("en", en_path), ("ru", ru_path)):
        entries, forms = build(path, lang)
        if lang == "en" and enwikt_path:
            en_entries, en_forms = english_entries(enwikt_path)
            entries, forms = merge_english(en_entries, en_forms, entries, forms)
        size, n = shard(entries, forms, out, lang)
        print(f"{lang}: {len(entries)} words, {len(forms)} forms → {n} shards, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
