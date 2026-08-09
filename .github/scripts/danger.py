"""
File: danger.py
Purpose: One definition of what a command can cost you, shared by everything that says so.
Author: Amey Thakur
GitHub: https://github.com/Amey-Thakur
Tech: Python 3 standard library
Description: The site, the cheat cards, the poster and the PDF all state a danger level. They used to decide it separately, which is how a card ends up showing two colours under a key that promises three. This module is the single source: validate.py enforces it against intents.json, and the image and booklet builders colour by it.
Date: 2026-08-09
"""

import re

SAFE, HISTORY, DESTRUCTIVE = "safe", "history", "destructive"
RANK = {SAFE: 0, HISTORY: 1, DESTRUCTIVE: 2}

# Work can be gone afterwards, and no reflog brings back what was never committed.
DESTRUCTIVE_CMD = [
    r"reset\s+--hard",
    r"\bclean\s+-[a-zA-Z]*f",
    r"checkout\s+--\s",
    r"\brestore\s+(?!--staged)[^-]",
    r"push[^|]*--force(?!-with-lease|-if-includes)",
    r"branch\s+-D\b",
    r"stash\s+(drop|clear)",
    r"reflog\s+expire",
    r"\bgc\s+--prune",
    r"filter-branch",
    r"filter-repo",
    r"\brm\s+-rf",
    r"update-ref\s+-d",
    r"push\s[^|]*--delete",
]

# Commits change identity. Nothing is lost, and anyone who already pulled is now
# out of step with you.
REWRITES_CMD = [
    r"commit\s+--amend",
    r"commit\s+--fixup",
    r"\brebase\b(?!\s+--abort)",
    r"--force-with-lease",
    r"tag\s+-f\b",
]
# Deliberately absent: git switch --orphan. It starts a branch with no parent
# and rewrites nothing. What follows it usually does, and the recipes that do
# are already caught by their rm -rf or their force push.


def level(cmd):
    """The worst thing this one command can do.

    A soft or mixed reset is deliberately not in the rewrite list: it moves a
    branch pointer and keeps every change, which is why the guide has always
    called it safe. Only --hard reaches your files.

    Setting a preference runs nothing, so a git config line that merely mentions
    rebase or force is safe.
    """
    if "git config" in cmd:
        return SAFE
    for pattern in DESTRUCTIVE_CMD:
        if re.search(pattern, cmd):
            return DESTRUCTIVE
    for pattern in REWRITES_CMD:
        if re.search(pattern, cmd):
            return HISTORY
    return SAFE


def worst(cmds):
    """The level for a recipe, which is the level of the worst line in it."""
    out = SAFE
    for cmd in cmds:
        found = level(cmd)
        if RANK[found] > RANK[out]:
            out = found
    return out
