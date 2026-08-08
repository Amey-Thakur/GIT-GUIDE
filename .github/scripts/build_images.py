"""
File: build_images.py
Purpose: Generate the repository's images from live data: the social preview card first.
Author: Amey Thakur
GitHub: https://github.com/Amey-Thakur
Tech: Python 3 standard library; headless Chrome rasterizes SVG to PNG
Description: Composes the 1280x640 social card from one data pass: counts read from docs/data (never hardcoded), the real Git logo from docs/assets, the GitHub mark path, and Amey's avatar embedded square. Writes the SVG source to .github/assets and, with --render, the PNG to docs/assets where the site serves it as og:image.
Date: 2026-08-07
"""

import base64
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
OUT_SVG = ROOT / ".github" / "assets" / "social-preview.svg"
OUT_PNG = DOCS / "assets" / "social-preview.png"

INK, MUTED, ACCENT, PAPER, LINE = "#e9e6df", "#9b968b", "#f05133", "#141311", "#2e2c28"
FONT = "system-ui, 'Segoe UI', Roboto, sans-serif"

GITHUB_MARK = ("M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261."
    "793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1."
    "089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.49"
    "2.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 "
    "1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399"
    " 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242"
    " 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.82"
    "3 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6."
    "627-5.373-12-12-12z")


def counts():
    intents = json.loads((DOCS / "data" / "intents.json").read_text(encoding="utf-8"))
    errors = json.loads((DOCS / "data" / "errors.json").read_text(encoding="utf-8"))
    return len(intents["intents"]), len(errors["errors"])


def git_logo(x, y, size):
    raw = (DOCS / "assets" / "git-logo.svg").read_text(encoding="utf-8")
    inner = re.search(r"<svg[^>]*>(.*)</svg>", raw, re.S).group(1)
    scale = size / 78
    return f'<g transform="translate({x},{y}) scale({scale:.4f})">{inner}</g>'


def avatar(x, y, size):
    b64 = base64.b64encode((DOCS / "assets" / "amey.jpg").read_bytes()).decode()
    return (
        f'<clipPath id="av"><rect x="{x}" y="{y}" width="{size}" height="{size}" rx="12"/></clipPath>'
        f'<image href="data:image/jpeg;base64,{b64}" x="{x}" y="{y}" width="{size}" height="{size}" clip-path="url(#av)"/>'
    )


def card():
    answers, errors = counts()
    stats = (
        f'<tspan fill="{ACCENT}" font-weight="700">{answers}</tspan> answers'
        f'<tspan fill="{MUTED}">   ·   </tspan>'
        f'<tspan fill="{ACCENT}" font-weight="700">{errors}</tspan> errors decoded'
        f'<tspan fill="{MUTED}">   ·   </tspan>an undo for everything'
        f'<tspan fill="{MUTED}">   ·   </tspan>works offline'
    )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640" font-family="{FONT}">
  <rect width="1280" height="640" fill="{PAPER}"/>
  {git_logo(80, 72, 104)}
  <text x="212" y="152" font-size="86" font-weight="700" fill="{INK}">Git Guide<tspan fill="{ACCENT}">.</tspan></text>
  <text x="82" y="286" font-size="44" font-weight="600" fill="{INK}">Every Git and GitHub answer in one place.</text>
  <text x="82" y="348" font-size="30" fill="{MUTED}">Type what you want to do, or paste the error Git printed.</text>
  <text x="82" y="392" font-size="30" fill="{MUTED}">Exact commands, a danger level for each, and its undo.</text>
  <text x="82" y="472" font-size="28" fill="{INK}">{stats}</text>
  <line x1="80" y1="524" x2="1200" y2="524" stroke="{LINE}" stroke-width="2"/>
  {avatar(80, 552, 56)}
  <text x="156" y="577" font-size="26" font-weight="600" fill="{INK}">Amey Thakur</text>
  <text x="156" y="605" font-size="21" fill="{MUTED}">amey-thakur.github.io/GIT-GUIDE</text>
  <g transform="translate(1046,558) scale(1.83)" fill="{MUTED}"><path d="{GITHUB_MARK}"/></g>
  <text x="1198" y="605" font-size="21" fill="{MUTED}" text-anchor="end">GIT-GUIDE</text>
</svg>'''


def render():
    chrome = None
    for p in [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]:
        if Path(p).exists():
            chrome = p
            break
    if not chrome:
        sys.exit("Chrome not found; SVG written, PNG skipped.")
    html = ROOT / ".github" / "assets" / "social-preview.html"
    html.write_text(
        "<!doctype html><html><head><style>*{margin:0}</style></head><body>"
        + OUT_SVG.read_text(encoding="utf-8")
        + "</body></html>",
        encoding="utf-8",
    )
    subprocess.run(
        [chrome, "--headless=new", f"--screenshot={OUT_PNG}", "--window-size=1280,640",
         "--hide-scrollbars", html.as_uri()],
        capture_output=True, timeout=60,
    )
    print(f"social-preview.png: {OUT_PNG.stat().st_size // 1024} KB")


def main():
    OUT_SVG.parent.mkdir(parents=True, exist_ok=True)
    OUT_SVG.write_text(card(), encoding="utf-8", newline="\n")
    answers, errors = counts()
    print(f"social-preview.svg: {answers} answers, {errors} errors baked from live data")
    if "--render" in sys.argv:
        render()


if __name__ == "__main__":
    main()
