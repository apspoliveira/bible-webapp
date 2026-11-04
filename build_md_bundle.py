"""Bundles every .md file under the Biblia folder into data/md_files.js, so
the webapp can seed a local copy into IndexedDB on browsers that don't
support the File System Access API (Android Chrome, notably) -- there's no
way for a mobile browser to read C:\\Users\\apspo\\Biblia directly, so the
content has to ship with the app instead.

Regenerate after adding/editing notes on the PC: python build_md_bundle.py
(the "Abrir pasta" flow on desktop still reads the live folder directly and
is unaffected by this bundle; this is only the Android/no-FSA fallback seed.)
"""
import json
import os
import sys

BIBLIA_ROOT = r"C:\Users\apspo\Biblia"
OUT_PATH = r"C:\Users\apspo\Documents\Code\webapp\data\md_files.js"
EXCLUDE_DIRS = {".venv", ".git", ".claude", ".vscode", "snippets_by_verse", "node_modules", "webapp"}


def scan_files():
    for dirpath, dirnames, filenames in os.walk(BIBLIA_ROOT):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for fn in filenames:
            if fn.lower().endswith(".md"):
                yield os.path.join(dirpath, fn)


def main():
    files = {}
    for path in sorted(scan_files()):
        rel = os.path.relpath(path, BIBLIA_ROOT).replace("\\", "/")
        try:
            with open(path, encoding="utf-8") as f:
                text = f.read()
        except UnicodeDecodeError:
            with open(path, encoding="latin-1") as f:
                text = f.read()
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        files[rel] = text

    print("Bundled", len(files), "files", file=sys.stderr)

    with open(OUT_PATH, "w", encoding="utf-8") as out:
        out.write("// Seed copy of every .md file under Biblia/, for browsers without the\n")
        out.write("// File System Access API (Android). Regenerate: python build_md_bundle.py\n")
        out.write("window.MD_FILES_SEED = ")
        json.dump(files, out, ensure_ascii=False, separators=(",", ":"))
        out.write(";\n")

    size_mb = os.path.getsize(OUT_PATH) / 1e6
    print("Wrote", OUT_PATH, "(%.2f MB)" % size_mb, file=sys.stderr)


if __name__ == "__main__":
    main()
