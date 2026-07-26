#!/usr/bin/env python3
"""
PhysioNutra tagline restyle script
------------------------------------
Restructures the header tagline on every page from a single line:
    <div class="tagline">Dr Tarun Garg's PhysioNutra Clinic</div>
into a stacked, two-size layout:
    <div class="tagline-stack">
      <span class="tagline-doctor">Dr Tarun's</span>
      <span class="tagline-brand">PhysioNutra Clinic</span>
    </div>

It also injects the required CSS (.tagline-stack / .tagline-doctor /
.tagline-brand) into each page's <style> block if not already present,
and updates the two mobile media-query overrides that reference the
old .tagline class name.

USAGE:
    Run from the root of your site repo (same folder as before):
        python3 fix_tagline.py

Safe to run multiple times.
"""

import re
import sys
from pathlib import Path

ROOT = Path(".")
HTML_FILES = list(ROOT.rglob("*.html"))

# ── Pattern 1: the old single-line tagline div (any wording variant) ──
TAGLINE_DIV_RE = re.compile(
    r'<div\s+class="tagline">\s*Dr\s+Tarun(?:\s+Garg)?\'s\s+PhysioNutra\s+Clinic\s*</div>',
    re.IGNORECASE
)

NEW_TAGLINE_HTML = (
    '<div class="tagline-stack">\n'
    '            <span class="tagline-doctor">Dr Tarun\'s</span>\n'
    '            <span class="tagline-brand">PhysioNutra Clinic</span>\n'
    '          </div>'
)

# ── Pattern 2: base .tagline CSS rule ──
BASE_CSS_RE = re.compile(
    r'\.tagline\{font-size:\.85rem;color:#666;font-style:italic\}'
)
NEW_BASE_CSS = (
    '.tagline-stack{display:flex;flex-direction:column;line-height:1.2}\n'
    '.tagline-doctor{font-size:.72rem;color:#666;font-style:italic;letter-spacing:.02em}\n'
    '.tagline-brand{font-size:1.05rem;font-weight:600;color:#7ad16c}'
)

# ── Pattern 3 & 4: mobile media-query overrides ──
TABLET_RE = re.compile(r'\.logo\{height:48px\}\.tagline\{font-size:\.7rem\}')
NEW_TABLET = '.logo{height:48px}.tagline-doctor{font-size:.62rem}.tagline-brand{font-size:.92rem}'

MOBILE_RE = re.compile(r'\.logo\{height:44px\}\.tagline\{display:none\}')
NEW_MOBILE = '.logo{height:44px}.tagline-doctor{display:none}.tagline-brand{font-size:.85rem}'


def process_file(path: Path):
    original = path.read_text(encoding="utf-8")
    text = original

    text = TAGLINE_DIV_RE.sub(NEW_TAGLINE_HTML, text)
    text = BASE_CSS_RE.sub(NEW_BASE_CSS, text)
    text = TABLET_RE.sub(NEW_TABLET, text)
    text = MOBILE_RE.sub(NEW_MOBILE, text)

    if text != original:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main():
    if not HTML_FILES:
        print(f"No .html files found under {ROOT.resolve()}. "
              f"Run this script from your site's repo root.")
        sys.exit(1)

    changed = 0
    for f in HTML_FILES:
        if process_file(f):
            print(f"  updated: {f}")
            changed += 1

    print(f"\nDone. {changed}/{len(HTML_FILES)} files updated.")
    print("Review with `git diff` before committing.")


if __name__ == "__main__":
    main()
