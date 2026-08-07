"""
File: sync_discussions.py
Purpose: Mirror every answer from the site into GitHub Discussions as an answered Q&A thread.
Author: Amey Thakur
GitHub: https://github.com/Amey-Thakur
Tech: Python 3 standard library plus the gh CLI (GraphQL API)
Description: Reads docs/data/intents.json, creates one Q&A discussion per intent (question as title, formatted answer as a comment marked as the answer), skips titles that already exist, and throttles requests to respect rate limits. Safe to re-run any time new intents are added.
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
SLEEP = 1.2

DANGER_LABEL = {"safe": "Safe", "history": "Rewrites history", "destructive": "Destructive"}


def gql(query, **variables):
    cmd = ["gh", "api", "graphql", "-f", f"query={query}"]
    for k, v in variables.items():
        cmd += ["-f", f"{k}={v}"]
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip())
    return json.loads(out.stdout)


def repo_and_category():
    data = gql(
        'query{repository(owner:"%s",name:"%s"){id discussionCategories(first:15){nodes{id name isAnswerable}}}}'
        % (OWNER, REPO)
    )
    repo = data["data"]["repository"]
    qna = next(c for c in repo["discussionCategories"]["nodes"] if c["isAnswerable"])
    return repo["id"], qna["id"]


def existing_titles():
    titles, cursor = set(), None
    while True:
        after = f', after:"{cursor}"' if cursor else ""
        data = gql(
            'query{repository(owner:"%s",name:"%s"){discussions(first:100%s){nodes{title} pageInfo{hasNextPage endCursor}}}}'
            % (OWNER, REPO, after)
        )
        d = data["data"]["repository"]["discussions"]
        titles.update(n["title"] for n in d["nodes"])
        if not d["pageInfo"]["hasNextPage"]:
            return titles
        cursor = d["pageInfo"]["endCursor"]


def answer_body(intent):
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


def seed_errors(repo_id, category_id, done):
    errors = json.loads((ROOT / "docs" / "data" / "errors.json").read_text(encoding="utf-8"))["errors"]
    todo = [e for e in errors if not e.get("intent") and e["msg"] not in done]
    print(f"{len(errors)} errors, {len(todo)} error discussions to create")
    for n, e in enumerate(todo, 1):
        body = (
            "Git printed this error. What does it mean and what is the fix?\n\n"
            f"Answered below. Live version with copy buttons: {SITE}errors.html#{e['id']}"
        )
        created = gql(
            "mutation($r:ID!,$c:ID!,$t:String!,$b:String!){createDiscussion(input:{repositoryId:$r,categoryId:$c,title:$t,body:$b}){discussion{id}}}",
            r=repo_id, c=category_id, t=e["msg"], b=body,
        )
        disc_id = created["data"]["createDiscussion"]["discussion"]["id"]
        time.sleep(SLEEP)
        comment = gql(
            "mutation($d:ID!,$b:String!){addDiscussionComment(input:{discussionId:$d,body:$b}){comment{id}}}",
            d=disc_id, b=error_answer(e),
        )
        comment_id = comment["data"]["addDiscussionComment"]["comment"]["id"]
        time.sleep(SLEEP)
        gql("mutation($i:ID!){markDiscussionCommentAsAnswer(input:{id:$i}){discussion{id}}}", i=comment_id)
        time.sleep(SLEEP)
        print(f"[{n}/{len(todo)}] {e['msg']}")


def main():
    intents = json.loads((ROOT / "docs" / "data" / "intents.json").read_text(encoding="utf-8"))["intents"]
    repo_id, category_id = repo_and_category()
    done = existing_titles()
    todo = [i for i in intents if i["q"] not in done]
    print(f"{len(intents)} intents, {len(done)} discussions exist, {len(todo)} to create")
    for n, intent in enumerate(todo, 1):
        body = (
            f"How do I do this in Git, and how safe is it?\n\n"
            f"Answered below with every variant, its danger level, and its undo. "
            f"Follow-ups welcome in the comments.\n\n"
            f"Live version: {SITE}#{intent['id']}"
        )
        created = gql(
            "mutation($r:ID!,$c:ID!,$t:String!,$b:String!){createDiscussion(input:{repositoryId:$r,categoryId:$c,title:$t,body:$b}){discussion{id}}}",
            r=repo_id, c=category_id, t=intent["q"], b=body,
        )
        disc_id = created["data"]["createDiscussion"]["discussion"]["id"]
        time.sleep(SLEEP)
        comment = gql(
            "mutation($d:ID!,$b:String!){addDiscussionComment(input:{discussionId:$d,body:$b}){comment{id}}}",
            d=disc_id, b=answer_body(intent),
        )
        comment_id = comment["data"]["addDiscussionComment"]["comment"]["id"]
        time.sleep(SLEEP)
        gql("mutation($i:ID!){markDiscussionCommentAsAnswer(input:{id:$i}){discussion{id}}}", i=comment_id)
        time.sleep(SLEEP)
        print(f"[{n}/{len(todo)}] {intent['q']}")
    seed_errors(repo_id, category_id, done)
    print("Discussions are in sync.")


if __name__ == "__main__":
    main()
