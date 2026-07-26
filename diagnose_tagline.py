#!/usr/bin/env python3
"""
Tagline diagnostic script
--------------------------
Finds every page that still contains the word "tagline" (meaning it
wasn't converted by fix_tagline.py) and prints the exact surrounding
HTML, so we can see exactly why the pattern didn't match — different
quote characters, different wording, extra whitespace, etc.

USAGE:
    python3 diagnose_tagline.py
"""

import re
from pathlib import Path

ROOT = Path(".")
HTML_FILES = list(ROOT.rglob("*.html"))

# Find any line containing the word "tagline" that ISN'T already the
# new tagline-stack/tagline-doctor/tagline-brand classes.
OLD_TAGLINE_RE = re.compile(r'.*\btagline\b(?!-stack|-doctor|-brand).*', re.IGNORECASE)

def main():
    found_any = False
    for f in sorted(HTML_FILES):
        text = f.read_text(encoding="utf-8", errors="replace")
        for lineno, line in enumerate(text.splitlines(), 1):
            if OLD_TAGLINE_RE.search(line) and "tagline-stack" not in line and "tagline-doctor" not in line and "tagline-brand" not in line:
                found_any = True
                print(f"{f}:{lineno}")
                print(f"    {line.strip()}")
                print()

    if not found_any:
        print("No unmatched tagline references found — all pages are converted.")

if __name__ == "__main__":
    main()
