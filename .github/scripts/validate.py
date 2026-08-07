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
DANGER = {"safe", "history", "destructive"}
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
        for v in variants:
            if v.get("danger") not in DANGER:
                err(f"{where}: unknown danger '{v.get('danger')}'")
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


def check_scenarios(path, known):
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
            elif "leaf" in opt:
                if opt["leaf"] not in known:
                    err(f"{path.name}:{nid}: leaf '{opt['leaf']}' does not exist in intents")
            else:
                err(f"{path.name}:{nid}: option '{opt.get('label')}' has neither next nor leaf")
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


def main():
    known = set()
    for path in sorted(DATA.glob("*.json")):
        try:
            if path.name == "intents.json":
                check_intents(path)
                known = intent_ids()
            elif path.name == "errors.json":
                check_errors(path, known or intent_ids())
            elif path.name == "scenarios.json":
                check_scenarios(path, known or intent_ids())
            else:
                json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(f"{path.name}: invalid JSON: {e}")
    check_house_style()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)
    print("All checks passed.")


if __name__ == "__main__":
    main()
