# Contributing

Single purpose: how to make Git Guide better.

## The fastest contribution

[Ask a question in Discussions](https://github.com/Amey-Thakur/GIT-GUIDE/discussions). A question the guide cannot answer is a defect report and decides what gets added next. Pasting the exact error text counts double.

## Fixing or adding an answer

All knowledge lives in four JSON files under [docs/data](../docs/data); the pages render from them. Edit the data, never the generated HTML.

1. Match the shape of the neighboring entries: `id` in kebab-case, plain-language `q`, honest `aka` synonyms, and for every variant a `danger` level and an `undo` (or the statement that none exists).
2. Run the gates locally: `python .github/scripts/validate.py` and `python .github/scripts/build_pages.py`. CI runs the same two and fails on a dangling reference, a dead link, or a page that disagrees with its data.
3. Open a pull request with the why in its description.

## House style

**Every answer carries its danger level and its undo.** Safe, rewrites history, or destructive, and the way back from each. Where no undo exists, say so. This is the rule the guide exists for.

**State the risk before the command, not after it.** Someone copying the first thing they see should already have been warned.

**Current Git.** `switch` and `restore` before `checkout`. `--force-with-lease` rather than plain `--force`.

**Nothing loads from another server.** No CDN, no web font, no analytics. Zero external requests is what lets the guide work offline and behind a corporate proxy, and a single script tag would end that.

**Plain language, kept short.** Answers are read by someone who is stuck. Lead with the fix.
