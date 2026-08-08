"""
File: build_booklet.py
Purpose: Assemble Git Guide as a complete printable PDF: the model, every command section, every error, the chapters.
Author: Amey Thakur
GitHub: https://github.com/Amey-Thakur
Tech: Python 3 standard library; headless Chrome prints the PDF
Description: Builds .github/assets/booklet.html (ignored) from docs/data and prints docs/assets/git-guide.pdf (committed, served). A4 landscape, dark, branded. Every page carries the same footer: avatar, author, clickable address, GitHub mark, tagline. No counts baked anywhere.
Date: 2026-08-08
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
PDF = DOCS / "assets" / "git-guide.pdf"

INK, MUTED, ACCENT, PAPER, LINE, CARD = "#e9e6df", "#9b968b", "#f05133", "#141311", "#2e2c28", "#1c1a18"
SAFE, HISTORY, DANGER = "#63b378", "#d3a53a", "#e5776b"
TAGLINE = "Every Git and GitHub answer in one place."

GH = ("M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577"
    "v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745."
    "083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-"
    ".775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221"
    "-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 "
    "1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3."
    "176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2."
    "222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z")


def data():
    sheet = json.loads((DOCS / "data" / "cheatsheet.json").read_text(encoding="utf-8"))["sections"]
    errs = json.loads((DOCS / "data" / "errors.json").read_text(encoding="utf-8"))["errors"]
    return sheet, errs


def logo(size):
    raw = (DOCS / "assets" / "git-logo.svg").read_text(encoding="utf-8")
    inner = re.search(r"<svg[^>]*>(.*)</svg>", raw, re.S).group(1)
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 78 78" '
            f'xmlns="http://www.w3.org/2000/svg">{inner}</svg>')


AVATAR = base64.b64encode((DOCS / "assets" / "amey.jpg").read_bytes()).decode()

FOOT = f'''<div class="pfoot">
  <img src="data:image/jpeg;base64,{AVATAR}" alt="">
  <div class="pfn"><b>Amey Thakur</b><a href="https://amey-thakur.github.io/GIT-GUIDE/">amey-thakur.github.io/GIT-GUIDE</a></div>
  <div class="pft"><svg width="14" height="14" viewBox="0 0 24 24" fill="{MUTED}"><path d="{GH}"/></svg><span>{TAGLINE}</span></div>
</div>'''


def page(body, title=""):
    head = (f'<div class="phead">{logo(20)}<span>Git Guide<i>.</i></span><em>{escape(title)}</em></div>'
            if title else "")
    return f'<section class="page">{head}{body}{FOOT}</section>'


def col(section):
    out = [f"<h2>{escape(section['title'])}</h2>"]
    if section.get("note"):
        out.append(f'<p class="note">{escape(section["note"])}</p>')
    out.append('<div class="list">')
    for it in section["items"]:
        cls = ' class="danger"' if it.get("danger") else ""
        out.append(f'<div><code{cls}>{escape(it["c"])}</code><span>{escape(it["d"])}</span></div>')
    out.append("</div>")
    return "".join(out)


def pair_page(a, b, title):
    return page(f'<div class="cols"><div>{col(a)}</div><div>{col(b)}</div></div>', title)


def cover():
    return page(f'''
<div class="cover">
  {logo(110)}
  <h1>Git Guide<i>.</i></h1>
  <p class="tag">{TAGLINE}</p>
  <p class="tag2">Ask in plain language, or paste the error Git printed.<br>
  Exact commands, a danger level for each, and its undo.</p>
  <p class="qual">an undo for everything <b>·</b> works offline <b>·</b> no trackers <b>·</b> MIT</p>
</div>''')


def foreword():
    return page('''
<div class="prose">
<h2>A note from Amey</h2>
<p>Git carries nearly every codebase on earth, and almost everyone who uses it learned it by accident: a command from a teammate, a midnight search, a ritual repeated without understanding.</p>
<p>Git Guide exists to end that way of learning. Ask in plain language, or paste the error Git printed, and get the exact commands with the two things most resources never give: how dangerous each one is, and how to take it back.</p>
<p>These pages hold the whole of it: the model that replaces memorizing, every command section, every error decoded, and the chapters on GitHub and on how teams work. The living version, searchable and always current, waits at <b>amey-thakur.github.io/GIT-GUIDE</b>.</p>
<p class="sign">Amey</p>
</div>''', "Foreword")


def model():
    def zone(x, name, sub, decor):
        return (f'<rect x="{x}" y="34" width="180" height="150" rx="10" fill="{CARD}" stroke="{LINE}" stroke-width="1.5"/>'
                f'<text x="{x + 16}" y="22" font-size="15" font-weight="600" fill="{INK}">{name}</text>'
                f'<text x="{x + 16}" y="62" font-size="11" fill="{MUTED}">{sub}</text>{decor}')
    files = lambda x: "".join(
        f'<rect x="{x + dx}" y="{100 + dy}" width="16" height="20" rx="3" fill="#23211d" stroke="{LINE}"/>'
        for dx, dy in [(30, 0), (62, 16), (94, -10)])
    dots = lambda x: (
        "".join(f'<circle cx="{x + d}" cy="120" r="7" fill="{CARD}" stroke="{MUTED}" stroke-width="1.6"/>' for d in (40, 84, 128))
        + f'<line x1="{x + 47}" y1="120" x2="{x + 77}" y2="120" stroke="{MUTED}"/>'
        + f'<line x1="{x + 91}" y1="120" x2="{x + 121}" y2="120" stroke="{MUTED}"/>')
    def arrow(x1, x2, y, label, above=True):
        ly = y - 9 if above else y + 17
        return (f'<line x1="{x1}" y1="{y}" x2="{x2 - 9 if x2 > x1 else x2 + 9}" y2="{y}" stroke="{ACCENT}" stroke-width="2.2"/>'
                f'<polygon points="{x2},{y} {x2 - 10 if x2 > x1 else x2 + 10},{y - 5} {x2 - 10 if x2 > x1 else x2 + 10},{y + 5}" fill="{ACCENT}"/>'
                f'<text x="{(x1 + x2) / 2}" y="{ly}" font-size="11.5" fill="{ACCENT}" text-anchor="middle" font-family="Consolas,monospace">{label}</text>')
    svg = (zone(10, "Working tree", "your files", files(10))
           + zone(250, "Staging area", "the next commit, drafted",
                  f'<rect x="330" y="106" width="16" height="20" rx="3" fill="#23211d" stroke="{LINE}"/>')
           + zone(490, "Local repository", ".git, your full history", dots(490))
           + zone(730, "Remote", "GitHub, GitLab, anywhere", dots(730))
           + arrow(192, 248, 80, "add") + arrow(432, 488, 80, "commit") + arrow(672, 728, 80, "push")
           + arrow(728, 672, 130, "fetch", above=False)
           + arrow(248, 192, 155, "restore", above=False)
           + f'<path d="M580,186 C580,236 110,236 110,190" fill="none" stroke="{ACCENT}" stroke-width="2.2"/>'
           + f'<polygon points="110,184 105,194 115,194" fill="{ACCENT}"/>'
           + f'<text x="345" y="222" font-size="11.5" fill="{ACCENT}" text-anchor="middle" font-family="Consolas,monospace">merge / pull</text>')
    return page(f'''
<h2>Where your code lives</h2>
<svg viewBox="0 0 920 246" class="diag">{svg}</svg>
<div class="defs">
  <div><b>add</b> copies a change into the staging area, the draft of your next commit. You choose what goes in.</div>
  <div><b>commit</b> seals the draft into a permanent snapshot in your local repository. Still only on your machine.</div>
  <div><b>push</b> uploads your commits; <b>fetch</b> downloads theirs and stops. <b>pull</b> is fetch plus merge.</div>
  <div><b>restore</b> copies recorded versions back over your files; <b>reset</b> moves the branch pointer itself. That is where history is un-happened.</div>
</div>''', "The model")


def graph():
    return page(f'''
<h2>Commits, branches, HEAD</h2>
<svg viewBox="0 0 920 230" class="diag">
  <line x1="74" y1="80" x2="366" y2="80" stroke="{MUTED}" stroke-width="2.2"/>
  <circle cx="60" cy="80" r="13" fill="{CARD}" stroke="{MUTED}" stroke-width="2.2"/>
  <circle cx="190" cy="80" r="13" fill="{CARD}" stroke="{MUTED}" stroke-width="2.2"/>
  <circle cx="320" cy="80" r="13" fill="{CARD}" stroke="{MUTED}" stroke-width="2.2"/>
  <rect x="285" y="14" width="70" height="26" rx="6" fill="none" stroke="{MUTED}" stroke-width="1.6"/>
  <text x="320" y="32" font-size="13.5" fill="{INK}" text-anchor="middle">main</text>
  <line x1="320" y1="40" x2="320" y2="64" stroke="{MUTED}"/>
  <path d="M330,90 C365,125 390,150 424,150" fill="none" stroke="{MUTED}" stroke-width="2.2"/>
  <circle cx="440" cy="150" r="13" fill="{CARD}" stroke="{ACCENT}" stroke-width="2.2"/>
  <rect x="405" y="184" width="70" height="26" rx="6" fill="none" stroke="{ACCENT}" stroke-width="1.6"/>
  <text x="440" y="202" font-size="13.5" fill="{ACCENT}" text-anchor="middle">feature</text>
  <circle cx="500" cy="80" r="13" fill="{CARD}" stroke="{MUTED}" stroke-width="2.2"/>
  <line x1="333" y1="80" x2="486" y2="80" stroke="{MUTED}" stroke-width="2.2"/>
  <circle cx="650" cy="80" r="13" fill="{CARD}" stroke="{SAFE}" stroke-width="2.6"/>
  <line x1="513" y1="80" x2="636" y2="80" stroke="{MUTED}" stroke-width="2.2"/>
  <path d="M452,143 C540,118 590,95 637,84" fill="none" stroke="{SAFE}" stroke-width="2.2"/>
  <text x="650" y="48" font-size="13" fill="{SAFE}" text-anchor="middle">merge</text>
  <circle cx="810" cy="80" r="13" fill="{CARD}" stroke="{HISTORY}" stroke-width="2.6" stroke-dasharray="5 3"/>
  <line x1="663" y1="80" x2="796" y2="80" stroke="{MUTED}" stroke-width="2.2" stroke-dasharray="5 3"/>
  <text x="810" y="48" font-size="13" fill="{HISTORY}" text-anchor="middle">rebase</text>
</svg>
<div class="defs">
  <div>A <b>branch</b> is a movable label on one commit. Creating one copies nothing; it is instant and free.</div>
  <div>A <b>merge</b> commit has two parents and joins the lines. History shows what truly happened; always safe on shared branches.</div>
  <div>A <b>rebase</b> replays your commits as new ones for a straight line. It rewrites history: your own unshared work only.</div>
  <div><b>HEAD</b> is where you stand, normally attached to a branch. Standing on a commit directly is detached HEAD: a state, not an error.</div>
</div>''', "The graph")


def start():
    steps = [
        ("1", "Install", "Windows: winget install Git.Git · macOS: brew install git · Debian: sudo apt install git", "git --version"),
        ("2", "Identity", "The same email as your GitHub account, or commits will not count on your profile", 'git config --global user.name "<name>" && git config --global user.email "<email>"'),
        ("3", "One key, every host", "Add the public key to GitHub, GitLab, Bitbucket, Azure: the same key works on all", 'ssh-keygen -t ed25519 -C "<email>"'),
        ("4", "First repository", "Joining: git clone <url> · Publishing a folder of yours:", "gh repo create <name> --public --source . --push"),
        ("5", "The loop you will run forever", "Edit, stage, commit, push. Everything else is a variation", 'git add <file> && git commit -m "<message>" && git push'),
        ("6", "When it goes wrong", "It will, for everyone. Ask the site in plain language, or paste the exact error", "amey-thakur.github.io/GIT-GUIDE"),
    ]
    items = "".join(
        f'<div class="step"><b>{n}</b><div><strong>{escape(t)}</strong><span>{escape(d)}</span><code>{escape(c)}</code></div></div>'
        for n, t, d, c in steps)
    return page(f'<h2>From zero to first push</h2><div class="steps">{items}</div>', "Start")


def workflows():
    flows = [
        ("Working alone", "Commit at every working state; push is your backup; branch before experiments", 'git add -A && git commit -m "<message>" && git push'),
        ("Feature branch", "The team default: main stays releasable, every change arrives by pull request", "git switch -c <change> && git push -u origin <change>"),
        ("Fork", "For repositories you cannot push to, which is all of open source", "gh repo fork <owner>/<repo> --clone"),
        ("Trunk-based", "Branches live hours, not weeks; tiny changes merge daily behind flags", "git config --global pull.rebase true"),
        ("Releases and hotfixes", "A release is a tag; a hotfix is a branch from that tag, merged back after shipping", "git switch -c hotfix-2.1.1 v2.1.0"),
    ]
    items = "".join(
        f'<div class="step"><b>›</b><div><strong>{escape(t)}</strong><span>{escape(d)}</span><code>{escape(c)}</code></div></div>'
        for t, d, c in flows)
    rules = ("Never rewrite a branch others build on; rewrite your own freely with force-with-lease. "
             "Pull with rebase. Protect main so nothing lands without review and green checks. "
             "When anything is unclear: git status names the state you are in, and usually the way out.")
    return page(f'<h2>How teams run Git</h2><div class="steps">{items}</div>'
                f'<p class="rules"><b>The rules that keep teams safe.</b> {rules}</p>', "Workflows")


def github_page():
    first = [("Name", "Short, lowercase, hyphens: weather-app"),
             ("Add a README", "The front page, and your first commit"),
             ("Add .gitignore", "Pick your language; noise stays out from day one"),
             ("Choose a license", "MIT if unsure; none means all rights reserved")]
    words = [("repository", "a project and its entire history; everyone says repo"),
             ("README.md", "the front page, rendered automatically"),
             ("Markdown", "plain text with light marks; GitHub renders it everywhere"),
             (".gitignore", "what Git must never track"),
             ("LICENSE", "the legal terms of reuse"),
             ("public, private", "everyone reads, only you write; or invitation only"),
             ("star", "a bookmark and a thank-you; stars rank repositories"),
             ("watch", "subscribe to issues, PRs, and releases"),
             ("clone vs fork", "to your machine; to your account"),
             ("issue", "a tracked conversation about one bug or request"),
             ("default branch", "usually main: what visitors see, what PRs target"),
             ("gist", "one shareable file with its own URL"),
             ("organization", "a shared account for a team")]
    c1 = ('<h2>Your first repository</h2><div class="list">'
          + "".join(f'<div><code>{escape(k)}</code><span>{escape(v)}</span></div>' for k, v in first)
          + '</div><h2 class="h2gap">The pull request path</h2>'
          + '<p class="note">branch · commit · push · open the PR · checks run · review answers with commits · merge, and the branch retires.</p>'
          + f'<div class="list"><div><code>gh pr create --fill</code><span>Open it from the terminal</span></div>'
          + f'<div><code>gh pr checkout &lt;number&gt;</code><span>Review one locally</span></div>'
          + f'<div><code>gh pr merge --squash --delete-branch</code><span>Land it clean</span></div></div>')
    c2 = ('<h2>The words nobody explains</h2><div class="list inline">'
          + "".join(f'<div><code>{escape(k)}</code><span>{escape(v)}</span></div>' for k, v in words)
          + "</div>")
    return page(f'<div class="cols"><div>{c1}</div><div>{c2}</div></div>', "GitHub")


def error_pages(errs):
    pages_out = []
    chunk = 12
    for n in range(0, len(errs), chunk):
        part = errs[n:n + chunk]
        half = (len(part) + 1) // 2
        def colerr(items):
            return ('<div class="errs">'
                    + "".join(f'<div><code>{escape(e["msg"])}</code><p>{escape(e["why"])}</p></div>' for e in items)
                    + "</div>")
        body = (f'<h2>The errors you will meet</h2>'
                f'<p class="note">The message, then the cause. Every fix is one search away on the site.</p>'
                f'<div class="cols"><div>{colerr(part[:half])}</div><div>{colerr(part[half:])}</div></div>')
        pages_out.append(page(body, f"Errors {n // chunk + 1}"))
    return pages_out


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
<p class="note">Every answer also lives in the repository's Discussions; a question the guide cannot answer becomes its next addition. MIT licensed, no trackers, works offline.</p>''', "Closing")


CSS = f'''
* {{ margin: 0; box-sizing: border-box; }}
@page {{ size: A4 landscape; margin: 0; }}
body {{ font-family: system-ui, "Segoe UI", Roboto, sans-serif; background: {PAPER}; color: {INK}; }}
.page {{ width: 297mm; height: 210mm; padding: 12mm 18mm 26mm; position: relative; page-break-after: always; overflow: hidden; }}
.pfoot {{ position: absolute; left: 18mm; right: 18mm; bottom: 6.5mm; display: flex; align-items: center; gap: 3.5mm;
  border-top: 0.4mm solid {LINE}; padding-top: 3mm; }}
.pfoot img {{ width: 8.5mm; height: 8.5mm; border-radius: 2mm; }}
.pfn b {{ display: block; font-size: 9pt; }}
.pfn a {{ font-size: 8pt; color: {MUTED}; text-decoration: none; }}
.pft {{ margin-left: auto; display: flex; align-items: center; gap: 2.5mm; color: {MUTED}; font-size: 8.5pt; }}
.phead {{ display: flex; align-items: center; gap: 7px; margin-bottom: 7mm; }}
.phead span {{ font-weight: 700; font-size: 12.5pt; }}
.phead em {{ margin-left: auto; font-style: normal; color: {MUTED}; font-size: 10pt; }}
i {{ color: {ACCENT}; font-style: normal; }}
h2 {{ font-size: 18.5pt; margin-bottom: 4mm; border-left: 1.4mm solid {ACCENT}; padding-left: 4mm; }}
.h2gap {{ margin-top: 7mm; }}
.cover {{ display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; }}
.cover h1 {{ font-size: 46pt; margin-top: 7mm; }}
.cover .tag {{ font-size: 15pt; font-weight: 600; margin-top: 5mm; }}
.cover .tag2 {{ color: {MUTED}; font-size: 11.5pt; line-height: 1.65; margin-top: 5mm; }}
.cover .qual {{ font-size: 10.5pt; margin-top: 7mm; }}
.cover .qual b {{ color: {MUTED}; font-weight: 400; padding: 0 2mm; }}
.prose {{ max-width: 205mm; }}
.prose p {{ font-size: 13.5pt; line-height: 1.85; margin-bottom: 6mm; }}
.prose .sign {{ color: {ACCENT}; font-weight: 700; font-size: 13pt; }}
.diag {{ width: 100%; max-height: 96mm; margin-bottom: 7mm; }}
.defs {{ display: grid; grid-template-columns: 1fr 1fr; gap: 5mm 12mm; }}
.defs div {{ font-size: 12pt; color: {MUTED}; line-height: 1.6; }}
.defs b {{ color: {INK}; font-family: Consolas, monospace; }}
.note {{ color: {MUTED}; font-size: 10.5pt; margin-bottom: 4mm; }}
.cols {{ display: grid; grid-template-columns: 1fr 1fr; gap: 0 14mm; }}
.list div {{ border-bottom: 0.3mm solid {LINE}; padding: 2.2mm 0; }}
.list code {{ font-family: Consolas, monospace; font-size: 10.5pt; display: block; overflow-wrap: anywhere; }}
.list code.danger {{ color: {DANGER}; }}
.list span {{ font-size: 9.5pt; color: {MUTED}; display: block; margin-top: 1mm; }}
.steps {{ display: grid; grid-template-columns: 1fr 1fr; gap: 7mm 12mm; }}
.step {{ display: flex; gap: 5mm; align-items: flex-start; }}
.step > b {{ color: {ACCENT}; font-size: 15pt; min-width: 8mm; }}
.step strong {{ font-size: 13.5pt; display: block; }}
.step span {{ font-size: 11pt; color: {MUTED}; display: block; margin: 1.2mm 0 2mm; }}
.step code {{ font-family: Consolas, monospace; font-size: 10.5pt; background: #23211d; border-radius: 2mm; padding: 1.6mm 3mm; display: inline-block; }}
.rules {{ font-size: 11.5pt; color: {MUTED}; line-height: 1.75; margin-top: 8mm; max-width: 250mm; }}
.rules b {{ color: {INK}; }}
.errs div {{ border-bottom: 0.3mm solid {LINE}; padding: 2.5mm 0; }}
.errs code {{ font-family: Consolas, monospace; font-size: 10pt; color: {DANGER}; overflow-wrap: anywhere; }}
.errs p {{ font-size: 9.3pt; color: {MUTED}; margin-top: 0.8mm; }}
.list.inline code {{ display: inline; }}
.list.inline span {{ display: inline; margin-left: 2.5mm; }}
.doors {{ display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 5mm; margin: 7mm 0 8mm; }}
.doors div {{ border: 0.4mm solid {LINE}; border-radius: 3mm; padding: 5mm; background: {CARD};
  border-left: 1.4mm solid {ACCENT}; }}
.doors b {{ color: {ACCENT}; font-size: 13pt; display: block; margin-bottom: 1.5mm; }}
.doors span {{ color: {MUTED}; font-size: 10.5pt; }}
'''


def main():
    sheet, errs = data()
    by = {s["title"]: s for s in sheet}
    pairs = [
        ("Setup and identity", "Start a project", "Setup"),
        ("The daily loop", "Branches", "Daily work"),
        ("Merge and rebase", "Undo and rescue", "Undo"),
        ("Stash", "Inspect and search", "Inspect"),
        ("Tags and releases", "Files and ignoring", "Files"),
        ("Every platform, same Git", "No host at all", "Everywhere"),
        ("History surgery", "Scale and speed", "Deep water"),
        ("Submodules", "Quality of life", "Comfort"),
    ]
    pages = [cover(), foreword(), model(), graph(), start()]
    pages += [pair_page(by[a], by[b], t) for a, b, t in pairs]
    pages += [workflows(), github_page()]
    pages += error_pages(errs)
    pages += [closing()]
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
            capture_output=True, timeout=180,
        )
        print(f"git-guide.pdf: {PDF.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
