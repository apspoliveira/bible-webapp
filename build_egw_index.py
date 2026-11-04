"""Builds data/egw_index.js from the "EGW Index, vols. 1-4 (Scripture Index)"
PDF (the economical-printing edition of the Ellen G. White Estate's
Comprehensive Index, scripture part).

The PDF is NOT shipped with the app: it is Estate material for personal use.
Put it at  ../sources/egw-index-scripture.pdf  (or pass a path) and run:

    python build_egw_index.py [path/to/egw-index.pdf]

Output: window.EGW_INDEX_BOOKS = {key: full title}   (e.g. "PP": "Patriarchs and Prophets")
        window.EGW_INDEX = {"book.chapter": {"c": "refs", "v": [[vStart, vEnd, "refs"], ...]}}
where "refs" is the index's own text ("CT 13 / Ed 128-9, 215 / PP 44-51"),
"c" = references to the chapter as a whole, "v" = references to verse ranges
(book 0-based in canonical order, chapter 1-based).

Because this data is derived from Estate material, keep the generated file
local (do not publish the app with it) unless the Estate's terms allow it.
"""
import json, os, re, sys
import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
PDF = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "sources", "egw-index-scripture.pdf")
OUT = os.path.join(HERE, "data", "egw_index.js")

BOOKS = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "1 Samuel",
         "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job",
         "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel",
         "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai",
         "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians",
         "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians",
         "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter",
         "1 John", "2 John", "3 John", "Jude", "Revelation"]
CHAPTERS = [50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48,
            12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1,
            13, 5, 5, 3, 5, 1, 1, 1, 22]
BOOK_LINE = {b.lower(): i for i, b in enumerate(BOOKS)}
SKIP_LINES = {"old testament", "new testament", "table of contents"}


def read_keys(doc):
    """Abbreviation -> title, from the 'Ellen G. White Book Title Abbreviations' pages."""
    lines = []
    for i in range(3, 6):
        for ln in doc[i].get_text().splitlines():
            ln = ln.strip()
            if ln and not re.fullmatch(r"\d+", ln):
                lines.append(ln)
    start = lines.index("Books")
    ignore = {"Key", "Book Title", "Books", "Devotionals", "Commentaries"}
    stop = next(j for j, l in enumerate(lines) if l == "Old Testament")
    body = [l for l in lines[start:stop] if l not in ignore]
    keys = {}
    for k in range(0, len(body) - 1, 2):
        keys[body[k]] = body[k + 1]
    return keys


def collect(doc):
    """Body lines per book (page footers - a lone page number - dropped)."""
    per_book, cur = {}, None
    for pno in range(5, doc.page_count):
        lines = [l.strip() for l in doc[pno].get_text().splitlines()]
        while lines and (not lines[-1] or re.fullmatch(r"\d+", lines[-1])):
            lines.pop()
        for ln in lines:
            if not ln or ln.lower() in SKIP_LINES:
                continue
            if ln.lower() in BOOK_LINE:
                cur = BOOK_LINE[ln.lower()]
                per_book.setdefault(cur, [])
                continue
            if cur is not None:
                per_book[cur].append(ln)
    return per_book


PAGE = re.compile(r"^\d+(?:[.\-]\d+)*[a-z]?,?$")
NUM = re.compile(r"^\d+(?:-\d+)?,?$")


def parse_book(lines, keys):
    tokens = " ".join(lines).split()
    merged = []
    for t in tokens:  # "160-" + "1"  (range split by a line break)
        if merged and re.fullmatch(r"\d+-", merged[-1]) and re.fullmatch(r"\d+,?", t):
            merged[-1] += t
        else:
            merged.append(t)
    chapters, ch = {}, 0
    state, spec, refs, cur, pending_comma = "idle", "C", [], None, False

    def commit_ref():
        nonlocal cur
        if cur and cur[1]:
            refs.append(cur[0] + " " + " ".join(cur[1]).replace(", ", ", "))
        cur = None

    def commit_segment():
        commit_ref()
        if ch and refs:
            entry = chapters.setdefault(ch, {"c": "", "v": []})
            text = " / ".join(refs)
            if spec == "C":
                entry["c"] = (entry["c"] + " / " + text) if entry["c"] else text
            else:
                for a, b in spec:
                    entry["v"].append([a, b, text])
        refs.clear()

    def parse_spec(toks):
        out, i = [], 0
        vals = []
        for t in toks:
            vals.append(t)
        # tokens: "3", "3,", "-", "5", "3-5"
        i = 0
        while i < len(vals):
            t = vals[i].rstrip(",")
            if re.fullmatch(r"\d+-\d+", t):
                a, b = map(int, t.split("-"))
                out.append((a, b))
            elif re.fullmatch(r"\d+", t):
                a = int(t)
                if i + 2 < len(vals) + 0 and vals[i + 1] == "-" and re.fullmatch(r"\d+,?", vals[i + 2]):
                    out.append((a, int(vals[i + 2].rstrip(","))))
                    i += 2
                else:
                    out.append((a, a))
            i += 1
        return out

    spec_toks = []
    for t in merged:
        m = re.fullmatch(r"(\d+)\.", t)
        if m and int(m.group(1)) == ch + 1:
            commit_segment()
            ch, spec, spec_toks, state = ch + 1, "C", [], "start"
            continue
        if t == "/":
            commit_ref()
            state = "refs_wait"
            continue
        if t in keys:
            if state == "spec":
                spec = parse_spec(spec_toks)
            commit_ref()
            cur, pending_comma, state = (t, []), False, "pages"
            continue
        if state == "pages":
            if PAGE.match(t) and (not cur[1] or pending_comma):
                cur[1].append(t)
                pending_comma = t.endswith(",")
                continue
            if NUM.match(t) or t == "-":  # a new verse specification begins
                commit_segment()
                spec_toks, state = [], "spec"
            else:
                continue  # annotation ("marg.", "RV", ...)
        elif state == "start" and NUM.match(t):
            state, spec_toks = "spec", []
        if state == "spec":
            if NUM.match(t) or t == "-":
                spec_toks.append(t)
            # anything else in a spec is an annotation (RV, marg., ARV): ignored
    commit_segment()
    return chapters


def main():
    doc = pymupdf.open(PDF)
    keys = read_keys(doc)
    print(len(keys), "book abbreviations")
    per_book = collect(doc)
    index, problems = {}, []
    for b in range(len(BOOKS)):
        chs = parse_book(per_book.get(b, []), keys)
        if not chs:
            problems.append("%s: nothing parsed" % BOOKS[b])
            continue
        top = max(chs)
        if top != CHAPTERS[b]:
            problems.append("%s: last chapter %d, expected %d" % (BOOKS[b], top, CHAPTERS[b]))
        for c, e in chs.items():
            if c <= CHAPTERS[b]:
                index["%d.%d" % (b, c)] = e
    nseg = sum(len(e["v"]) + (1 if e["c"] else 0) for e in index.values())
    print(len(index), "chapters,", nseg, "segments")
    print("problems:", problems or "none")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// Generated by build_egw_index.py from the EGW Index vols. 1-4 (Scripture Index). Personal use.\n")
        f.write("window.EGW_INDEX_BOOKS=" + json.dumps(keys, ensure_ascii=False, separators=(",", ":")) + ";\n")
        f.write("window.EGW_INDEX=" + json.dumps(index, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
