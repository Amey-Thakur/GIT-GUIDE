"""
File: build_booklet.py
Purpose: Assemble the Git Guide companion: a printable booklet of the model, the commands, and the rescues.
Author: Amey Thakur
GitHub: https://github.com/Amey-Thakur
Tech: Python 3 standard library; headless Chrome prints the PDF
Description: Builds .github/assets/booklet.html (ignored) from docs/data and prints docs/assets/git-guide-companion.pdf (committed, served). A4 landscape, dark, branded, no counts baked anywhere. Every page carries the footer with the site address.
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
HTML = ROOT / ".github" / "assets" / "booklet.html"
PDF = DOCS / "assets" / "git-guide-companion.pdf"

INK, MUTED, ACCENT, PAPER, LINE, CARD = "#e9e6df", "#9b968b", "#f05133", "#141311", "#2e2c28", "#1c1a18"
SAFE, HISTORY, DANGER = "#63b378", "#d3a53a", "#e5776b"


def sheet():
    return json.loads((DOCS / "data" / "cheatsheet.json").read_text(encoding="utf-8"))["sections"]


def errors():
    return json.loads((DOCS / "data" / "errors.json").read_text(encoding="utf-8"))["errors"]


def logo(size):
    raw = (DOCS / "assets" / "git-logo.svg").read_text(encoding="utf-8")
    inner = re.search(r"<svg[^>]*>(.*)</svg>", raw, re.S).group(1)
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 78 78" '
            f'xmlns="http://www.w3.org/2000/svg">{inner}</svg>')


def avatar_b64():
    return base64.b64encode((DOCS / "assets" / "amey.jpg").read_bytes()).decode()


def page(body, title=""):
    head = f'<div class="phead">{logo(22)}<span>Git Guide<i>.</i></span><em>{escape(title)}</em></div>' if title else ""
    return f'<section class="page">{head}{body}</section>'


def rows(section, note=True):
    out = [f'<h2>{escape(section["title"])}</h2>']
    if note and section.get("note"):
        out.append(f'<p class="note">{escape(section["note"])}</p>')
    out.append('<div class="rows">')
    for it in section["items"]:
        cls = ' class="danger"' if it.get("danger") else ""
        out.append(f'<div><code{cls}>{escape(it["c"])}</code><span>{escape(it["d"])}</span></div>')
    out.append("</div>")
    return "".join(out)


def section_by(title, sections):
    return next(s for s in sections if s["title"] == title)


def cover():
    return page(f'''
<div class="cover">
  {logo(120)}
  <h1>Git Guide<i>.</i></h1>
  <p class="sub">The companion</p>
  <p class="tag">Every Git and GitHub answer in one place.<br>
  The model, the commands, and the rescues, printed to keep beside you.</p>
  <p class="qual">an undo for everything <b>·</b> works offline <b>·</b> no trackers <b>·</b> MIT</p>
  <div class="cauthor"><img src="data:image/jpeg;base64,{avatar_b64()}" alt="">
    <span><strong>Amey Thakur</strong><br>amey-thakur.github.io/GIT-GUIDE</span></div>
</div>''')


def foreword():
    return page('''
<div class="prose">
<h2>A note from Amey</h2>
<p>Git carries nearly every codebase on earth, and almost everyone who uses it learned it by accident: a command from a teammate, a midnight search, a ritual repeated without understanding.</p>
<p>Git Guide exists to end that way of learning. Ask in plain language, or paste the error Git printed, and get the exact commands with the two things most resources never give: how dangerous each one is, and how to take it back.</p>
<p>This companion is the still version. The model on the next pages replaces memorizing; the command pages cover the daily work; the rescue pages are for the bad days. The living version, with every answer, every error, and a place to ask, waits at <b>amey-thakur.github.io/GIT-GUIDE</b>.</p>
<p class="sign">Amey</p>
</div>''', "Foreword")


def model():
    zones = "".join(
        f'<g><rect x="{x}" y="40" width="150" height="120" rx="10" fill="none" stroke="{LINE}" stroke-width="1.5"/>'
        f'<text x="{x + 14}" y="28" font-size="14" font-weight="600" fill="{INK}">{n}</text>'
        f'<text x="{x + 14}" y="66" font-size="10.5" fill="{MUTED}">{d}</text></g>'
        for x, n, d in [(10, "Working tree", "your files"), (230, "Staging area", "the next commit"),
                        (450, "Local repository", ".git, your history"), (670, "Remote", "any host")]
    )
    def arrow(x1, x2, y, label):
        return (f'<line x1="{x1}" y1="{y}" x2="{x2 - 10}" y2="{y}" stroke="{ACCENT}" stroke-width="2"/>'
                f'<polygon points="{x2},{y} {x2 - 10},{y - 5} {x2 - 10},{y + 5}" fill="{ACCENT}"/>'
                f'<text x="{(x1 + x2) / 2}" y="{y - 8}" font-size="11" fill="{ACCENT}" text-anchor="middle" font-family="Consolas,monospace">{label}</text>')
    arrows = (arrow(162, 228, 80, "add") + arrow(382, 448, 80, "commit") + arrow(602, 668, 80, "push")
              + f'<line x1="668" y1="130" x2="612" y2="130" stroke="{ACCENT}" stroke-width="2"/>'
              + f'<polygon points="602,130 612,125 612,135" fill="{ACCENT}"/>'
              + f'<text x="635" y="122" font-size="11" fill="{ACCENT}" text-anchor="middle" font-family="Consolas,monospace">fetch</text>'
              + f'<path d="M525,165 C525,205 90,205 90,165" fill="none" stroke="{ACCENT}" stroke-width="2"/>'
              + f'<polygon points="90,160 85,170 95,170" fill="{ACCENT}"/>'
              + f'<text x="307" y="196" font-size="11" fill="{ACCENT}" text-anchor="middle" font-family="Consolas,monospace">merge / pull</text>')
    return page(f'''
<h2>Where your code lives</h2>
<svg viewBox="0 0 830 215" class="diag">{zones}{arrows}</svg>
<div class="defs">
  <div><b>add</b> copies a change into the staging area, the draft of your next commit.</div>
  <div><b>commit</b> seals the draft into a permanent snapshot in your local repository.</div>
  <div><b>push</b> and <b>fetch</b> move commits to and from the remote; <b>pull</b> is fetch plus merge.</div>
  <div><b>restore</b> copies recorded versions back over your files; <b>reset</b> moves the branch pointer itself.</div>
</div>''', "The model")


def graph():
    return page(f'''
<h2>Commits, branches, HEAD</h2>
<svg viewBox="0 0 830 190" class="diag">
  <line x1="64" y1="70" x2="336" y2="70" stroke="{MUTED}" stroke-width="2"/>
  <circle cx="50" cy="70" r="11" fill="{CARD}" stroke="{MUTED}" stroke-width="2"/>
  <circle cx="170" cy="70" r="11" fill="{CARD}" stroke="{MUTED}" stroke-width="2"/>
  <circle cx="290" cy="70" r="11" fill="{CARD}" stroke="{MUTED}" stroke-width="2"/>
  <rect x="258" y="14" width="64" height="22" rx="6" fill="none" stroke="{MUTED}"/>
  <text x="290" y="29" font-size="12" fill="{INK}" text-anchor="middle">main</text>
  <line x1="290" y1="36" x2="290" y2="56" stroke="{MUTED}"/>
  <path d="M299,79 C330,110 350,130 378,130" fill="none" stroke="{MUTED}" stroke-width="2"/>
  <circle cx="392" cy="130" r="11" fill="{CARD}" stroke="{ACCENT}" stroke-width="2"/>
  <rect x="360" y="158" width="64" height="22" rx="6" fill="none" stroke="{ACCENT}"/>
  <text x="392" y="173" font-size="12" fill="{ACCENT}" text-anchor="middle">feature</text>
  <circle cx="440" cy="70" r="11" fill="{CARD}" stroke="{MUTED}" stroke-width="2"/>
  <line x1="301" y1="70" x2="426" y2="70" stroke="{MUTED}" stroke-width="2"/>
  <circle cx="560" cy="70" r="11" fill="{CARD}" stroke="{SAFE}" stroke-width="2.5"/>
  <line x1="451" y1="70" x2="546" y2="70" stroke="{MUTED}" stroke-width="2"/>
  <path d="M403,124 C480,105 520,85 549,76" fill="none" stroke="{SAFE}" stroke-width="2"/>
  <text x="560" y="42" font-size="12" fill="{SAFE}" text-anchor="middle">merge</text>
  <circle cx="700" cy="70" r="11" fill="{CARD}" stroke="{HISTORY}" stroke-width="2.5" stroke-dasharray="4 3"/>
  <line x1="571" y1="70" x2="686" y2="70" stroke="{MUTED}" stroke-width="2" stroke-dasharray="4 3"/>
  <text x="700" y="42" font-size="12" fill="{HISTORY}" text-anchor="middle">rebase</text>
</svg>
<div class="defs">
  <div>A <b>branch</b> is a movable label on one commit. Creating one copies nothing.</div>
  <div>A <b>merge</b> commit has two parents; history shows what truly happened. Safe on shared branches.</div>
  <div>A <b>rebase</b> replays your commits as new ones for a straight line. Rewrites history: unshared work only.</div>
  <div><b>HEAD</b> is where you stand. Checking out a commit directly detaches it; that is a state, not an error.</div>
</div>''', "The graph")


def closing():
    doors = [("Finder", "ask anything, or paste the error"), ("Start", "zero to first push"),
             ("Learn", "the model, step by step"), ("Fix", "guided rescue"),
             ("Errors", "Git's messages, decoded"), ("GitHub", "first repo to branch protection"),
             ("Workflows", "how teams run Git"), ("Cheatsheet", "everything, one line each")]
    items = "".join(f'<div><b>{n}</b><span>{d}</span></div>' for n, d in doors)
    return page(f'''
<h2>The living version</h2>
<p class="note">Eight doors, one address: <b>amey-thakur.github.io/GIT-GUIDE</b></p>
<div class="doors">{items}</div>
<p class="note">Every answer also lives in the repository's Discussions; a question missing from the guide becomes its next addition. MIT licensed, no trackers, works offline.</p>
<div class="cauthor end"><img src="data:image/jpeg;base64,{avatar_b64()}" alt="">
  <span><strong>Built and maintained by Amey Thakur</strong><br>github.com/Amey-Thakur/GIT-GUIDE</span></div>''', "Closing")


CSS = f'''
* {{ margin: 0; box-sizing: border-box; }}
@page {{ size: A4 landscape; margin: 0; }}
body {{ font-family: system-ui, "Segoe UI", Roboto, sans-serif; background: {PAPER}; color: {INK}; }}
.page {{ width: 297mm; height: 210mm; padding: 14mm 18mm 20mm; position: relative; page-break-after: always; overflow: hidden; }}
.page::after {{ content: "Git Guide · amey-thakur.github.io/GIT-GUIDE"; position: absolute; bottom: 8mm; left: 18mm; font-size: 8.5pt; color: {MUTED}; }}
.phead {{ display: flex; align-items: center; gap: 8px; margin-bottom: 9mm; }}
.phead span {{ font-weight: 700; font-size: 13pt; }}
.phead em {{ margin-left: auto; font-style: normal; color: {MUTED}; font-size: 10pt; }}
i {{ color: {ACCENT}; font-style: normal; }}
h2 {{ font-size: 19pt; margin-bottom: 5mm; border-left: 1.4mm solid {ACCENT}; padding-left: 4mm; }}
.cover {{ display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; }}
.cover h1 {{ font-size: 44pt; margin-top: 8mm; }}
.cover .sub {{ color: {ACCENT}; font-size: 15pt; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; margin-top: 2mm; }}
.cover .tag {{ color: {MUTED}; font-size: 12.5pt; line-height: 1.6; margin-top: 8mm; }}
.cover .qual {{ font-size: 10.5pt; margin-top: 7mm; }}
.cover .qual b {{ color: {MUTED}; font-weight: 400; padding: 0 2mm; }}
.cauthor {{ display: flex; align-items: center; gap: 5mm; margin-top: 11mm; text-align: left; }}
.cauthor img {{ width: 14mm; height: 14mm; border-radius: 3mm; }}
.cauthor span {{ font-size: 10pt; color: {MUTED}; line-height: 1.5; }}
.cauthor strong {{ color: {INK}; }}
.prose {{ max-width: 200mm; }}
.prose p {{ font-size: 12pt; line-height: 1.75; color: {INK}; margin-bottom: 5mm; }}
.prose .sign {{ color: {ACCENT}; font-weight: 700; font-size: 13pt; }}
.diag {{ width: 100%; max-height: 88mm; margin-bottom: 6mm; }}
.defs {{ display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 10mm; }}
.defs div {{ font-size: 10.5pt; color: {MUTED}; line-height: 1.55; }}
.defs b {{ color: {INK}; font-family: Consolas, monospace; }}
.note {{ color: {MUTED}; font-size: 10pt; margin-bottom: 4mm; }}
.rows {{ display: grid; grid-template-columns: 1fr 1fr; gap: 2.6mm 10mm; }}
.rows div {{ display: flex; align-items: baseline; gap: 4mm; border-bottom: 1px solid {LINE}; padding-bottom: 2.2mm; }}
.rows code {{ font-family: Consolas, monospace; font-size: 9pt; white-space: nowrap; }}
.rows code.danger {{ color: {DANGER}; }}
.rows span {{ font-size: 8.5pt; color: {MUTED}; margin-left: auto; text-align: right; }}
.two h2 {{ margin-top: 6mm; }}
.two h2:first-child {{ margin-top: 0; }}
.errs {{ display: grid; grid-template-columns: 1fr 1fr; gap: 0 10mm; }}
.errs div {{ border-bottom: 1px solid {LINE}; padding: 2.4mm 0; }}
.errs code {{ font-family: Consolas, monospace; font-size: 9.5pt; color: {DANGER}; }}
.errs p {{ font-size: 9pt; color: {MUTED}; margin-top: 1mm; }}
.doors {{ display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 10mm; margin: 6mm 0 7mm; }}
.doors div {{ border: 1px solid {LINE}; border-radius: 3mm; padding: 4mm 5mm; background: {CARD}; }}
.doors b {{ color: {ACCENT}; font-size: 11.5pt; display: block; margin-bottom: 1mm; }}
.doors span {{ color: {MUTED}; font-size: 9.5pt; }}
.end {{ margin-top: 9mm; }}
'''


def main():
    s = sheet()
    errs = errors()[:10]
    err_items = "".join(f'<div><code>{escape(e["msg"])}</code><p>{escape(e["why"])}</p></div>' for e in errs)
    pages = [
        cover(),
        foreword(),
        model(),
        graph(),
        page('<div class="two">' + rows(section_by("The daily loop", s)) + rows(section_by("Branches", s)) + "</div>", "Daily work"),
        page('<div class="two">' + rows(section_by("Undo and rescue", s)) + rows(section_by("Stash", s)) + "</div>", "Undo"),
        page('<div class="two">' + rows(section_by("Merge and rebase", s)) + rows(section_by("Inspect and search", s)) + "</div>", "History"),
        page('<div class="two">' + rows(section_by("History surgery", s)) + rows(section_by("Scale and speed", s)) + "</div>", "Deep water"),
        page('<div class="two">' + rows(section_by("Every platform, same Git", s)) + rows(section_by("No host at all", s)) + "</div>", "Everywhere"),
        page(f'<h2>The errors you will meet</h2><p class="note">The message, then the cause. Every fix is one search away on the site.</p><div class="errs">{err_items}</div>', "Errors"),
        page('<div class="two">' + rows(section_by("Setup and identity", s)) + rows(section_by("Quality of life", s)) + "</div>", "Setup"),
        closing(),
    ]
    HTML.write_text(
        f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>'
        + "".join(pages) + "</body></html>",
        encoding="utf-8",
    )
    print(f"booklet.html: {len(pages)} pages")
    if "--render" in sys.argv:
        chrome = next((p for p in [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ] if Path(p).exists()), None)
        if not chrome:
            sys.exit("Chrome not found.")
        subprocess.run(
            [chrome, "--headless=new", f"--print-to-pdf={PDF}", "--no-pdf-header-footer", HTML.as_uri()],
            capture_output=True, timeout=120,
        )
        print(f"git-guide-companion.pdf: {PDF.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
