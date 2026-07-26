#!/usr/bin/env python3
"""
PhysioNutra tagline fix — Hindi & Punjabi pages
--------------------------------------------------
Targeted fix for hi/index.html and pa/index.html, which fix_tagline_v2.py
intentionally skipped (translated text needs manual handling).

Splits the existing translated tagline into the same stacked layout used
on the English pages, and drops "Garg"/"ਗਰਗ" to match the English wording
change (Dr Tarun's, not Dr Tarun Garg's). No new translation is introduced
— this only removes a name from the existing, already-translated text.

  Hindi:   डॉ. तरुण गर्ग का फिजियोन्यूट्रा क्लिनिक
        -> डॉ. तरुण का  /  फिजियोन्यूट्रा क्लिनिक

  Punjabi: ਡਾ. ਤਰੁਣ ਗਰਗ ਦਾ ਫਿਜ਼ੀਓਨੂਤਰਾ ਕਲੀਨਿਕ
        -> ਡਾ. ਤਰੁਣ ਦਾ  /  ਫਿਜ਼ੀਓਨੂਤਰਾ ਕਲੀਨਿਕ

USAGE:
    python3 fix_tagline_intl.py

Safe to run multiple times.
"""

import re
from pathlib import Path

ROOT = Path(".")

CANONICAL_CSS = (
    '.tagline-stack{display:flex;flex-direction:column;line-height:1.2}\n'
    '.tagline-doctor{font-size:.72rem;color:#666;font-style:italic;letter-spacing:.02em}\n'
    '.tagline-brand{font-size:1.05rem;font-weight:600;color:#7ad16c}'
)

CSS_RULE_RE = re.compile(r'\.tagline\s*\{\s*[^}]*?\s*\}')

# Hindi: डॉ. तरुण गर्ग का फिजियोन्यूट्रा क्लिनिक
HI_DIV_RE = re.compile(
    r'<div class="tagline">\s*डॉ\.\s*तरुण\s*गर्ग\s*का\s*फिजियोन्यूट्रा\s*क्लिनिक\s*</div>'
)
HI_REPLACEMENT = (
    '<div class="tagline-stack">\n'
    '            <span class="tagline-doctor">डॉ. तरुण का</span>\n'
    '            <span class="tagline-brand">फिजियोन्यूट्रा क्लिनिक</span>\n'
    '          </div>'
)

# Punjabi: ਡਾ. ਤਰੁਣ ਗਰਗ ਦਾ ਫਿਜ਼ੀਓਨੂਤਰਾ ਕਲੀਨਿਕ
PA_DIV_RE = re.compile(
    r'<div class="tagline">\s*ਡਾ\.\s*ਤਰੁਣ\s*ਗਰਗ\s*ਦਾ\s*ਫਿਜ਼ੀਓਨੂਤਰਾ\s*ਕਲੀਨਿਕ\s*</div>'
)
PA_REPLACEMENT = (
    '<div class="tagline-stack">\n'
    '            <span class="tagline-doctor">ਡਾ. ਤਰੁਣ ਦਾ</span>\n'
    '            <span class="tagline-brand">ਫਿਜ਼ੀਓਨੂਤਰਾ ਕਲੀਨਿਕ</span>\n'
    '          </div>'
)


def process(path: Path, div_re, replacement):
    if not path.exists():
        print(f"  (not found: {path} — skipping)")
        return False
    original = path.read_text(encoding="utf-8")
    text = CSS_RULE_RE.sub(CANONICAL_CSS, original)
    text = div_re.sub(replacement, text)

    if text != original:
        path.write_text(text, encoding="utf-8")
        print(f"  updated: {path}")
        return True
    print(f"  no change needed: {path}")
    return False


def main():
    changed = 0
    changed += process(ROOT / "hi" / "index.html", HI_DIV_RE, HI_REPLACEMENT)
    changed += process(ROOT / "pa" / "index.html", PA_DIV_RE, PA_REPLACEMENT)

    print(f"\nDone. {changed}/2 files updated.")
    print("Review with `git diff` before committing.")


if __name__ == "__main__":
    main()
