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

import danger

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


def lesson_count():
    """Counted out of the sandbox rather than typed here, so an image can never
    advertise a course that is a different size from the one on the page."""
    src = (DOCS / "play.js").read_text(encoding="utf-8")
    n = len(re.findall(r"\bch:\s*\d+", src))
    if not n:
        sys.exit("build_images: could not count the lessons in play.js")
    return n


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
    """The card a link renders as, so it has one job: say what this is in the
    two seconds before somebody scrolls past. The left half is the claim, the
    right half shows the claim being kept, on a real answer from the data."""
    code_bg = "#23211d"
    # Green, red, amber: the same three colours every answer on the site uses,
    # so the key is already learned by the time anyone arrives.
    scale = (
        f'<tspan font-weight="700" fill="{SAFE}">{len(intents)}</tspan> answers'
        f'<tspan fill="{MUTED}">  ·  </tspan><tspan font-weight="700" fill="{DANGER}">{len(errors)}</tspan> errors decoded'
        f'<tspan fill="{MUTED}">  ·  </tspan><tspan font-weight="700" fill="{HISTORY}">{lesson_count()}</tspan> lessons'
    )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640" font-family="{FONT}">
  <rect width="1280" height="640" fill="{PAPER}"/>
  {git_logo(80, 60, 92)}
  <text x="196" y="132" font-size="76" font-weight="700" fill="{INK}">Git Guide<tspan fill="{ACCENT}">.</tspan></text>
  <text x="82" y="252" font-size="42" font-weight="600" fill="{INK}">Every Git and GitHub</text>
  <text x="82" y="306" font-size="42" font-weight="600" fill="{INK}">answer in one place.</text>
  <text x="82" y="360" font-size="24" fill="{MUTED}">Every command carries how much it can cost you,</text>
  <text x="82" y="394" font-size="24" fill="{MUTED}">and its own way back.</text>
  <text x="82" y="448" font-size="21" fill="{INK}">{scale}</text>
  <text x="82" y="486" font-size="21" fill="{INK}">works offline<tspan fill="{MUTED}">  ·  </tspan>no sign-in<tspan fill="{MUTED}">  ·  </tspan>no trackers<tspan fill="{MUTED}">  ·  </tspan><tspan fill="{ACCENT}" font-weight="700">MIT</tspan></text>
  <rect x="690" y="176" width="510" height="66" rx="14" fill="{CARD}" stroke="{ACCENT}" stroke-width="2"/>
  <text x="716" y="218" font-size="25" fill="{INK}">undo the last commit</text>
  <rect x="1140" y="194" width="36" height="32" rx="6" fill="none" stroke="{LINE}" stroke-width="1.5"/>
  <text x="1158" y="217" font-size="19" fill="{MUTED}" text-anchor="middle" font-family="{MONO}">/</text>
  <rect x="690" y="264" width="510" height="202" rx="14" fill="{CARD}" stroke="{LINE}" stroke-width="1.5"/>
  <text x="716" y="306" font-size="20" font-weight="600" fill="{INK}">Keep the work, remove only the commit</text>
  <rect x="1116" y="286" width="62" height="28" rx="5" fill="none" stroke="{SAFE}" stroke-width="1.6"/>
  <text x="1147" y="305" font-size="13" font-weight="700" fill="{SAFE}" text-anchor="middle">SAFE</text>
  <rect x="716" y="328" width="458" height="56" rx="10" fill="{code_bg}"/>
  <text x="740" y="364" font-size="23" fill="{INK}" font-family="{MONO}">git reset --soft HEAD~1</text>
  <rect x="1092" y="340" width="66" height="32" rx="6" fill="none" stroke="{LINE}" stroke-width="1.5"/>
  <text x="1125" y="361" font-size="15" fill="{MUTED}" text-anchor="middle">Copy</text>
  <text x="716" y="404" font-size="17" fill="{MUTED}">The commit is gone. Your files are exactly as they were.</text>
  <text x="716" y="440" font-size="18" fill="{MUTED}"><tspan font-weight="700" fill="{SAFE}">Undo</tspan>  <tspan font-family="{MONO}" font-size="16">git reset --soft HEAD@{{1}}</tspan></text>
  {footer(524, 1280, "Every Git and GitHub answer in one place.")}
</svg>'''


def poster(intents, errors):
    doors = [
        ("Finder", "Ask plain, or paste the error"),
        ("Start", "Zero to first push, six steps"),
        ("Learn", "What each command moves"),
        ("Practise", "Run Git on a graph, break nothing"),
        ("Fix", "Questions to the way out"),
        ("Errors", "Git's messages, decoded"),
        ("GitHub", "First repo to protection"),
        ("Workflows", "Solo, fork, trunk, release"),
        ("Cheatsheet", "All commands, one line each"),
    ]
    # Nine doors sit three by three; four across left the last row ragged.
    boxes = ""
    for i, (name, desc) in enumerate(doors):
        x = 80 + (i % 3) * 430
        y = 300 + (i // 3) * 128
        # The door names were all accent red, which left nothing for red to mean.
        # The rule keeps the accent; the names are ink, so the danger key below
        # is the only red thing on the poster that is making a claim.
        boxes += (
            f'<rect x="{x}" y="{y}" width="410" height="110" rx="12" fill="{CARD}" stroke="{LINE}" stroke-width="1.5"/>'
            f'<rect x="{x}" y="{y + 18}" width="5" height="74" rx="2.5" fill="{ACCENT}"/>'
            f'<text x="{x + 26}" y="{y + 46}" font-size="26" font-weight="700" fill="{INK}">{escape(name)}</text>'
            f'<text x="{x + 26}" y="{y + 80}" font-size="18" fill="{MUTED}">{escape(desc)}</text>'
        )
    legend = ""
    x = 80
    for label, color in [("Safe", SAFE), ("Rewrites history", HISTORY), ("Destructive", DANGER)]:
        w = 54 + len(label) * 11
        legend += (
            f'<rect x="{x}" y="692" width="{w}" height="36" rx="6" fill="none" stroke="{color}" stroke-width="1.8"/>'
            f'<text x="{x + w / 2}" y="716" font-size="18" font-weight="600" fill="{color}" text-anchor="middle">{escape(label.upper())}</text>'
        )
        x += w + 24
    # Counts come from the data, so the poster cannot claim a number the site
    # does not have.
    stats = (
        f'<tspan font-weight="700" fill="{SAFE}">{len(intents)}</tspan> answers'
        f'<tspan fill="{MUTED}">  ·  </tspan><tspan font-weight="700" fill="{DANGER}">{len(errors)}</tspan> errors decoded'
        f'<tspan fill="{MUTED}">  ·  </tspan><tspan font-weight="700" fill="{HISTORY}">{lesson_count()}</tspan> lessons you can run'
    )
    promise = (
        f'an undo for everything<tspan fill="{MUTED}">  ·  </tspan>works offline'
        f'<tspan fill="{MUTED}">  ·  </tspan>no trackers<tspan fill="{MUTED}">  ·  </tspan>'
        f'<tspan fill="{ACCENT}" font-weight="700">MIT</tspan>'
    )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900" font-family="{FONT}">
  <rect width="1400" height="900" fill="{PAPER}"/>
  {git_logo(80, 60, 88)}
  <text x="192" y="128" font-size="66" font-weight="700" fill="{INK}">Git Guide<tspan fill="{ACCENT}">.</tspan></text>
  <text x="82" y="196" font-size="30" font-weight="600" fill="{INK}">Every Git and GitHub answer in one place.</text>
  <text x="82" y="234" font-size="23" fill="{INK}">{stats}</text>
  <text x="82" y="266" font-size="20" fill="{INK}">{promise}</text>
  {boxes}
  {legend}
  <text x="1320" y="716" font-size="18" fill="{MUTED}" text-anchor="end">every answer carries its danger level and its undo</text>
  {footer(772, 1400, "Every Git and GitHub answer in one place.")}
</svg>'''


LEVEL_COLOUR = {danger.SAFE: INK, danger.HISTORY: HISTORY, danger.DESTRUCTIVE: DANGER}

SHEET_W = 1440          # command column 700, description column 540, 80 either side
CMD_X, CMD_W = 80, 700
DESC_X = 820
ROW_H = 40

# Monospace advance is close enough to 0.6em in every face this falls back to.
# Sizes are tried largest first, so only the handful of very long clone URLs step
# down and every other row keeps the same weight on the page.
MONO_SIZES = (19, 17.5, 16, 14.5)


def fit_mono(text, width=CMD_W - 10):
    for size in MONO_SIZES:
        if len(text) * 0.6 * size <= width:
            return size
    return MONO_SIZES[-1]


def sheet_card(sheet, wanted, title):
    """Two fixed columns, always.

    The old layout put the description at a fixed x only when the command was
    short enough, and dropped it underneath on the left when it was not. Eight
    commands out of a hundred and eleven were long enough to trigger it, and
    those eight broke the alignment of the whole sheet. Now the columns never
    move: a long command takes a smaller size instead of taking the other
    column's room.
    """
    sections = [s for s in sheet if s["title"] in wanted]
    y = 232
    body = ""
    stripe = 0
    for sec in sections:
        body += (
            f'<rect x="{CMD_X}" y="{y - 21}" width="5" height="28" fill="{ACCENT}"/>'
            f'<text x="{CMD_X + 17}" y="{y}" font-size="26" font-weight="700" fill="{INK}">{escape(sec["title"])}</text>'
            f'<line x1="{CMD_X + 27 + len(sec["title"]) * 14}" y1="{y - 8}" x2="{SHEET_W - 80}" y2="{y - 8}" stroke="{LINE}" stroke-width="1.5"/>'
        )
        y += 16
        for item in sec["items"]:
            # Three colours, from the one definition the whole repository uses.
            # The key above promises three; showing two was a card contradicting
            # its own legend.
            colour = LEVEL_COLOUR[danger.level(item["c"])]
            size = fit_mono(item["c"])
            # A quiet stripe carries the eye across the gap between the columns.
            if stripe % 2 == 0:
                body += (
                    f'<rect x="{CMD_X - 14}" y="{y}" width="{SHEET_W - 2 * CMD_X + 28}" '
                    f'height="{ROW_H}" rx="7" fill="{INK}" opacity="0.035"/>'
                )
            stripe += 1
            body += (
                f'<text x="{CMD_X}" y="{y + 27}" font-size="{size}" fill="{colour}" '
                f'font-family="{MONO}">{escape(item["c"])}</text>'
                f'<text x="{DESC_X}" y="{y + 26}" font-size="16.5" fill="{MUTED}">{escape(item["d"])}</text>'
            )
            y += ROW_H
        y += 46
        stripe = 0

    # The key sits beside the title, where there is room. On the line below it
    # collided with the sentence that explains it.
    key = ""
    kx = SHEET_W - 80
    for label, colour in [("Destructive", DANGER), ("Rewrites history", HISTORY), ("Safe", SAFE)]:
        w = 34 + len(label) * 9
        kx -= w
        key += (
            f'<rect x="{kx}" y="78" width="{w}" height="30" rx="6" fill="none" stroke="{colour}" stroke-width="1.6"/>'
            f'<text x="{kx + w / 2}" y="98" font-size="15" font-weight="700" fill="{colour}" text-anchor="middle">{escape(label.upper())}</text>'
        )
        kx -= 12

    height = y + 130
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SHEET_W}" height="{height}" viewBox="0 0 {SHEET_W} {height}" font-family="{FONT}">
  <rect width="{SHEET_W}" height="{height}" fill="{PAPER}"/>
  {git_logo(80, 56, 64)}
  <text x="164" y="106" font-size="46" font-weight="700" fill="{INK}">{title}<tspan fill="{ACCENT}">.</tspan></text>
  <text x="82" y="152" font-size="20" fill="{MUTED}">Colour is the cost: amber rewrites history, red can lose work. Every command here has its own undo at amey-thakur.github.io/GIT-GUIDE</text>
  {key}
  {body}
  {footer(y - 20, SHEET_W, "Every Git and GitHub answer in one place.")}
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
    titles = [sec["title"] for sec in sheet]
    daily, beyond = titles[:8], titles[8:]
    c1_svg, c1_h = sheet_card(sheet, daily, "The Git you use daily")
    c2_svg, c2_h = sheet_card(sheet, beyond, "The Git beyond daily")
    jobs = [
        (ASSETS / "social-preview.svg", DOCS / "assets" / "social-preview.png", 1280, 640, social_card(intents, errors)),
        (ASSETS / "poster.svg", DOCS / "assets" / "poster.png", 1400, 900, poster(intents, errors)),
        (ASSETS / "cheatsheet-card.svg", DOCS / "assets" / "cheatsheet-card.png", SHEET_W, c1_h, c1_svg),
        (ASSETS / "cheatsheet-card-2.svg", DOCS / "assets" / "cheatsheet-card-2.png", SHEET_W, c2_h, c2_svg),
    ]
    for svg_path, _, _, _, svg in jobs:
        svg_path.write_text(svg, encoding="utf-8", newline="\n")
    print(f"{len(jobs)} SVGs composed from live data")
    if "--render" in sys.argv:
        render([j[:4] for j in jobs])


if __name__ == "__main__":
    main()
