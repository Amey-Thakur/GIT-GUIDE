"""
File: validate.py
Purpose: The CI gate. Fails the build if the data breaks its contract or the prose breaks house style.
Author: Amey Thakur
GitHub: https://github.com/Amey-Thakur
Tech: Python 3 standard library only
Description: Validates every JSON file under docs/data (unique kebab-case ids, known danger levels, non-empty commands and undo, resolvable see-also references) and rejects em dashes in any tracked text file.
Date: 2026-08-07
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "docs" / "data"
# Tab, newline and carriage return are the only control characters allowed.
ALLOWED_CONTROL = chr(9) + chr(10) + chr(13)
import danger

DANGER = {danger.SAFE, danger.HISTORY, danger.DESTRUCTIVE}
RANK = danger.RANK

# The badge on a card has to describe the worst thing on that card. Under-stating
# it is the one failure this guide cannot have, and it is easy to introduce by
# hand, so the rule is enforced rather than remembered. The patterns live in
# danger.py, which is also what colours the cards, the poster and the PDF.

# Recipes that look dangerous by pattern and provably are not. Each needs a
# reason, because an allow-list without one becomes a place to hide things.
DANGER_EXEMPT = {
    ("split-subfolder-repo", 0):
        "filter-repo runs inside a fresh clone in a new folder; the source repository "
        "is never touched and the undo is to delete the clone",
}
KEBAB = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
TEXT_SUFFIXES = {".md", ".html", ".css", ".js", ".json", ".txt", ".yml", ".yaml", ".py", ".svg"}

errors = []


def err(msg):
    errors.append(msg)


def check_intents(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    intents = data.get("intents", [])
    if not intents:
        err(f"{path.name}: no intents")
        return
    ids = set()
    for it in intents:
        iid = it.get("id", "")
        where = f"{path.name}:{iid or '?'}"
        if not KEBAB.match(iid):
            err(f"{where}: id is not kebab-case")
        if iid in ids:
            err(f"{where}: duplicate id")
        ids.add(iid)
        if not it.get("q"):
            err(f"{where}: missing q")
        if not isinstance(it.get("aka"), list) or not it["aka"]:
            err(f"{where}: aka must be a non-empty list")
        variants = it.get("variants", [])
        if not variants:
            err(f"{where}: no variants")
        for vi, v in enumerate(variants):
            if v.get("danger") not in DANGER:
                err(f"{where}: unknown danger '{v.get('danger')}'")
            elif (iid, vi) not in DANGER_EXEMPT:
                worst = danger.worst([c.get("c", "") for c in v.get("cmds", [])])
                if RANK[v["danger"]] < RANK[worst]:
                    err(f"{where}: variant {vi} is marked '{v['danger']}' but contains a "
                        f"'{worst}' command: {[c.get('c') for c in v.get('cmds', [])]}")
            if not v.get("when"):
                err(f"{where}: variant missing when")
            if not v.get("undo"):
                err(f"{where}: variant missing undo")
            cmds = v.get("cmds", [])
            if not cmds:
                err(f"{where}: variant has no commands")
            for c in cmds:
                if not c.get("c"):
                    err(f"{where}: empty command")
    for it in intents:
        for ref in it.get("seealso", []):
            if ref not in ids:
                err(f"{path.name}:{it['id']}: seealso '{ref}' does not exist")
    print(f"{path.name}: {len(intents)} intents OK" if not errors else f"{path.name}: checked")


def intent_ids():
    data = json.loads((DATA / "intents.json").read_text(encoding="utf-8"))
    return {i["id"] for i in data.get("intents", [])}


def error_ids():
    data = json.loads((DATA / "errors.json").read_text(encoding="utf-8"))
    return {e["id"] for e in data.get("errors", [])}


def check_errors(path, known):
    data = json.loads(path.read_text(encoding="utf-8"))
    seen = set()
    for e in data.get("errors", []):
        where = f"{path.name}:{e.get('id', '?')}"
        if not KEBAB.match(e.get("id", "")):
            err(f"{where}: id is not kebab-case")
        if e["id"] in seen:
            err(f"{where}: duplicate id")
        seen.add(e["id"])
        if not e.get("msg") or not e.get("why"):
            err(f"{where}: msg and why are required")
        if e.get("intent") and e["intent"] not in known:
            err(f"{where}: intent '{e['intent']}' does not exist")
        if not e.get("intent") and not e.get("fix"):
            err(f"{where}: needs either an intent link or fix commands")
        for c in e.get("fix", []):
            if not c.get("c"):
                err(f"{where}: empty fix command")
        for ref in e.get("seealso", []):
            if ref not in known:
                err(f"{where}: seealso '{ref}' does not exist")
    print(f"{path.name}: {len(data.get('errors', []))} errors OK")


def check_scenarios(path, known, known_errors):
    data = json.loads(path.read_text(encoding="utf-8"))
    nodes = data.get("nodes", {})
    if data.get("start") not in nodes:
        err(f"{path.name}: start node missing")
    reachable = set()
    stack = [data.get("start")]
    while stack:
        nid = stack.pop()
        if nid in reachable or nid not in nodes:
            continue
        reachable.add(nid)
        for opt in nodes[nid].get("opts", []):
            if "next" in opt:
                if opt["next"] not in nodes:
                    err(f"{path.name}:{nid}: next '{opt['next']}' does not exist")
                else:
                    stack.append(opt["next"])
            elif "errleaf" in opt:
                if opt["errleaf"] not in known_errors:
                    err(f"{path.name}:{nid}: errleaf '{opt['errleaf']}' does not exist in errors")
            elif "leaf" in opt:
                if opt["leaf"] not in known:
                    err(f"{path.name}:{nid}: leaf '{opt['leaf']}' does not exist in intents")
            else:
                err(f"{path.name}:{nid}: option '{opt.get('label')}' has no next, leaf, or errleaf")
    for nid in nodes:
        if nid not in reachable:
            err(f"{path.name}:{nid}: node is unreachable")
    print(f"{path.name}: {len(nodes)} nodes OK")


def check_house_style():
    em_dash = "—"
    for p in ROOT.rglob("*"):
        if ".git" in p.parts and ".github" not in p.parts:
            continue
        if p.is_file() and p.suffix in TEXT_SUFFIXES and p.name != "validate.py":
            text = p.read_text(encoding="utf-8", errors="ignore")
            if em_dash in text:
                line = text[: text.index(em_dash)].count("\n") + 1
                err(f"{p.relative_to(ROOT)}:{line}: em dash found, house style forbids it")



def check_quizzes(path):
    """Every question needs exactly one correct answer and a reason on each option."""
    data = json.loads(path.read_text(encoding="utf-8"))
    quizzes = data.get("quizzes", [])
    if not quizzes:
        err("quizzes.json: no quizzes")
        return
    seen = set()
    total = 0
    for quiz in quizzes:
        qid = quiz.get("id", "")
        if not re.fullmatch(r"[a-z0-9-]+", qid):
            err(f"quizzes.json: bad quiz id {qid!r}")
        if qid in seen:
            err(f"quizzes.json: duplicate quiz id {qid!r}")
        seen.add(qid)
        for q in quiz.get("questions", []):
            total += 1
            label = f"quizzes.json/{qid}: {q.get('q', '')[:45]}"
            options = q.get("a", [])
            if len(options) < 2:
                err(f"{label}: needs at least two options")
            right = [a for a in options if a.get("ok")]
            if len(right) != 1:
                err(f"{label}: has {len(right)} correct answers, needs exactly one")
            for a in options:
                if not a.get("t"):
                    err(f"{label}: an option has no text")
                if not a.get("why"):
                    err(f"{label}: option {a.get('t', '')!r} has no explanation")
    print(f"quizzes.json: {total} questions OK")



def check_control_chars():
    """No stray control characters in shipped files.

    A generator script once wrote \1 into a replacement string, Python read it
    as an octal escape, and every page shipped two invisible control characters
    that browsers drew as empty boxes in the footer. Cheap to check, easy to miss.
    """
    for path in sorted((ROOT / "docs").glob("*.*")):
        if path.suffix in {".png", ".jpg", ".jpeg", ".pdf", ".ico", ".woff", ".woff2"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        bad = {c for c in text if ord(c) < 32 and c not in ALLOWED_CONTROL}
        if bad:
            names = ", ".join(f"U+{ord(c):04X}" for c in sorted(bad))
            err(f"{path.name}: contains control characters ({names})")



def check_links():
    """Every internal href must resolve: the file exists and any #anchor is real.

    The finder and the errors page render most of their anchors from JSON at
    runtime, so those ids come from the data rather than the static markup.
    """
    docs = ROOT / "docs"
    pages = sorted(docs.glob("*.html"))
    if not pages:
        return

    intent_id_set = intent_ids()
    error_id_set = error_ids()

    ids = {}
    for page in pages:
        ids[page.name] = set(re.findall(r'id="([^"]+)"', page.read_text(encoding="utf-8")))
    ids.setdefault("index.html", set()).update(intent_id_set)
    ids.setdefault("errors.html", set()).update(error_id_set)

    for page in pages:
        for href in re.findall(r'href="([^"]+)"', page.read_text(encoding="utf-8")):
            if href.startswith(("http://", "https://", "mailto:", "data:", "#!")):
                continue
            clean = href.replace("/GIT-GUIDE/", "").split("?")[0]
            target, _, frag = clean.partition("#")
            if not target:
                target = page.name          # a bare #anchor points at this page
            elif target == "./":
                target = "index.html"
            if not (docs / target).exists():
                err(f"{page.name}: link to a file that does not exist: {href}")
            elif frag and frag not in ids.get(target, set()):
                err(f"{page.name}: link to an anchor that does not exist: {href}")


def main():
    known = set()
    for path in sorted(DATA.glob("*.json")):
        try:
            if path.name == "intents.json":
                check_intents(path)
                known = intent_ids()
            elif path.name == "errors.json":
                check_errors(path, known or intent_ids())
            elif path.name == "quizzes.json":
                check_quizzes(path)
            elif path.name == "scenarios.json":
                check_scenarios(path, known or intent_ids(), error_ids())
            else:
                json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(f"{path.name}: invalid JSON: {e}")
    check_house_style()
    check_links()
    check_control_chars()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)
    print("All checks passed.")


if __name__ == "__main__":
    main()
