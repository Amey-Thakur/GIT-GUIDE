"""
File: coverage.py
Purpose: Measure how much of the real world's Git questions the guide already answers, and name the gaps.
Author: Amey Thakur
GitHub: https://github.com/Amey-Thakur
Tech: Python 3 standard library, Stack Exchange API (no key needed)
Description: Fetches the top-voted git-tagged questions from Stack Overflow, matches each title against the intents the way the site's search would, and prints the uncovered questions ranked by votes. Each authoring session takes the top of this list. Responses are cached in the system temp folder for a day.
Date: 2026-08-07
"""

import gzip
import html
import json
import re
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = ("https://api.stackexchange.com/2.3/questions"
       "?order=desc&sort=votes&tagged=git&site=stackoverflow&pagesize=100&page={}")
PAGES = int(sys.argv[1]) if len(sys.argv) > 1 else 10
CACHE = Path(tempfile.gettempdir()) / f"git-guide-so-top-{PAGES * 100}.json"
CACHE_AGE = 86400

STOP = {
    "how", "do", "does", "i", "a", "an", "the", "to", "in", "into", "of", "git", "github",
    "is", "what", "with", "for", "my", "and", "can", "you", "your", "from", "on", "it",
    "are", "between", "vs", "when", "why", "there", "way", "using", "use", "after",
    "have", "has", "be", "not", "no", "all", "get", "make", "or", "at", "that", "this",
}


def fetch():
    if CACHE.exists() and time.time() - CACHE.stat().st_mtime < CACHE_AGE:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    items = []
    for page in range(1, PAGES + 1):
        req = urllib.request.Request(API.format(page), headers={"Accept-Encoding": "gzip"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(gzip.decompress(r.read()))
        items += [{"title": q["title"], "score": q["score"]} for q in data["items"]]
        if not data.get("has_more"):
            break
        time.sleep(0.4)
    CACHE.write_text(json.dumps(items), encoding="utf-8")
    return items


def tokens(title):
    words = re.findall(r"[a-z0-9]+", html.unescape(title).lower())
    return [w for w in words if w not in STOP and len(w) > 1 and not w.isdigit()]


def haystacks():
    data = json.loads((ROOT / "docs" / "data" / "intents.json").read_text(encoding="utf-8"))
    errors = json.loads((ROOT / "docs" / "data" / "errors.json").read_text(encoding="utf-8"))
    out = []
    for i in data["intents"]:
        parts = [i["q"], i["id"].replace("-", " ")] + i["aka"]
        for v in i["variants"]:
            parts.append(v["when"])
            parts += [c["c"] for c in v["cmds"]]
    # errors count as coverage too: their message text answers the query
        out.append(" | ".join(parts).lower())
    for e in errors["errors"]:
        out.append((e["msg"] + " " + e["why"]).lower())
    return out


def main():
    questions = fetch()
    hs = haystacks()
    gaps, covered = [], 0
    for q in questions:
        toks = tokens(q["title"])
        if not toks:
            covered += 1
            continue
        best = max(sum(1 for t in toks if t in h) / len(toks) for h in hs)
        if best >= 0.6:
            covered += 1
        else:
            gaps.append((q["score"], q["title"], round(best, 2)))
    total = len(questions)
    print(f"Coverage: {covered}/{total} of the top {total} git questions ({covered * 100 // total}%)")
    print(f"Top uncovered, by votes:")
    for score, title, ratio in gaps[:40]:
        print(f"  {score:>6}  {ratio:.2f}  {title}")


if __name__ == "__main__":
    main()
