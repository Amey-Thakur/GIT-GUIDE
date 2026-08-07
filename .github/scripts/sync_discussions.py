"""
File: sync_discussions.py
Purpose: Mirror every answer from the site into GitHub Discussions as an answered Q&A thread.
Author: Amey Thakur
GitHub: https://github.com/Amey-Thakur
Tech: Python 3 standard library plus the gh CLI (GraphQL API)
Description: Builds the desired set of threads from intents.json and errors.json, compares it with what exists, creates what is missing, and completes any thread that lacks its accepted answer. Idempotent and rate-limit aware: safe to re-run any time, and a rerun finishes whatever a rate limit interrupted.
Date: 2026-08-07
"""

import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OWNER, REPO = "Amey-Thakur", "GIT-GUIDE"
SITE = "https://amey-thakur.github.io/GIT-GUIDE/"
SLEEP = 3

DANGER_LABEL = {"safe": "Safe", "history": "Rewrites history", "destructive": "Destructive"}


def gql(query, **variables):
    cmd = ["gh", "api", "graphql", "-f", f"query={query}"]
    for k, v in variables.items():
        cmd += ["-f", f"{k}={v}"]
    stderr = ""
    for attempt in range(6):
        out = subprocess.run(cmd, capture_output=True, text=True)
        if out.returncode == 0:
            return json.loads(out.stdout)
        stderr = out.stderr.strip()
        if "too quickly" in stderr or "rate limit" in stderr.lower():
            wait = 60 * (attempt + 1)
            print(f"  rate limited, waiting {wait}s")
            time.sleep(wait)
            continue
        raise RuntimeError(stderr)
    raise RuntimeError(f"still rate limited after retries: {stderr}")


def repo_and_category():
    data = gql(
        'query{repository(owner:"%s",name:"%s"){id discussionCategories(first:15){nodes{id name isAnswerable}}}}'
        % (OWNER, REPO)
    )
    repo = data["data"]["repository"]
    qna = next(c for c in repo["discussionCategories"]["nodes"] if c["isAnswerable"])
    return repo["id"], qna["id"]


def existing_threads():
    threads, cursor = {}, None
    while True:
        after = f', after:"{cursor}"' if cursor else ""
        data = gql(
            'query{repository(owner:"%s",name:"%s"){discussions(first:100%s){nodes{id title answer{id}} pageInfo{hasNextPage endCursor}}}}'
            % (OWNER, REPO, after)
        )
        d = data["data"]["repository"]["discussions"]
        for n in d["nodes"]:
            threads[n["title"]] = {"id": n["id"], "answered": n["answer"] is not None}
        if not d["pageInfo"]["hasNextPage"]:
            return threads
        cursor = d["pageInfo"]["endCursor"]


def intent_answer(intent):
    lines = []
    for v in intent["variants"]:
        lines.append(f"**{v['when']}** · {DANGER_LABEL[v['danger']]}")
        lines.append("")
        lines.append("```sh")
        lines.extend(c["c"] for c in v["cmds"])
        lines.append("```")
        for c in v["cmds"]:
            if c["n"]:
                lines.append(f"- {c['n']}")
        lines.append(f"- Undo: {v['undo']}")
        lines.append("")
    lines.append(f"Copy-ready version with one click: {SITE}#{intent['id']}")
    return "\n".join(lines)


def error_answer(err):
    lines = [f"**Why it happens:** {err['why']}", ""]
    if err.get("fix"):
        lines.append("```sh")
        lines.extend(c["c"] for c in err["fix"])
        lines.append("```")
        for c in err["fix"]:
            if c["n"]:
                lines.append(f"- {c['n']}")
        lines.append("")
    lines.append(f"Copy-ready version: {SITE}errors.html#{err['id']}")
    return "\n".join(lines)


def desired_threads():
    intents = json.loads((ROOT / "docs" / "data" / "intents.json").read_text(encoding="utf-8"))["intents"]
    errors = json.loads((ROOT / "docs" / "data" / "errors.json").read_text(encoding="utf-8"))["errors"]
    desired = []
    for i in intents:
        body = (
            "How do I do this in Git, and how safe is it?\n\n"
            "Answered below with every variant, its danger level, and its undo. "
            "Follow-ups welcome in the comments.\n\n"
            f"Live version: {SITE}#{i['id']}"
        )
        desired.append((i["q"], body, intent_answer(i)))
    for e in errors:
        if e.get("intent"):
            continue
        body = (
            "Git printed this error. What does it mean and what is the fix?\n\n"
            f"Answered below. Live version with copy buttons: {SITE}errors.html#{e['id']}"
        )
        desired.append((e["msg"], body, error_answer(e)))
    return desired


def answer_thread(disc_id, answer_md):
    comment = gql(
        "mutation($d:ID!,$b:String!){addDiscussionComment(input:{discussionId:$d,body:$b}){comment{id}}}",
        d=disc_id, b=answer_md,
    )
    time.sleep(SLEEP)
    gql(
        "mutation($i:ID!){markDiscussionCommentAsAnswer(input:{id:$i}){discussion{id}}}",
        i=comment["data"]["addDiscussionComment"]["comment"]["id"],
    )
    time.sleep(SLEEP)


def main():
    repo_id, category_id = repo_and_category()
    existing = existing_threads()
    desired = desired_threads()
    missing = [d for d in desired if d[0] not in existing]
    unanswered = [d for d in desired if d[0] in existing and not existing[d[0]]["answered"]]
    print(f"{len(desired)} desired, {len(existing)} exist, {len(missing)} to create, {len(unanswered)} to repair")

    for n, (title, body, answer_md) in enumerate(unanswered, 1):
        answer_thread(existing[title]["id"], answer_md)
        print(f"[repair {n}/{len(unanswered)}] {title}")

    for n, (title, body, answer_md) in enumerate(missing, 1):
        created = gql(
            "mutation($r:ID!,$c:ID!,$t:String!,$b:String!){createDiscussion(input:{repositoryId:$r,categoryId:$c,title:$t,body:$b}){discussion{id}}}",
            r=repo_id, c=category_id, t=title, b=body,
        )
        time.sleep(SLEEP)
        answer_thread(created["data"]["createDiscussion"]["discussion"]["id"], answer_md)
        print(f"[{n}/{len(missing)}] {title}")

    print("Discussions are in sync.")


if __name__ == "__main__":
    main()
