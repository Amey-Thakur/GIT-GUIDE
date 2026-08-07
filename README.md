<div align="center">

<a href="https://amey-thakur.github.io/GIT-GUIDE/"><img src="docs/assets/git-logo.svg" alt="Open Git Guide" width="72"></a>

# Git Guide

**Every Git and GitHub answer in one place.**

Type what you want to do. Get the exact commands, what each one does,
how dangerous it is, and how to undo it.

**[Open the guide](https://amey-thakur.github.io/GIT-GUIDE/)**

</div>

## Why this exists

Four of the ten highest-voted questions on all of Stack Overflow are Git questions. The top thirty alone have been read about 180 million times. People do not struggle to find Git tutorials; they struggle to find the right command at the moment they need it, and to know whether running it is safe.

This guide answers that. Every entry states when it applies, carries a danger level, and ships with its own undo.

| Danger level | Meaning |
| --- | --- |
| Safe | Changes nothing you cannot get back |
| Rewrites history | Coordinate before doing this to shared branches |
| Destructive | Can lose work permanently, the note tells you the escape route first |

## How to use it

1. Open [the guide](https://amey-thakur.github.io/GIT-GUIDE/).
2. Type what you want to do in plain language: `undo the last commit`, `delete a branch`, `gitignore not working`.
3. Copy the command with one click. Press `/` to jump to the search box.

No account, no ads, no tracking, no framework. The site makes zero external requests, so it loads instantly and keeps working offline and behind restrictive corporate networks.

## What makes it different

- **An undo for every command.** Where no undo exists, it says so before you run the command, not after.
- **Current Git, not 2015 Git.** `git switch` and `git restore` first, `git checkout` noted for recognition. `--force-with-lease` instead of `--force`.
- **Written from use, not from other tutorials.** Variants match real situations: not pushed, already pushed, teammates have it.
- **Readable by machines too.** The whole knowledge base is plain JSON, served raw, with an [llms.txt](docs/llms.txt) map for AI agents. Build on it: [intents.json](docs/data/intents.json).

## Ask for an answer

If the finder cannot answer your question, [ask in Discussions](https://github.com/Amey-Thakur/GIT-GUIDE/discussions). Real questions decide what gets added next.

## Author

<img src="docs/assets/amey.jpg" alt="Amey Thakur" width="56" align="left" style="border-radius:8px">

**[Amey Thakur](https://github.com/Amey-Thakur)** · Everything in this guide is the Git I actually use. It is written the way I wish someone had shown me: the command, the risk, the way back.

<br clear="left">

## License

[MIT](LICENSE). The Git logo is by Jason Long (CC BY 3.0); Git and the GitHub mark are trademarks of their owners, used here only to identify the tools this guide documents.
