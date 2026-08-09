"""
File: build_booklet.py
Purpose: Assemble Git Guide as a complete printable PDF: the model, every command section, every error, the chapters.
Author: Amey Thakur
GitHub: https://github.com/Amey-Thakur
Tech: Python 3 standard library; headless Chrome prints the PDF
Description: Builds .github/assets/booklet.html (ignored) from docs/data and prints docs/assets/git-guide.pdf (committed, served). A4 landscape, dark, branded. Every page carries the same footer: avatar, author, clickable address, GitHub mark, tagline. Any count on the cover is read from the data, never typed, so the PDF cannot claim a number the site does not have.
Date: 2026-08-08
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


DANGER_WORD = {"safe": "Safe", "history": "Rewrites history", "destructive": "Can lose work"}


def data():
    sheet = json.loads((DOCS / "data" / "cheatsheet.json").read_text(encoding="utf-8"))["sections"]
    errs = json.loads((DOCS / "data" / "errors.json").read_text(encoding="utf-8"))["errors"]
    ints = json.loads((DOCS / "data" / "intents.json").read_text(encoding="utf-8"))["intents"]
    return sheet, errs, ints


def logo(size):
    raw = (DOCS / "assets" / "git-logo.svg").read_text(encoding="utf-8")
    inner = re.search(r"<svg[^>]*>(.*)</svg>", raw, re.S).group(1)
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 78 78" '
            f'xmlns="http://www.w3.org/2000/svg">{inner}</svg>')


AVATAR = base64.b64encode((DOCS / "assets" / "amey.jpg").read_bytes()).decode()

FOOT = f'''<div class="pfoot">
  <img src="data:image/jpeg;base64,{AVATAR}" alt="">
  <div class="pfn"><b>Amey Thakur</b><a href="https://amey-thakur.github.io/GIT-GUIDE/">amey-thakur.github.io/GIT-GUIDE</a></div>
  <div class="pft"><svg width="18" height="18" viewBox="0 0 24 24" fill="{MUTED}"><path d="{GH}"/></svg><span>{TAGLINE}</span></div>
</div>'''


def page(body, title=""):
    head = (f'<div class="phead"><a class="pbrand" href="https://amey-thakur.github.io/GIT-GUIDE/">{logo(27)}<span>Git Guide<i>.</i></span></a><em>{escape(title)}</em></div>'
            if title else "")
    return f'<section class="page">{head}<div class="pbody">{body}</div>{FOOT}</section>'


def col(section):
    out = ['<div class="csec">', f"<h2>{escape(section['title'])}</h2>"]
    if section.get("note"):
        out.append(f'<p class="note">{escape(section["note"])}</p>')
    out.append('<div class="list">')
    for it in section["items"]:
        # Three colours from the one shared definition, so the sheet in the PDF
        # and the card on the wall grade the same command the same way.
        lvl = "read" if danger.reads_only(it["c"]) else danger.level(it["c"])
        cls = f' class="lv-{lvl}"' if lvl != danger.SAFE else ""
        out.append(f'<div><code{cls}>{escape(it["c"])}</code><span>{escape(it["d"])}</span></div>')
    out.append("</div></div>")
    return "".join(out)



# One extra idea per section, used only when a page would otherwise run short.
SECTION_TIPS = {
    "History surgery": [
        ("Rewrite only what is yours", "git log --oneline origin/main..HEAD",
         "Anything listed here is unpushed and safe to reshape."),
        ("Never the shared branch", "git push --force-with-lease",
         "Refuses the push if the remote moved, which plain --force will not."),
    ],
    "Submodules": [
        ("Clone one that has them", "git clone --recurse-submodules <url>",
         "A plain clone leaves the folders empty and confusing."),
        ("Or repair it afterwards", "git submodule update --init --recursive",
         "Fills them in without recloning."),
    ],
    "Stash": [
        ("Label it or lose it", 'git stash push -u -m "<what it was>"',
         "An unlabelled stash is a mystery by Thursday. The -u includes untracked files."),
        ("Look before you apply", "git stash show -p stash@{0}",
         "Shows the patch so nothing lands unseen."),
    ],
    "Tags and releases": [
        ("Tags do not travel by default", "git push origin <tag>",
         "A normal push leaves them behind; push.followTags makes it automatic."),
        ("Annotated for anything public", 'git tag -a v1.0.0 -m "Release v1.0.0"',
         "Carries an author, date, and message; lightweight tags carry none."),
    ],
    "Start a project": [
        ("Publish a folder you already have", "gh repo create <name> --private --source . --push",
         "Creates the repository, wires the remote, and pushes, in one command."),
        ("Ignore noise from the first commit", "curl -o .gitignore https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore",
         "Far easier than removing it from history later."),
    ],
    "Scale and speed": [
        ("Clone a huge repository fast", "git clone --filter=blob:none <url>",
         "Full history, file contents on demand. Nothing is missing later."),
        ("Keep it fast", "git maintenance start",
         "Schedules the upkeep that keeps log and status quick."),
    ],
    "Files and ignoring": [
        ("The rule people miss", "git rm -r --cached <path>",
         "Ignoring never untracks what is already committed; this does."),
        ("Find the rule that matched", "git check-ignore -v <path>",
         "Names the file, line, and pattern responsible."),
    ],
    "No host at all": [
        ("A repository in one file", "git bundle create repo.bundle --all",
         "Clone straight from it. Crosses air gaps and email."),
        ("Any folder can be a remote", "git init --bare /path/repo.git",
         "No server, no account, still a real remote.")
    ],
}


def tips_band(sections, room):
    """A short band of related answers, for pages that would otherwise run light."""
    picked = []
    for sec in sections:
        for t in SECTION_TIPS.get(sec["title"], []):
            picked.append(t)
    if not picked:
        return ""
    items = "".join(
        f'<div><strong>{escape(t)}</strong><code>{escape(c)}</code><span>{escape(d)}</span></div>'
        for t, c, d in picked[:room])
    return f'<div class="band"><h3 class="bandh">Worth knowing</h3><div class="bandgrid">{items}</div></div>'


def sheet_pages(sections):
    """Two sections a page, matched by length so both columns end level."""
    order = sorted(sections, key=lambda x: -len(x["items"]))
    out = []
    for n in range(0, len(order), 2):
        a = order[n]
        b = order[n + 1] if n + 1 < len(order) else None
        left = col(a)
        right = col(b) if b else ""
        weight = len(a["items"]) + (len(b["items"]) if b else 0)
        room = 4 if weight <= 9 else (2 if weight <= 12 else 0)
        band = tips_band([x for x in (a, b) if x], room) if room else ""
        out.append(page(f'<div class="cols"><div>{left}</div><div>{right}</div></div>{band}',
                        "Cheat sheet"))
    return out


def cover(ints, errs):
    # Counts come from the data, so the cover cannot outlive what is behind it.
    return page(f'''
<div class="cover">
  {logo(160)}
  <h1>Git Guide<i>.</i></h1>
  <p class="tag">{TAGLINE}</p>
  <p class="tag2">Ask in plain language, or paste the error Git printed.<br>
  Exact commands, a danger level for each, and its undo.</p>
  <p class="scale"><b class="g">{len(ints)}</b> answers <i>·</i> <b class="r">{len(errs)}</b> errors decoded
  <i>·</i> <b class="y">{course()[2]}</b> lessons you can run</p>
  <p class="qual">an undo for everything <b>·</b> works offline <b>·</b> no trackers <b>·</b> MIT</p>
</div>''')


def foreword(ints, errs):
    return page(f'''
<div class="prose">
<h2>A note from Amey</h2>
<p>Git carries nearly every codebase on earth, and almost everyone learned it by accident: a command from a teammate, a midnight search, a ritual repeated without understanding.</p>
<p>The gap was never which command to type. It is the question nobody answers first: <b>will this destroy my work, and can I get it back</b>. Documentation says what a command does, rarely what it costs.</p>
<p>So every answer here carries two things. A danger level, in three words: <b class="g">safe</b>, <b class="y">rewrites history</b>, <b class="r">can lose work</b>. And its undo, or a plain statement that none exists.</p>
<p>Read these in any order. The model comes first because everything else follows from it, and the errors near the back are worth a skim now, so meeting one later feels like recognition rather than panic.</p>
<p>This is the portable half. The other half is at <a class="inl" href="https://amey-thakur.github.io/GIT-GUIDE/">amey-thakur.github.io/GIT-GUIDE</a>: a search box over the same {len(ints)} answers and {len(errs)} decoded errors, and a Git engine you can break on purpose and put back.</p>
<p>That last one is the point. <b>Committed work is almost always recoverable. Uncommitted work is not.</b> Believe those two sentences and Git stops being something to be careful around.</p>
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
           + f'<path d="M580,186 C580,244 110,244 110,190" fill="none" stroke="{ACCENT}" stroke-width="2.2"/>'
           + f'<polygon points="110,184 105,194 115,194" fill="{ACCENT}"/>'
           + f'<text x="345" y="212" font-size="12.5" fill="{ACCENT}" text-anchor="middle" font-family="Consolas,monospace">merge / pull</text>')
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
        ("6", "Keep the noise out", "Ignore build output and dependencies from the first commit, not the tenth", "curl -o .gitignore https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore"),
        ("7", "When it goes wrong", "It will, for everyone. Ask the site in plain language, or paste the exact error", "amey-thakur.github.io/GIT-GUIDE"),
    ]
    items = "".join(
        f'<div class="step"><b>{n}</b><div><strong>{escape(t)}</strong><span>{escape(d)}</span><code>' + (f'<a class="codelink" href="https://amey-thakur.github.io/GIT-GUIDE/">{escape(c)}</a>' if 'GIT-GUIDE' in c else escape(c)) + '</code></div></div>'
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
    chunk = 10
    for n in range(0, len(errs), chunk):
        part = errs[n:n + chunk]
        half = (len(part) + 1) // 2
        def colerr(items):
            return ('<div class="errs">'
                    + "".join(f'<div><code>{escape(e["msg"])}</code><p>{escape(e["why"])}</p></div>' for e in items)
                    + "</div>")
        body = (f'<h2>The errors you will meet</h2>'
                f'<p class="note">The message, then the cause. Every fix is one search away <a class="inl" href="https://amey-thakur.github.io/GIT-GUIDE/">on the site</a>.</p>'
                f'<div class="cols"><div>{colerr(part[:half])}</div><div>{colerr(part[half:])}</div></div>')
        pages_out.append(page(body, f"Errors {n // chunk + 1}"))
    return pages_out


def course():
    """The chapters and their lesson counts, read out of the sandbox itself.

    The lessons live in play.js rather than in a JSON file, so this parses them
    from the source. Typing the numbers here would mean the PDF, the page it
    describes, and the README could all disagree the first time a lesson moves.
    """
    src = (DOCS / "play.js").read_text(encoding="utf-8")
    chapters = [(int(n), name, blurb) for n, name, blurb in re.findall(
        r'\{\s*n:\s*(\d+),\s*name:\s*"([^"]+)",\s*blurb:\s*"([^"]+)"', src)]
    counts = {}
    for ch in re.findall(r'\bch:\s*(\d+)', src):
        counts[int(ch)] = counts.get(int(ch), 0) + 1
    total = sum(counts.values())
    if not chapters or not total:
        raise SystemExit("build_booklet: could not read the course out of play.js")
    return chapters, counts, total


def practise_page():
    """The one thing in the guide that cannot be printed, described on paper.

    Everything else in this PDF is the portable half of the site. The sandbox is
    not portable, and it is the strongest reason to open the address at the
    bottom of every page, so it gets a page of its own that says what is waiting.
    """
    chapters, counts, total = course()
    cards = "".join(
        f'<div class="chcard"><b>{n}</b><div><strong>{escape(name)}</strong>'
        f'<span>{escape(blurb)}</span>'
        f'<em>{counts.get(n, 0)} lesson{"" if counts.get(n, 0) == 1 else "s"}</em></div></div>'
        for n, name, blurb in chapters)
    return page(f'''
<h2>Practise on a graph you cannot break</h2>
<p class="note bignote">A working Git engine runs inside the page at
<a class="inl" href="https://amey-thakur.github.io/GIT-GUIDE/play.html">amey-thakur.github.io/GIT-GUIDE/play.html</a>.
Not a simulation of the output: commits, branches, HEAD, the index, file contents and the reflog are all modelled,
so a merge really makes a second parent and a rebase really abandons the originals.</p>
<div class="chgrid">{cards}</div>
<div class="band">
  <h3 class="bandh">The two nobody lets you rehearse</h3>
  <div class="bandgrid">
    <div><strong>A conflict with the markers still in it</strong>
      <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD</code>
      <span>The file opens for editing, both versions and all. Delete the markers, keep the version you
      want, and the sandbox refuses the commit while any remain.</span></div>
    <div><strong>The recovery drill, against a clock</strong>
      <code>git reflog</code>
      <span>Three commits of work go in, and the sandbox destroys them with a hard reset. The Undo button
      is switched off, because on the day it happens to you there is no Undo. Bring them home and it tells
      you how long you took.</span></div>
  </div>
</div>''', "Practise")


def closing():
    doors = [("Finder", "ask anything, or paste the error", ""), ("Start", "zero to first push", "setup.html"),
             ("Learn", "the model, step by step", "learn.html"), ("Practise", "a real Git graph to play on", "play.html"),
             ("Fix", "guided rescue", "fix.html"),
             ("Errors", "Git's messages, decoded", "errors.html"), ("GitHub", "first repo to branch protection", "github.html"),
             ("Workflows", "how teams run Git", "workflows.html"), ("Cheatsheet", "everything, one line each", "cheatsheet.html")]
    items = "".join(f'<a href="https://amey-thakur.github.io/GIT-GUIDE/{u}"><b>{n}</b><span>{d}</span></a>' for n, d, u in doors)
    legend = (f'<div class="legend">'
              f'<span style="border-color:{SAFE};color:{SAFE}">SAFE</span>'
              f'<span style="border-color:{HISTORY};color:{HISTORY}">REWRITES HISTORY</span>'
              f'<span style="border-color:{DANGER};color:{DANGER}">DESTRUCTIVE</span>'
              f'<em>every answer carries its danger level and its undo</em></div>')
    return page(f'''
<h2>The living version</h2>
<p class="note bignote">Nine doors, one address: <a class="inl" href="https://amey-thakur.github.io/GIT-GUIDE/">amey-thakur.github.io/GIT-GUIDE</a></p>
<div class="doors">{items}</div>
{legend}
<p class="note bignote">Every answer also lives in the repository's Discussions; a question the guide cannot answer becomes its next addition. MIT licensed, no trackers, works offline.</p>''', "Closing")


CSS = f'''
* {{ margin: 0; box-sizing: border-box; }}
@page {{ size: A4 landscape; margin: 0; }}
body {{ font-family: system-ui, "Segoe UI", Roboto, sans-serif; background: {PAPER}; color: {INK}; }}
.page {{ width: 297mm; height: 210mm; padding: 12mm 18mm 30mm; position: relative; page-break-after: always; overflow: hidden; }}
.pfoot {{ position: absolute; left: 18mm; right: 18mm; bottom: 6.5mm; display: flex; align-items: center; gap: 3.5mm;
  border-top: 0.4mm solid {LINE}; padding-top: 3mm; }}
.pfoot img {{ width: 11mm; height: 11mm; border-radius: 2.5mm; }}
.pfn b {{ display: block; font-size: 11pt; }}
.pfn a {{ font-size: 9.5pt; color: {MUTED}; text-decoration: none; }}
.pft {{ margin-left: auto; display: flex; align-items: center; gap: 3mm; color: {MUTED}; font-size: 10.5pt; }}
.phead {{ display: flex; align-items: center; gap: 7px; margin-bottom: 7mm; }}
.phead span {{ font-weight: 700; font-size: 15.5pt; }}
.phead em {{ margin-left: auto; font-style: normal; color: {MUTED}; font-size: 12pt; }}
i {{ color: {ACCENT}; font-style: normal; }}
.pbrand {{ display: flex; align-items: center; gap: 7px; color: inherit; text-decoration: none; }}
a.inl {{ color: {INK}; font-weight: 700; text-decoration: none; }}
.codelink {{ color: inherit; text-decoration: none; }}
h2 {{ font-size: 18.5pt; margin-bottom: 4mm; border-left: 1.4mm solid {ACCENT}; padding-left: 4mm; }}
.h2gap {{ margin-top: 7mm; }}
.cover {{ display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; }}
.cover h1 {{ font-size: 64pt; margin-top: 10mm; }}
.cover .tag {{ font-size: 20pt; font-weight: 600; margin-top: 8mm; }}
.cover .tag2 {{ color: {MUTED}; font-size: 14.5pt; line-height: 1.7; margin-top: 8mm; }}
.cover .scale {{ font-size: 15pt; margin-top: 9mm; }}
/* The three numbers take the three colours the whole guide uses: green for what
   is safe to reach for, red for the errors, amber for the part that asks for
   your attention. The key is learned here and holds on every page after. */
.cover .scale b {{ font-weight: 700; }}
.cover .scale .g {{ color: {SAFE}; }}
.cover .scale .r {{ color: {DANGER}; }}
.cover .scale .y {{ color: {HISTORY}; }}
.cover .scale i {{ color: {MUTED}; font-style: normal; padding: 0 2mm; }}
.cover .qual {{ font-size: 13pt; margin-top: 5mm; color: {MUTED}; }}
.cover .qual b {{ color: {LINE}; font-weight: 400; padding: 0 2mm; }}
/* Only the foreword uses this. Widening the measure rather than shrinking the
   type is what buys the room: it removes whole lines without making the one
   page of continuous prose in the guide feel cramped. */
.prose {{ max-width: 254mm; }}
.prose p {{ font-size: 13.5pt; line-height: 1.72; margin-bottom: 4mm; }}
.prose b {{ font-weight: 700; }}
.prose b.g {{ color: {SAFE}; }}
.prose b.y {{ color: {HISTORY}; }}
.prose b.r {{ color: {DANGER}; }}
.prose .sign {{ color: {ACCENT}; font-weight: 700; font-size: 16pt; }}
.diag {{ width: 100%; max-height: 96mm; margin-bottom: 7mm; }}
.defs {{ display: grid; grid-template-columns: 1fr 1fr; gap: 5mm 12mm; }}
.defs div {{ font-size: 12pt; color: {MUTED}; line-height: 1.6; }}
.defs b {{ color: {INK}; font-family: Consolas, monospace; }}
.note {{ color: {MUTED}; font-size: 10.5pt; margin-bottom: 4mm; }}

.band {{ margin-top: 9mm; border-top: 0.4mm solid {LINE}; padding-top: 5mm; }}
.bandh {{ font-size: 11pt; color: {MUTED}; margin-bottom: 3.5mm; letter-spacing: 0.02em; }}
.bandgrid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 4.5mm 14mm; }}
.bandgrid div {{ border-left: 1mm solid {ACCENT}; padding-left: 4mm; }}
.bandgrid strong {{ display: block; font-size: 11.5pt; margin-bottom: 1.2mm; }}
.bandgrid code {{ display: block; font-family: Consolas, monospace; font-size: 10pt;
  color: {ACCENT}; overflow-wrap: anywhere; }}
.bandgrid span {{ display: block; font-size: 9.5pt; color: {MUTED}; margin-top: 1mm; }}
.cols > div > .csec + .csec {{ margin-top: 9mm; }}
.cols {{ display: grid; grid-template-columns: 1fr 1fr; gap: 0 14mm; }}
.list div {{ border-bottom: 0.3mm solid {LINE}; padding: 1.6mm 0; }}
.list code {{ font-family: Consolas, monospace; font-size: 10.5pt; display: block; overflow-wrap: anywhere; }}
.list code.lv-read {{ color: {SAFE}; }}
.list code.lv-history {{ color: {HISTORY}; }}
.list code.lv-destructive {{ color: {DANGER}; }}
.list span {{ font-size: 9.5pt; color: {MUTED}; display: block; margin-top: 0.7mm; }}
.steps {{ display: grid; grid-template-columns: 1fr 1fr; gap: 7mm 12mm; }}
.step {{ display: flex; gap: 5mm; align-items: flex-start; }}
.step > b {{ color: {ACCENT}; font-size: 15pt; min-width: 8mm; }}
.step strong {{ font-size: 13.5pt; display: block; }}
.step span {{ font-size: 11pt; color: {MUTED}; display: block; margin: 1.2mm 0 2mm; }}
.step code {{ font-family: Consolas, monospace; font-size: 10.5pt; background: #23211d; border-radius: 2mm; padding: 1.6mm 3mm; display: inline-block; }}
.rules {{ font-size: 11.5pt; color: {MUTED}; line-height: 1.75; margin-top: 8mm; max-width: 250mm; }}
.rules b {{ color: {INK}; }}
.errs div {{ border-bottom: 0.3mm solid {LINE}; padding: 1.9mm 0; }}
.errs code {{ font-family: Consolas, monospace; font-size: 10pt; color: {DANGER}; overflow-wrap: anywhere; }}
.errs p {{ font-size: 9.3pt; color: {MUTED}; margin-top: 0.8mm; }}
.list.inline code {{ display: inline; }}
.list.inline span {{ display: inline; margin-left: 2.5mm; }}
.doors {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4.5mm; margin: 6mm 0 6.5mm; }}
.doors a {{ display: block; color: inherit; text-decoration: none;  border: 0.4mm solid {LINE}; border-radius: 3mm; padding: 5mm 5.5mm; background: {CARD};
  border-left: 1.4mm solid {ACCENT}; }}
.doors b {{ color: {ACCENT}; font-size: 14.5pt; display: block; margin-bottom: 1.6mm; }}

/* The six chapters of the sandbox course, three across so the rows sit level. */
.chgrid {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4.5mm; margin: 6mm 0 7mm; }}
.chcard {{ display: flex; gap: 4mm; align-items: flex-start; border: 0.4mm solid {LINE};
  border-radius: 3mm; padding: 4.5mm 5mm; background: {CARD}; }}
.chcard > b {{ color: {ACCENT}; font-size: 19pt; line-height: 1; min-width: 7mm; }}
.chcard strong {{ display: block; font-size: 13pt; margin-bottom: 1.4mm; }}
.chcard span {{ display: block; font-size: 10.5pt; color: {MUTED}; line-height: 1.55; }}
.chcard em {{ display: block; font-style: normal; font-size: 9.5pt; color: {HISTORY}; margin-top: 2mm; }}
.doors span {{ color: {MUTED}; font-size: 11.5pt; }}
.bignote {{ font-size: 12.5pt; }}
.legend {{ display: flex; align-items: center; gap: 6mm; margin: 0 0 6.5mm; }}
.legend span {{ border: 0.55mm solid; border-radius: 2mm; padding: 2.2mm 5mm; font-weight: 700; font-size: 11pt; }}


.pbody {{ display: block; }}
.undos {{ display: grid; gap: 2.2mm; margin-top: 3mm; }}
.undo {{ display: grid; grid-template-columns: 63mm 1fr 27mm; align-items: center; gap: 4mm;
        border-bottom: 0.3mm solid {LINE}; padding-bottom: 2.2mm; }}
.undo strong {{ font-size: 11pt; }}
.undo code {{ font-family: Consolas, monospace; font-size: 10.2pt; color: {ACCENT}; overflow-wrap: anywhere; }}
.undo em {{ font-style: normal; font-size: 9pt; text-align: right; }}
.d-safe {{ color: #3fb950; }}
.d-history {{ color: #d29922; }}
.d-destructive {{ color: {DANGER}; }}
.errs b {{ display: block; font-family: Consolas, monospace; font-size: 9.8pt; color: {INK};
          font-weight: 400; margin-top: 1.4mm; overflow-wrap: anywhere; }}
.safeties {{ display: grid; gap: 4mm; margin-top: 4mm; }}
.safety {{ border-left: 1.2mm solid; padding-left: 5mm; }}
.safety strong {{ display: block; font-size: 13pt; }}
.safety span {{ display: block; color: {MUTED}; font-size: 10.5pt; margin: 1mm 0 1.5mm; }}
.subh {{ font-size: 13pt; margin: 7mm 0 2.5mm; color: {MUTED}; }}
.rehearse div {{ display: grid; grid-template-columns: 82mm 1fr; gap: 6mm;
  align-items: baseline; padding: 2mm 0; }}
.rehearse code {{ display: block; color: {INK}; }}
.rehearse span {{ display: block; margin: 0; }}
.safety code {{ font-family: Consolas, monospace; font-size: 10pt; color: {INK}; }}
.legend em {{ margin-left: auto; font-style: normal; color: {MUTED}; font-size: 11pt; }}
'''


UNDO_PICKS = [
    ("undo-last-commit", "Committed too early"),
    ("undo-git-add", "Staged the wrong file"),
    ("discard-changes", "Want the file back as committed"),
    ("add-to-last-commit", "Forgot a file in the last commit"),
    ("edit-commit-message", "Wrong commit message"),
    ("undo-amend", "Amended and regretted it"),
    ("undo-merge", "Merged the wrong branch"),
    ("undo-rebase", "Rebase went wrong"),
    ("undo-push", "Pushed something you should not have"),
    ("undo-pull", "Pull brought in a mess"),
    ("revert-to-commit", "Need the project back at an old commit"),
    ("restore-file", "One file should go back in time"),
    ("recover-lost-commit", "A commit vanished"),
    ("recover-deleted-branch", "Deleted a branch by mistake"),
    ("move-commits-to-branch", "Committed on the wrong branch"),
    ("remove-file-from-last-commit", "A file must leave the last commit"),
    ("stash", "Need a clean tree for five minutes"),
    ("undo-git-init", "Made a repository by accident"),
    ("restore-deleted-file", "A file was deleted commits ago"),
    ("reset-to-remote", "Start over from what the remote has"),
    ("undo-revert", "Reverted something you needed back"),
    ("recover-uncommitted-after-reset", "Reset --hard took uncommitted work"),
]

ERROR_PICKS = [
    "not-a-git-repository", "publickey-denied", "authentication-failed",
    "non-fast-forward-rejected", "fetch-first", "merge-conflict-marker",
    "index-lock-exists", "detached-head-msg", "diverged-msg", "src-refspec",
    "unrelated-histories", "dubious-ownership-msg", "file-size-limit-exact",
    "could-not-read-username", "no-upstream", "nothing-to-commit",
    "remote-hung-up", "repository-not-found",
    "host-key-verification", "lf-crlf-warning",
]


def undo_pages(intents):
    by = {i["id"]: i for i in intents}
    rows = []
    for iid, situation in UNDO_PICKS:
        i = by.get(iid)
        if not i:
            continue
        v = i["variants"][0]
        rows.append((situation, v["cmds"][0]["c"], v["danger"]))
    out = []
    per = 11
    for n in range(0, len(rows), per):
        items = "".join(
            f'<div class="undo"><strong>{escape(sit)}</strong>'
            f'<code>{escape(cmd)}</code>'
            f'<em class="d-{dang}">{DANGER_WORD[dang]}</em></div>'
            for sit, cmd, dang in rows[n:n + per])
        head = ('<h2>Undo anything</h2><p class="note">The situation, the command, and how much it costs. '
                'Green is safe, amber rewrites history, red can lose work.</p>') if n == 0 else '<h2>Undo anything, continued</h2>'
        out.append(page(f'{head}<div class="undos">{items}</div>', "Undo"))
    return out


def recovery_page():
    steps = [
        ("1", "git status", "Name the state you are in. Half of all panics end here."),
        ("2", "git stash push -u", "Freeze everything before trying anything, so no fix can destroy more."),
        ("3", "git reflog", "Every position HEAD has held, kept about ninety days. Anything ever committed is here."),
        ("4", "git branch rescue <hash>", "Found it? Name it immediately. A named commit cannot be garbage collected."),
        ("5", "git fsck --lost-found", "For work that was staged but never committed: it survives as a dangling object."),
        ("6", "Editor local history", "Never staged, never committed? Git never saw it. Your editor may have."),
    ]
    items = "".join(
        f'<div class="step"><b>{n}</b><div><strong>{escape(c)}</strong><span>{escape(d)}</span></div></div>'
        for n, c, d in steps)
    return page(f'<h2>I lost work: the order to try</h2>'
                f'<p class="note">Work down this list. Stop at the step that finds it.</p>'
                f'<div class="steps">{items}</div>'
                f'<p class="rules"><b>The habit that makes this unnecessary.</b> Commit early and often, and push daily. '
                f'The reflog protects anything committed; nothing protects work that was never committed.</p>', "Recovery")


def essential_errors(errs):
    by = {e["id"]: e for e in errs}
    picks = [by[i] for i in ERROR_PICKS if i in by]
    out = []
    per = 10
    for n in range(0, len(picks), per):
        part = picks[n:n + per]
        half = (len(part) + 1) // 2

        def colerr(items):
            return ('<div class="errs">' + "".join(
                f'<div><code>{escape(e["msg"][:96])}</code>'
                f'<p>{escape(e["why"])}</p>'
                f'<b>{escape(e["fix"][0]["c"])}</b></div>' for e in items) + '</div>')

        head = ('<h2>The errors you will actually meet</h2>'
                '<p class="note">The message, the cause, the first command. '
                'All 500 decoded errors are searchable '
                '<a class="inl" href="https://amey-thakur.github.io/GIT-GUIDE/errors.html">on the site</a>.</p>') if n == 0 \
            else '<h2>Errors, continued</h2>'
        out.append(page(f'{head}<div class="cols"><div>{colerr(part[:half])}</div>'
                        f'<div>{colerr(part[half:])}</div></div>', "Errors"))
    return out


def safety_page():
    rows = [
        ("Safe", "Nothing is lost, and most of it is reversible in a keystroke",
         "status · log · diff · fetch · switch · stash · revert · tag"),
        ("Rewrites history", "The content survives, but commits change identity. Fine alone, rude on a shared branch",
         "rebase · commit --amend · reset --soft · filter-repo · push --force-with-lease"),
        ("Can lose work", "Git may hold no copy afterwards. Rehearse first, and know the undo before you press enter",
         "reset --hard · clean -fd · push --force · branch -D · checkout -- <file>"),
    ]
    items = "".join(
        f'<div class="safety d-{k}"><strong>{escape(t)}</strong><span>{escape(d)}</span><code>{escape(c)}</code></div>'
        for k, (t, d, c) in zip(("safe", "history", "destructive"), rows))
    rehearse = [
        ("git clean -n -d", "before git clean -f -d, because cleaned files were never Git's to return"),
        ("git status", "before git reset --hard, so you know what is about to go"),
        ("git log --oneline HEAD..origin/main", "before any force push: anything listed is work you would erase"),
    ]
    dry = "".join(
        f'<div><code>{escape(c)}</code><span>{escape(d)}</span></div>' for c, d in rehearse)
    return page(f'<h2>How much does this command cost</h2>'
                f'<p class="note">Every answer in this guide carries one of these three marks, and its own undo.</p>'
                f'<div class="safeties">{items}</div>'
                f'<h3 class="subh">Rehearse first</h3>'
                f'<div class="list rehearse">{dry}</div>'
                f'<p class="rules"><b>Two commands hold nothing back.</b> git clean deletes files Git never tracked, '
                f'and git reset --hard discards edits that were never committed. Everything else, the reflog can usually reach.</p>',
                "Danger")


def main():
    sheet, errs, ints = data()
    pages = [cover(ints, errs), foreword(ints, errs), model(), graph(), start()]
    pages += sheet_pages(sheet)
    pages += [workflows(), github_page(), practise_page()]
    pages += undo_pages(ints)
    pages += [recovery_page(), safety_page()]
    pages += essential_errors(errs)
    pages += [closing()]
    HTML.write_text(
        f'<!doctype html><html><head><meta charset="utf-8"><title>Git Guide</title><style>{CSS}</style></head><body>'
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
        cover_png = DOCS / "assets" / "pdf-cover.png"
        subprocess.run(
            [chrome, "--headless=new", f"--screenshot={cover_png}", "--window-size=1123,794",
             "--hide-scrollbars", HTML.as_uri()],
            capture_output=True, timeout=60,
        )
        print(f"pdf-cover.png: {cover_png.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
