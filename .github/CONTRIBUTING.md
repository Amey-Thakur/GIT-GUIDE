# Contributing

Single purpose: how to make Git Guide better.

## The fastest contribution

[Ask a question in Discussions](https://github.com/Amey-Thakur/GIT-GUIDE/discussions). A question the guide cannot answer is a defect report and decides what gets added next. Pasting the exact error text counts double.

## Fixing or adding an answer

All knowledge lives in four JSON files under [docs/data](../docs/data); the pages render from them. Edit the data, never the generated HTML.

1. Match the shape of the neighboring entries: `id` in kebab-case, plain-language `q`, honest `aka` synonyms, and for every variant a `danger` level and an `undo` (or the statement that none exists).
2. Run the gates locally: `python .github/scripts/validate.py` and `python .github/scripts/build_pages.py`. CI runs the same two and fails on any drift, dangling reference, or em dash.
3. Open a pull request with the why in its description.

## House style

Formal, precise, spacious. No em dashes, no filler; every word earns its place. Commands are current Git: `switch` and `restore` first, `--force-with-lease` never plain force. Advice must be safe: destructive commands state their escape route before the command, not after.
