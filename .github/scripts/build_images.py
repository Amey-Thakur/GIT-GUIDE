"""
File: build_images.py
Purpose: Generate the repository's images from live data: social card, poster, cheat-sheet card.
Author: Amey Thakur
GitHub: https://github.com/Amey-Thakur
Tech: Python 3 standard library; headless Chrome rasterizes SVG to PNG
Description: One data pass composes every image: counts and commands read from docs/data (never hardcoded), the real Git logo from docs/assets, the GitHub mark path, and Amey's avatar embedded square. SVG sources land in .github/assets; with --render, PNGs land in docs/assets where the site serves them.
Date: 2026-08-07
"""

import base64
import json
import re
import subprocess
import sys
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
ASSETS = ROOT / ".github" / "assets"

INK, MUTED, ACCENT, PAPER, LINE, CARD = "#e9e6df", "#9b968b", "#f05133", "#141311", "#2e2c28", "#1c1a18"
SAFE, HISTORY, DANGER = "#63b378", "#d3a53a", "#e5776b"
FONT = "system-ui, 'Segoe UI', Roboto, sans-serif"
MONO = "Cascadia Code, Consolas, monospace"

GITHUB_MARK = ("M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261."
    "793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1."
    "089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.49"
    "2.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 "
    "1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399"
    " 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242"
    " 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.82"
    "3 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6."
    "627-5.373-12-12-12z")


def data():
    intents = json.loads((DOCS / "data" / "intents.json").read_text(encoding="utf-8"))["intents"]
    errors = json.loads((DOCS / "data" / "errors.json").read_text(encoding="utf-8"))["errors"]
    sheet = json.loads((DOCS / "data" / "cheatsheet.json").read_text(encoding="utf-8"))["sections"]
    return intents, errors, sheet


def git_logo(x, y, size):
    raw = (DOCS / "assets" / "git-logo.svg").read_text(encoding="utf-8")
    inner = re.search(r"<svg[^>]*>(.*)</svg>", raw, re.S).group(1)
    return f'<g transform="translate({x},{y}) scale({size / 78:.4f})">{inner}</g>'


def avatar(x, y, size, clip_id):
    b64 = base64.b64encode((DOCS / "assets" / "amey.jpg").read_bytes()).decode()
    return (
        f'<clipPath id="{clip_id}"><rect x="{x}" y="{y}" width="{size}" height="{size}" rx="12"/></clipPath>'
        f'<image href="data:image/jpeg;base64,{b64}" x="{x}" y="{y}" width="{size}" height="{size}" clip-path="url(#{clip_id})"/>'
    )


def footer(y, width, provenance):
    right = width - 80
    return (
        f'<line x1="80" y1="{y}" x2="{right}" y2="{y}" stroke="{LINE}" stroke-width="2"/>'
        + avatar(80, y + 28, 56, f"av{y}")
        + f'<text x="156" y="{y + 53}" font-size="26" font-weight="600" fill="{INK}">Amey Thakur</text>'
        + f'<a href="https://amey-thakur.github.io/GIT-GUIDE/"><text x="156" y="{y + 81}" font-size="21" fill="{MUTED}">amey-thakur.github.io/GIT-GUIDE</text></a>'
        + f'<g transform="translate({right - 44},{y + 34}) scale(1.83)" fill="{MUTED}"><path d="{GITHUB_MARK}"/></g>'
        + f'<text x="{right - 64}" y="{y + 81}" font-size="21" fill="{MUTED}" text-anchor="end">{escape(provenance)}</text>'
    )


def social_card(intents, errors):
    stats = (
        f'<tspan fill="{ACCENT}" font-weight="700">{len(intents)}</tspan> answers'
        f'<tspan fill="{MUTED}">   ·   </tspan>'
        f'<tspan fill="{ACCENT}" font-weight="700">{len(errors)}</tspan> errors decoded'
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
  {footer(524, 1280, "GIT-GUIDE")}
</svg>'''


def poster(intents, errors):
    doors = [
        ("Finder", "Ask plain, or paste the error"),
        ("Start", "Zero to first push, six steps"),
        ("Learn", "What each command moves"),
        ("Fix", "Questions to the way out"),
        ("Errors", f"{len(errors)} messages decoded"),
        ("GitHub", "First repo to protection"),
        ("Workflows", "Solo, fork, trunk, release"),
        ("Cheatsheet", "All commands, one line each"),
    ]
    boxes = ""
    for i, (name, desc) in enumerate(doors):
        x = 80 + (i % 4) * 320
        y = 306 + (i // 4) * 172
        boxes += (
            f'<rect x="{x}" y="{y}" width="300" height="150" rx="12" fill="{CARD}" stroke="{LINE}" stroke-width="1.5"/>'
            f'<text x="{x + 24}" y="{y + 52}" font-size="27" font-weight="700" fill="{ACCENT}">{escape(name)}</text>'
            f'<text x="{x + 24}" y="{y + 92}" font-size="18.5" fill="{MUTED}">{escape(desc)}</text>'
        )
    legend = ""
    for i, (label, color) in enumerate([("Safe", SAFE), ("Rewrites history", HISTORY), ("Destructive", DANGER)]):
        x = 80 + i * 250
        legend += (
            f'<rect x="{x}" y="692" width="{54 + len(label) * 11}" height="36" rx="6" fill="none" stroke="{color}" stroke-width="1.8"/>'
            f'<text x="{x + 27 + len(label) * 5.5}" y="716" font-size="18" font-weight="600" fill="{color}" text-anchor="middle">{escape(label.upper())}</text>'
        )
    stats = (
        f'<tspan fill="{ACCENT}" font-weight="700">{len(intents)}</tspan> answers'
        f'<tspan fill="{MUTED}">  ·  </tspan><tspan fill="{ACCENT}" font-weight="700">{len(errors)}</tspan> errors decoded'
        f'<tspan fill="{MUTED}">  ·  </tspan>works offline<tspan fill="{MUTED}">  ·  </tspan>no trackers<tspan fill="{MUTED}">  ·  </tspan>MIT'
    )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900" font-family="{FONT}">
  <rect width="1400" height="900" fill="{PAPER}"/>
  {git_logo(80, 60, 88)}
  <text x="192" y="128" font-size="66" font-weight="700" fill="{INK}">Git Guide<tspan fill="{ACCENT}">.</tspan></text>
  <text x="82" y="204" font-size="30" font-weight="600" fill="{INK}">Every Git and GitHub answer in one place.</text>
  <text x="82" y="248" font-size="24" fill="{INK}">{stats}</text>
  {boxes}
  {legend}
  <text x="1320" y="716" font-size="18" fill="{MUTED}" text-anchor="end">every answer carries its danger level and its undo</text>
  {footer(772, 1400, "Generated from live data")}
</svg>'''


def sheet_card(sheet):
    wanted = ["The daily loop", "Branches", "Undo and rescue"]
    sections = [s for s in sheet if s["title"] in wanted]
    y = 208
    body = ""
    for sec in sections:
        body += f'<text x="80" y="{y}" font-size="27" font-weight="700" fill="{ACCENT}">{escape(sec["title"])}</text>'
        y += 22
        for item in sec["items"]:
            color = DANGER if item.get("danger") else INK
            body += (
                f'<text x="80" y="{y + 30}" font-size="19.5" fill="{color}" font-family="{MONO}">{escape(item["c"])}</text>'
                f'<text x="640" y="{y + 30}" font-size="17.5" fill="{MUTED}">{escape(item["d"])}</text>'
            )
            y += 42
        y += 44
    height = y + 130
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="{height}" viewBox="0 0 1240 {height}" font-family="{FONT}">
  <rect width="1240" height="{height}" fill="{PAPER}"/>
  {git_logo(80, 56, 64)}
  <text x="164" y="106" font-size="46" font-weight="700" fill="{INK}">The Git you use daily<tspan fill="{ACCENT}">.</tspan></text>
  <text x="82" y="150" font-size="21" fill="{MUTED}">Red commands rewrite history or can destroy work. Every one has its undo at amey-thakur.github.io/GIT-GUIDE</text>
  {body}
  {footer(y - 14, 1240, "Generated from live data")}
</svg>''', height


def render(jobs):
    chrome = next((p for p in [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ] if Path(p).exists()), None)
    if not chrome:
        sys.exit("Chrome not found; SVGs written, PNGs skipped.")
    for svg_path, png_path, w, h in jobs:
        wrapper = svg_path.with_suffix(".html")
        wrapper.write_text(
            "<!doctype html><html><head><style>*{margin:0}</style></head><body>"
            + svg_path.read_text(encoding="utf-8") + "</body></html>",
            encoding="utf-8",
        )
        subprocess.run(
            [chrome, "--headless=new", f"--screenshot={png_path}", f"--window-size={w},{h}",
             "--hide-scrollbars", wrapper.as_uri()],
            capture_output=True, timeout=60,
        )
        print(f"{png_path.name}: {png_path.stat().st_size // 1024} KB")


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    intents, errors, sheet = data()
    sheet_svg, sheet_h = sheet_card(sheet)
    jobs = [
        (ASSETS / "social-preview.svg", DOCS / "assets" / "social-preview.png", 1280, 640, social_card(intents, errors)),
        (ASSETS / "poster.svg", DOCS / "assets" / "poster.png", 1400, 900, poster(intents, errors)),
        (ASSETS / "cheatsheet-card.svg", DOCS / "assets" / "cheatsheet-card.png", 1240, sheet_h, sheet_card(sheet)[0]),
    ]
    for svg_path, _, _, _, svg in jobs:
        svg_path.write_text(svg, encoding="utf-8", newline="\n")
    print(f"3 SVGs composed from live data: {len(intents)} answers, {len(errors)} errors")
    if "--render" in sys.argv:
        render([j[:4] for j in jobs])


if __name__ == "__main__":
    main()
