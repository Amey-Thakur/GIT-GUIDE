# Assets

Single purpose: what the site loads and what it offers for download. Nothing
external is fetched at runtime.

## Source images

| File | Source | License |
| --- | --- | --- |
| [git-logo.svg](git-logo.svg) | [git-scm.com/downloads/logos](https://git-scm.com/downloads/logos), logo by Jason Long | CC BY 3.0 |
| [amey.jpg](amey.jpg) | [Amey Thakur's GitHub avatar](https://github.com/Amey-Thakur) | Own likeness |

The Git logo is a trademark of the Git project, and appears here only to
identify the tool this guide documents. The GitHub mark is drawn inline in the
pages that use it rather than loaded as a file, so no copy of it is shipped.

## Generated, never edited by hand

Every file below is built from the data in [docs/data](../data) and the sandbox
in [docs/play.js](../play.js), so none of them can claim a number the site does
not have. Editing one directly is pointless: the next build overwrites it.

| File | Built by |
| --- | --- |
| [social-preview.png](social-preview.png) | [build_images.py](../../.github/scripts/build_images.py) `--render` |
| [poster.png](poster.png) | [build_images.py](../../.github/scripts/build_images.py) `--render` |
| [cheatsheet-card.png](cheatsheet-card.png) | [build_images.py](../../.github/scripts/build_images.py) `--render` |
| [cheatsheet-card-2.png](cheatsheet-card-2.png) | [build_images.py](../../.github/scripts/build_images.py) `--render` |
| [git-guide.pdf](git-guide.pdf) | [build_booklet.py](../../.github/scripts/build_booklet.py) `--render` |
| [pdf-cover.png](pdf-cover.png) | [build_booklet.py](../../.github/scripts/build_booklet.py) `--render` |

The SVG sources for the four images live in
[.github/assets](../../.github/assets) and are committed; the PNGs here are what
the site serves.

Colour on the cards and in the PDF comes from one shared rule,
[danger.py](../../.github/scripts/danger.py), which
[validate.py](../../.github/scripts/validate.py) also enforces against the
answers. A command cannot be graded one way on the site and another on the wall.
