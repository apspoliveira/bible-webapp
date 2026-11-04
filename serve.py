"""Loopback-only dev server for the webapp and local DA PDF page extraction."""
import http.server
import json
import socketserver
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

import pymupdf

PDF_PATH = Path.home() / "Downloads" / "en_DA.pdf"
PDF_DOCUMENT = None

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        request = urlsplit(self.path)
        if request.path != "/da-page":
            return super().do_GET()

        page_values = parse_qs(request.query).get("page", [])
        if not page_values or not page_values[0].isdigit():
            self.send_error(400, "A numeric PDF page parameter is required")
            return
        if not PDF_PATH.is_file():
            self.send_error(404, "The Desire of Ages PDF was not found in Downloads")
            return

        global PDF_DOCUMENT
        if PDF_DOCUMENT is None:
            PDF_DOCUMENT = pymupdf.open(PDF_PATH)
        page_number = int(page_values[0])
        if page_number < 1 or page_number > PDF_DOCUMENT.page_count:
            self.send_error(404, "The requested PDF page does not exist")
            return

        try:
            payload = json.dumps(
                {"text": PDF_DOCUMENT[page_number - 1].get_text().strip()},
                ensure_ascii=False,
            ).encode("utf-8")
        except (OSError, RuntimeError) as error:
            self.log_error("Could not extract PDF page %s: %s", page_number, error)
            self.send_error(500, "Could not extract the requested PDF page")
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", 8791), Handler) as httpd:
    httpd.serve_forever()
