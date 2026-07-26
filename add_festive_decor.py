#!/usr/bin/env python3
"""
PhysioNutra festive decoration installer
--------------------------------------------
Inserts a <link> and <script> tag into every page's <head>, pointing at
festive-decor.css and festive-decor.js. Those two files handle everything
else automatically — showing the right themed decoration during festival
windows, and removing themselves the rest of the year.

SETUP:
    1. Put festive-decor.css and festive-decor.js in your site root
       (same folder as index.html) — or update FILE_PATH below if you'd
       rather keep them in a subfolder like /assets/.
    2. Run this script once from the repo root:
           python3 add_festive_decor.py
    3. Push everything live.

TO REMOVE THE FEATURE LATER (not just for the season — permanently):
    Run remove_festive_decor.py (companion script) to strip the tags
    back out of every page in one pass.

Safe to run multiple times — already-tagged pages are skipped.
"""

import re
from pathlib import Path

ROOT = Path(".")
HTML_FILES = list(ROOT.rglob("*.html"))

# Adjust this if you place the files somewhere other than the site root.
FILE_PATH = ""  # e.g. "assets/" if you move the files into /assets/

MARKER = "<!-- festive-decor -->"

TAGS = (
    f'{MARKER}\n'
    f'<link rel="stylesheet" href="/{FILE_PATH}festive-decor.css">\n'
    f'<script src="/{FILE_PATH}festive-decor.js" defer></script>\n'
)

HEAD_CLOSE_RE = re.compile(r'</head>', re.IGNORECASE)


def process_file(path: Path):
    text = path.read_text(encoding="utf-8")

    if MARKER in text:
        return False  # already installed

    if not HEAD_CLOSE_RE.search(text):
        return False  # no </head> found, skip safely

    new_text = HEAD_CLOSE_RE.sub(TAGS + "</head>", text, count=1)
    path.write_text(new_text, encoding="utf-8")
    return True


def main():
    changed = 0
    for f in HTML_FILES:
        if process_file(f):
            print(f"  installed: {f}")
            changed += 1

    print(f"\nDone. {changed}/{len(HTML_FILES)} files updated.")
    print("Review with `git diff` before committing.")


if __name__ == "__main__":
    main()
