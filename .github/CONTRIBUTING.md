# Contributing

Single purpose: how to make Git Guide better.

## The fastest contribution

[Ask a question in Discussions](https://github.com/Amey-Thakur/GIT-GUIDE/discussions). A question the guide cannot answer is a defect report and decides what gets added next. Pasting the exact error text counts double.

## Fixing or adding an answer

All knowledge lives in four JSON files under [docs/data](../docs/data); the pages render from them. Edit the data, never the generated HTML.

1. Match the shape of the neighboring entries: `id` in kebab-case, plain-language `q`, honest `aka` synonyms, and for every variant a `danger` level and an `undo` (or the statement that none exists).
2. Run the gates locally: `python .github/scripts/validate.py` and `python .github/scripts/build_pages.py`. CI runs the same two and fails on a dangling reference, a dead link or anchor, an em dash, a stray control character, or a page that disagrees with its data.
3. Open a pull request with the why in its description.

## House style

Seven rules. The first four are about the words, the last three are the ones people get wrong.

**Write it tight.** Every word earns its place. If a sentence survives having a clause removed, remove it.

**No em dashes.** CI fails on them. Use a colon, a full stop, or a comma.

**Six ideas is a list, not a paragraph.** If prose starts enumerating, make it a list. A wall of correct facts is still a wall.

**Current Git.** `switch` and `restore` before `checkout`. `--force-with-lease`, never plain `--force`.

**Danger before the command, never after.** Every variant carries a `danger` level and an `undo`. Where no undo exists, say so plainly. This rule is the reason the guide exists.

**Colour means something.** Green is safe or done, amber is consequential but reversible, red is work you can lose, the Git orange is the brand and "you are here", grey is context. Never colour anything for decoration.

**Nothing loads from another server.** No CDN, no web font, no analytics. Zero external requests is what makes the guide work offline and behind a corporate proxy, and one convenient script tag breaks all of it.

## Two things that will catch you out

**Bump the cache version.** Change `style.css` or any `*.js` and bump its `?v=` in every page that loads it. GitHub Pages caches for ten minutes, so without it you will test your own fix against the old file and conclude it did not work.

**Commit messages are exactly `Git`.** Every commit in this repository, no exceptions. It is deliberate, and history is uniform because of it.
