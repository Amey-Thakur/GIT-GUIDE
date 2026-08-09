# Assets

Single purpose: what the site loads and what it offers for download. Nothing
external is fetched at runtime.

## Source images

| File | Source | License |
| --- | --- | --- |
| git-logo.svg | [git-scm.com/downloads/logos](https://git-scm.com/downloads/logos), logo by Jason Long | CC BY 3.0 |
| amey.jpg | [Amey Thakur's GitHub avatar](https://github.com/Amey-Thakur) | Own likeness |

The Git logo is a trademark of the Git project, and appears here only to
identify the tool this guide documents. The GitHub mark is drawn inline in the
pages that use it rather than loaded as a file, so no copy of it is shipped.

## Generated, never edited by hand

Every file below is built from the data in `docs/data` and the sandbox in
`docs/play.js`, so none of them can claim a number the site does not have.
Editing one directly is pointless: the next build overwrites it.

| File | Built by |
| --- | --- |
| social-preview.png | `.github/scripts/build_images.py --render` |
| poster.png | `.github/scripts/build_images.py --render` |
| cheatsheet-card.png | `.github/scripts/build_images.py --render` |
| cheatsheet-card-2.png | `.github/scripts/build_images.py --render` |
| git-guide.pdf | `.github/scripts/build_booklet.py --render` |
| pdf-cover.png | `.github/scripts/build_booklet.py --render` |

The SVG sources for the four images live in `.github/assets` and are committed;
the PNGs here are what the site serves.
