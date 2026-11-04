"""Build a local page map for the Desire of Ages PDF.

Usage:
    python build_da_pages.py [path/to/en_DA.pdf]

The generated JavaScript contains only page-number mappings, not book text.
The PDF uses different pagination from the scripture index, so chapter-start
pages are interpolated to estimate corresponding PDF pages.
"""
import json
import re
import sys
from pathlib import Path

import pymupdf

HERE = Path(__file__).resolve().parent
INDEX_PATH = HERE / "data" / "egw_index.js"
OUT_PATH = HERE / "data" / "da_pages.js"
PDF_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Downloads" / "en_DA.pdf"
INDEX_RE = re.compile(r"window\.EGW_INDEX=(\{.*\});\s*$", re.DOTALL)
LOCATOR_RE = re.compile(r"(?<![\w.])(\d+)(?:\.\d+)?(?:\s*-\s*(\d+)(?:\.\d+)?)?")
PAGE_RE = re.compile(r"^\s*\[\s*(\d{1,4})\s*\]\s*$")


def expand_end(start: int, end_text: str) -> int:
    end = int(end_text)
    if end >= start or len(end_text) >= len(str(start)):
        return end
    scale = 10 ** len(end_text)
    end += (start // scale) * scale
    return end + scale if end <= start else end


def cited_da_pages() -> set[int]:
    source = INDEX_PATH.read_text(encoding="utf-8")
    match = INDEX_RE.search(source)
    if not match:
        raise ValueError(f"Could not read EGW_INDEX from {INDEX_PATH}")
    index = json.loads(match.group(1))
    pages = set()
    for chapter in index.values():
        references = [chapter.get("c", "")]
        references.extend(row[2] for row in chapter.get("v", []))
        for reference in references:
            for group in reference.split(" / "):
                if not group.startswith("DA "):
                    continue
                for locator in LOCATOR_RE.finditer(group[3:]):
                    start = int(locator.group(1))
                    end = expand_end(start, locator.group(2)) if locator.group(2) else start
                    if end - start > 1000:
                        raise ValueError(f"Unexpectedly broad DA page range: {locator.group(0)}")
                    pages.update(range(start, end + 1))
    return pages


def chapter_markers(doc: pymupdf.Document) -> list[tuple[int, int]]:
    markers = []
    for pdf_page, page in enumerate(doc):
        lines = page.get_text().splitlines()
        for line_index, line in enumerate(lines):
            if not line.strip().startswith("Chapter"):
                continue
            for candidate in lines[line_index + 1:line_index + 4]:
                match = PAGE_RE.fullmatch(candidate)
                if match:
                    markers.append((int(match.group(1)), pdf_page))
                    break
            break
    if len(markers) < 2:
        raise ValueError("Could not find chapter page markers in the PDF.")
    return markers


def map_pdf_page(page_number: int, markers: list[tuple[int, int]]) -> int:
    for left, right in zip(markers, markers[1:]):
        if left[0] <= page_number <= right[0]:
            ratio = (page_number - left[0]) / (right[0] - left[0])
            return round(left[1] + ratio * (right[1] - left[1]))
    if page_number < markers[0][0]:
        return markers[0][1]
    left, right = markers[-2:]
    ratio = (page_number - left[0]) / (right[0] - left[0])
    return round(left[1] + ratio * (right[1] - left[1]))


def main() -> None:
    if not PDF_PATH.is_file():
        raise FileNotFoundError(f"PDF not found: {PDF_PATH}")
    pages = cited_da_pages()
    if not pages:
        raise ValueError("The EGW scripture index contains no DA page references.")

    doc = pymupdf.open(PDF_PATH)
    markers = chapter_markers(doc)
    page_data = {}
    for page_number in sorted(pages):
        pdf_index = max(0, min(len(doc) - 1, map_pdf_page(page_number, markers)))
        page_data[str(page_number)] = {
            "pdfPage": pdf_index + 1,
        }
    doc.close()

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8", newline="\n") as output:
        output.write("// Generated locally by build_da_pages.py; contains page mappings only.\n")
        output.write("window.DA_PAGES=")
        json.dump(page_data, output, ensure_ascii=False, separators=(",", ":"))
        output.write(";\n")
    print(f"Built {len(page_data)} DA page entries from {PDF_PATH} -> {OUT_PATH}")


if __name__ == "__main__":
    main()
