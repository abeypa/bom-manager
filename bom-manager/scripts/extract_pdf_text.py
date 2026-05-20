from __future__ import annotations

import sys
from pathlib import Path

from pypdf import PdfReader


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: extract_pdf_text.py <pdf_path>")
        return 2

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(f"File not found: {pdf_path}")
        return 1

    reader = PdfReader(str(pdf_path))
    print(f"pages={len(reader.pages)}")
    print("-----BEGIN TEXT-----")
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        print(f"\n=== PAGE {i} ===\n")
        print(text)
    print("-----END TEXT-----")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
