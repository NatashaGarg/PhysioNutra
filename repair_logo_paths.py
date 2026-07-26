#!/usr/bin/env python3
"""
PhysioNutra logo path REPAIR script
------------------------------------
Fixes a bug from the previous fix_site_wide.py run: it hardcoded the WebP
source path as "images/logo.webp" on every page, but nested pages (like
/about/ or /blogs/xyz/) actually reference images using a relative prefix
like "../images/logo.png". That mismatch made the <source> 404, and
browsers that support WebP don't fall back to the working <img> — hence
the broken logo icon.

This script finds every already-wrapped <picture> logo block and rewrites
the srcset to use the SAME relative prefix as the <img> tag sitting right
next to it, so both point to the correct folder no matter how deep the
page is nested.

USAGE:
    Run this from the root of your site repo (same place you ran
    fix_site_wide.py before):
        python3 repair_logo_paths.py

Safe to run multiple times — once paths match, it makes no further changes.
"""

import re
import sys
from pathlib import Path

ROOT = Path(".")
HTML_FILES = list(ROOT.rglob("*.html"))

# Matches: <source srcset="ANY_PREFIX/images/logo.webp" type="image/webp">
#          followed eventually by <img ... src="SOME_PREFIX/images/logo.png" ...>
# We rebuild the srcset using SOME_PREFIX (the img's actual, correct prefix).
PICTURE_BLOCK_RE = re.compile(
    r'<source\s+srcset="[^"]*?(?:images/logo\.webp)"\s+type="image/webp">'
    r'(\s*<img\s+[^>]*?src=")([^"]*?images/logo\.png)("[^>]*>)',
    re.IGNORECASE
)

def fix_block(match):
    pre_img = match.group(1)          # e.g. '<img src="'  (up to and incl. src=")
    img_src_path = match.group(2)     # e.g. '../images/logo.png'
    post_img = match.group(3)         # rest of the img tag

    webp_path = img_src_path.replace("logo.png", "logo.webp")

    return (
        f'<source srcset="{webp_path}" type="image/webp">'
        f'{pre_img}{img_src_path}{post_img}'
    )


def process_file(path: Path):
    original = path.read_text(encoding="utf-8")
    text = PICTURE_BLOCK_RE.sub(fix_block, original)

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
            print(f"  repaired: {f}")
            changed += 1

    print(f"\nDone. {changed}/{len(HTML_FILES)} files repaired.")
    print("Review with `git diff` before committing.")


if __name__ == "__main__":
    main()
