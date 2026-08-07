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
    for path in sorted(DATA.glob("*.json")):
        try:
            check_intents(path) if path.name == "intents.json" else json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(f"{path.name}: invalid JSON: {e}")
    check_house_style()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)
    print("All checks passed.")


if __name__ == "__main__":
    main()
