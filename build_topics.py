"""Builds the topical-index data files from public-domain SWORD modules
(crosswire.org):

  Thompson Chain Topics  (TCR)     -> data/tcr_refs.js      window.TCR_TOPICS / TCR_VERSES
  Torrey's New Topical Textbook    -> data/torrey_refs.js   window.TORREY_TOPICS / TORREY_VERSES
  Nave's Topical Bible             -> data/nave_refs.js     window.NAVE_TOPICS / NAVE_VERSES

Each file holds  TOPICS = [[name, text], ...]  and
                 VERSES = {"book.chapter.verse": [topicId, ...]}
(book 0-based, chapter/verse 1-based, canonical Protestant order = BIBLE_PT).
Nave's text carries exact links as markers  [[book.chapter.vStart.vEnd|label]],
rendered by BibleRefs.renderMarked; the other two use plain "Ex 4:14" text that
BibleRefs.linkify recognises.

Run: python build_topics.py   (downloads the modules)
"""
import html, io, json, os, re, struct, urllib.request, zipfile, zlib

BASE = "https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/%s.zip"
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

# (TCR-style abbreviation, OSIS id) in canonical order = BIBLE_PT order
BOOKS = [
    ("Ge", "Gen"), ("Ex", "Exod"), ("Le", "Lev"), ("Nu", "Num"), ("De", "Deut"), ("Jos", "Josh"), ("Jud", "Judg"),
    ("Ru", "Ruth"), ("1Sa", "1Sam"), ("2Sa", "2Sam"), ("1Ki", "1Kgs"), ("2Ki", "2Kgs"), ("1Ch", "1Chr"),
    ("2Ch", "2Chr"), ("Ezr", "Ezra"), ("Ne", "Neh"), ("Es", "Esth"), ("Job", "Job"), ("Ps", "Ps"), ("Pr", "Prov"),
    ("Ec", "Eccl"), ("So", "Song"), ("Isa", "Isa"), ("Jer", "Jer"), ("La", "Lam"), ("Eze", "Ezek"), ("Da", "Dan"),
    ("Ho", "Hos"), ("Joe", "Joel"), ("Am", "Amos"), ("Ob", "Obad"), ("Jon", "Jonah"), ("Mic", "Mic"), ("Na", "Nah"),
    ("Hab", "Hab"), ("Zep", "Zeph"), ("Hag", "Hag"), ("Zec", "Zech"), ("Mal", "Mal"), ("Mt", "Matt"),
    ("Mr", "Mark"), ("Lu", "Luke"), ("Joh", "John"), ("Ac", "Acts"), ("Ro", "Rom"), ("1Co", "1Cor"),
    ("2Co", "2Cor"), ("Ga", "Gal"), ("Eph", "Eph"), ("Php", "Phil"), ("Col", "Col"), ("1Th", "1Thess"),
    ("2Th", "2Thess"), ("1Ti", "1Tim"), ("2Ti", "2Tim"), ("Tit", "Titus"), ("Phm", "Phlm"), ("Heb", "Heb"),
    ("Jas", "Jas"), ("1Pe", "1Pet"), ("2Pe", "2Pet"), ("1Jo", "1John"), ("2Jo", "2John"), ("3Jo", "3John"),
    ("Jude", "Jude"), ("Re", "Rev"),
]
ABBR_IDX = {a.lower(): i for i, (a, _) in enumerate(BOOKS)}
for k, v in {"gal": "Ga", "lam": "La", "dan": "Da", "he": "Heb", "mi": "Mic"}.items():
    ABBR_IDX[k] = ABBR_IDX[v.lower()]
OSIS_IDX = {o.lower(): i for i, (_, o) in enumerate(BOOKS)}
OSIS_IDX.update({"cant": 21, "jdg": 6, "phlm": 56, "song": 21})

VC = None


def load_verse_counts():
    txt = open(os.path.join(DATA, "bible_pt.js"), encoding="utf-8").read()
    data = json.loads(txt[txt.index("["):txt.rindex("]") + 1])
    return [[len(c) for c in b["chapters"]] for b in data]


def fetch(name):
    return zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(BASE % name).read()))


def read_rawld(z, base, enc="utf-8"):
    idx = z.read(base + ".idx")
    dat = z.read(base + ".dat")
    for i in range(len(idx) // 6):
        o, s = struct.unpack("<IH", idx[i * 6:i * 6 + 6])
        raw = dat[o:o + s].decode(enc, "replace")
        name, _, body = raw.partition("\n")
        yield name.strip(), body


def read_zld(z, base):
    idx, dat = z.read(base + ".idx"), z.read(base + ".dat")
    zdx, zdt = z.read(base + ".zdx"), z.read(base + ".zdt")
    blocks = {}

    def block(n):
        if n not in blocks:
            o, s = struct.unpack("<II", zdx[n * 8:n * 8 + 8])
            blocks[n] = zlib.decompress(zdt[o:o + s])
        return blocks[n]

    for i in range(len(idx) // 8):
        o, s = struct.unpack("<II", idx[i * 8:i * 8 + 8])
        rec = dat[o:o + s]
        key = rec[:-8].decode("cp1252", "replace").strip("\r\n\0 ")
        bn, en = struct.unpack("<II", rec[-8:])
        b = block(bn)
        eo, es = struct.unpack("<II", b[4 + en * 8:12 + en * 8])
        yield key, b[eo:eo + es].decode("utf-8", "replace")


def nice_name(name):
    if not name.isupper():
        return name
    return re.sub(r"(?<![A-Za-z'])([A-Za-z])([A-Za-z]*)", lambda m: m.group(1) + m.group(2).lower(), name)


def add(verses, tid, b, c, v):
    ids = verses.setdefault("%d.%d.%d" % (b, c, v), [])
    if tid not in ids:
        ids.append(tid)


def add_range(verses, tid, b, c1, v1, c2, v2, stats):
    if c1 < 1 or c2 > len(VC[b]) or c2 < c1:
        stats["bad"] += 1
        return
    for cc in range(c1, c2 + 1):
        vs = v1 if cc == c1 else 1
        ve = v2 if cc == c2 else VC[b][cc - 1]
        for vv in range(vs, min(ve, VC[b][cc - 1]) + 1):
            add(verses, tid, b, cc, vv)
            stats["refs"] += 1


# ---- "Ex 4:14; 5:20; 7:1,7,12" style references (Thompson, Torrey) ----
def parse_ref(text, tid, verses, stats):
    book = ch = None
    for part in text.split(";"):
        p = part.strip()
        if not p:
            continue
        m = re.match(r"^((?:[1-3])?\s?[A-Za-z]+)\s+(.*)$", p)
        if m and m.group(1).lower().replace(" ", "") in ABBR_IDX:
            book = ABBR_IDX[m.group(1).lower().replace(" ", "")]
            rest, ch = m.group(2), None
        else:
            rest = p
        if book is None:
            stats["bad"] += 1
            continue
        single = len(VC[book]) == 1
        for piece in rest.split(","):
            piece = piece.strip()
            if not piece:
                continue
            m2 = re.match(r"^(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$", piece)
            if m2:
                c1, v1 = int(m2.group(1)), int(m2.group(2))
                if m2.group(4):
                    c2 = int(m2.group(3)) if m2.group(3) else c1
                    v2 = int(m2.group(4))
                else:
                    c2, v2 = c1, v1
                ch = c2
                add_range(verses, tid, book, c1, v1, c2, v2, stats)
                continue
            m3 = re.match(r"^(\d+)(?:-(\d+))?$", piece)
            if not m3:
                stats["bad"] += 1
                continue
            a, z = int(m3.group(1)), int(m3.group(2) or m3.group(1))
            if ch is not None or single:
                c = ch if ch is not None else 1
                ch = c
                add_range(verses, tid, book, c, a, c, z, stats)
            else:  # whole chapter(s)
                if a >= 1 and z <= len(VC[book]):
                    for cc in range(a, z + 1):
                        add_range(verses, tid, book, cc, 1, cc, VC[book][cc - 1], stats)
                else:
                    stats["bad"] += 1


def thml_plain(body):
    t = body.replace("\r\n", "\n").replace("\xa0", " ")
    t = re.sub(r"<br\s*/?>", "\n", t)
    t = re.sub(r"</?(b|i|term|scripRef)>", "", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def build_thml(mod, base, prefix, enc):
    topics, verses, stats = [], {}, {"refs": 0, "bad": 0}
    for name, body in read_rawld(fetch(mod), base, enc):
        if not name:
            continue
        tid = len(topics)
        topics.append([nice_name(name), thml_plain(body)])
        for m in re.findall(r"<scripRef>(.*?)</scripRef>", body, re.S):
            parse_ref(m, tid, verses, stats)
    return topics, verses, stats


# ---- Nave (TEI with exact osisRef attributes) ----
def osis_point(s):
    parts = s.split(".")
    b = OSIS_IDX.get(parts[0].lower())
    if b is None:
        return None
    ch = int(parts[1]) if len(parts) > 1 else None
    v = int(parts[2]) if len(parts) > 2 else None
    return b, ch, v


def build_nave():
    topics, verses, stats = [], {}, {"refs": 0, "bad": 0}
    z = fetch("Nave")
    for name, body in read_zld(z, "modules/lexdict/zld/nave/dict"):
        if not name:
            continue
        tid = len(topics)

        def ref(m):
            osis, label = m.group(1), html.unescape(re.sub(r"<[^>]+>", "", m.group(2)))
            ends = osis.split("-")
            a = osis_point(ends[0])
            z_ = osis_point(ends[-1])
            if not a or not z_ or a[0] != z_[0] or a[1] is None or a[1] > len(VC[a[0]]):
                stats["bad"] += 1
                return label
            b, c1, v1 = a
            c2, v2 = z_[1] or c1, z_[2]
            if v1 is None:  # whole chapter: link to its first verse, don't index every verse
                return "[[%d.%d.1.1|%s]]" % (b, c1, label)
            if v2 is None:
                v2 = v1
            add_range(verses, tid, b, c1, v1, c2, v2, stats)
            return "[[%d.%d.%d.%d|%s]]" % (b, c1, v1, v2 if c2 == c1 else v1, label)

        t = re.sub(r'<ref osisRef="([^"]*)">(.*?)</ref>', ref, body, flags=re.S)
        t = t.replace("\x00", "")
        t = re.sub(r"<lb\s*/>", "\n", t)
        t = re.sub(r"<item[^>]*>", "\n  • ", t)
        t = re.sub(r"<[^>]+>", "", t)
        t = html.unescape(t)
        t = re.sub(r"[ \t]+\n", "\n", t)
        t = re.sub(r"\n{3,}", "\n\n", t).strip()
        topics.append([nice_name(name), t])
    return topics, verses, stats


def write(fname, prefix, label, topics, verses, stats):
    path = os.path.join(DATA, fname)
    with open(path, "w", encoding="utf-8") as f:
        f.write("// Generated by build_topics.py -- %s (public domain).\n" % label)
        f.write("window.%s_TOPICS=" % prefix + json.dumps(topics, ensure_ascii=False, separators=(",", ":")) + ";\n")
        f.write("window.%s_VERSES=" % prefix + json.dumps(verses, separators=(",", ":")) + ";\n")
    print(fname, len(topics), "topics,", len(verses), "verses,", stats, os.path.getsize(path), "bytes")


def main():
    global VC
    VC = load_verse_counts()
    write("tcr_refs.js", "TCR", "Thompson Chain Topics", *build_thml("TCR", "modules/lexdict/rawld/tcr/tcr", "TCR", "utf-8"))
    write("torrey_refs.js", "TORREY", "Torrey's New Topical Textbook", *build_thml("Torrey", "modules/lexdict/rawld/torrey/torrey", "TORREY", "cp1252"))
    write("nave_refs.js", "NAVE", "Nave's Topical Bible", *build_nave())


if __name__ == "__main__":
    main()
