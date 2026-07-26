#!/usr/bin/env python3
"""
PhysioNutra site-wide fixer
----------------------------
Run this against the ROOT of your local website repo (the folder that
contains index.html, /blogs/, /services/, etc). It walks every .html file
and applies two fixes automatically:

  1. Wraps any plain <img src="...logo.png" ...> in a <picture> element
     that serves logo.webp to modern browsers, falling back to the PNG.
  2. Obfuscates any plain-text "mailto:physionutraclinic@gmail.com" links
     so the address isn't scraped as literal text in the page source.

USAGE:
    1. Put logo.webp and logo.png in your /images/ folder (already done
       if you uploaded the ones I generated earlier).
    2. Copy this script to the root of your site repo.
    3. Run:  python3 fix_site_wide.py
    4. Review the diff (git diff) before committing/pushing.

It's safe to run more than once — already-fixed pages are skipped
because the regex only matches the OLD plain-<img> and OLD plain-mailto
patterns, which disappear once fixed.
"""

import re
import sys
from pathlib import Path

ROOT = Path(".")  # run this script from the root of your site repo
HTML_FILES = list(ROOT.rglob("*.html"))

# ── Pattern 1: plain <img ... src="...logo.png" ...> → <picture> wrapper ──
# Matches the whole <img> tag regardless of attribute order, as long as
# src points at logo.png and it's not already inside a <picture> wrapper.
IMG_LOGO_RE = re.compile(
    r'<img\s+([^>]*?src="[^"]*images/logo\.png"[^>]*?)>',
    re.IGNORECASE
)

def wrap_logo_img(match):
    attrs = match.group(1)
    return (
        f'<picture><source srcset="images/logo.webp" type="image/webp">'
        f'<img {attrs}>'
        f'</picture>'
    )

# Don't double-wrap images that are already inside a <picture> tag.
ALREADY_PICTURE_RE = re.compile(r'<picture>\s*<source[^>]*logo\.webp', re.IGNORECASE)

# ── Pattern 2: plain mailto link with visible email text → obfuscated ──
MAILTO_RE = re.compile(
    r'<a\s+([^>]*?)href="mailto:physionutraclinic@gmail\.com"([^>]*?)>'
    r'\s*physionutraclinic@gmail\.com\s*'
    r'</a>',
    re.IGNORECASE
)

def obfuscate_email(match):
    pre_attrs = match.group(1).strip()
    post_attrs = match.group(2).strip()
    attrs = f'{pre_attrs} {post_attrs}'.strip()
    return (
        f'<a href="#" {attrs} class="js-email" '
        f'data-user="physionutraclinic" data-domain="gmail.com" '
        f'onclick="this.href=\'mailto:\'+this.dataset.user+\'@\'+this.dataset.domain">'
        f'Email us</a>'
    )


def process_file(path: Path):
    original = path.read_text(encoding="utf-8")
    text = original

    # Skip logo wrapping on lines already inside a <picture> block
    if not ALREADY_PICTURE_RE.search(text):
        text = IMG_LOGO_RE.sub(wrap_logo_img, text)

    text = MAILTO_RE.sub(obfuscate_email, text)

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
            print(f"  fixed: {f}")
            changed += 1

    print(f"\nDone. {changed}/{len(HTML_FILES)} files updated.")
    print("Review with `git diff` before committing.")


if __name__ == "__main__":
    main()
