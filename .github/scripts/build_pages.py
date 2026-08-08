"""
File: build_pages.py
Purpose: Render data JSON into static HTML so search engines index every entry.
Author: Amey Thakur
GitHub: https://github.com/Amey-Thakur
Tech: Python 3 standard library only
Description: Renders errors.json into docs/errors.html and cheatsheet.json into docs/cheatsheet.html, between marker comments. CI runs this and fails on drift, so pages can never fall out of sync with their data.
Date: 2026-08-07
"""

import json
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
START, END = "<!-- errors:start -->", "<!-- errors:end -->"
CS_START, CS_END = "<!-- cheatsheet:start -->", "<!-- cheatsheet:end -->"


def replace_block(page, start, end, body):
    html = page.read_text(encoding="utf-8")
    head, rest = html.split(start)
    _, tail = rest.split(end)
    page.write_text(head + start + "\n" + body + "\n" + end + tail, encoding="utf-8", newline="\n")


def error_card(err, intents):
    out = [f'<article class="result errcard" id="{escape(err["id"])}">']
    out.append(
        f'  <h2><code class="errmsg">{escape(err["msg"])}</code>'
        f'<a class="anchor" href="#{escape(err["id"])}" aria-label="Link to this error">#</a></h2>'
    )
    out.append(f'  <p class="note">{escape(err["why"])}</p>')
    if err.get("intent"):
        ref = intents[err["intent"]]
        out.append(
            f'  <p class="seealso">Full answer with danger level and undo: '
            f'<a href="index.html#{escape(err["intent"])}">{escape(ref)}</a></p>'
        )
    else:
        for c in err.get("fix", []):
            out.append(
                f'  <div class="cmd"><code>{escape(c["c"])}</code>'
                f'<button class="copy" data-cmd="{escape(c["c"], quote=True)}" aria-label="Copy command">Copy</button></div>'
            )
            if c.get("n"):
                out.append(f'  <p class="note">{escape(c["n"])}</p>')
        for ref_id in err.get("seealso", []):
            if ref_id in intents:
                out.append(
                    f'  <p class="seealso">See also: <a href="index.html#{escape(ref_id)}">{escape(intents[ref_id])}</a></p>'
                )
    out.append("</article>")
    return "\n".join(out)


def slug(title):
    return "".join(c if c.isalnum() else "-" for c in title.lower()).strip("-").replace("--", "-")


def cheatsheet_toc(sections):
    links = "".join(f'<a href="#{slug(s["title"])}">{escape(s["title"])}</a>' for s in sections)
    return f'<nav class="cs-toc" aria-label="Sections">{links}</nav>'


def cheatsheet_section(sec):
    out = ['<section class="cs-section">']
    out.append(f'  <h2 id="{slug(sec["title"])}">{escape(sec["title"])}</h2>')
    if sec.get("note"):
        out.append(f'  <p class="note">{escape(sec["note"])}</p>')
    out.append('  <div class="cs-rows">')
    for item in sec["items"]:
        danger = " cs-danger" if item.get("danger") else ""
        out.append(f'    <div class="cs-row{danger}">')
        out.append(f"      <code>{escape(item['c'])}</code>")
        out.append(f"      <span>{escape(item['d'])}</span>")
        out.append(
            f'      <button class="copy" data-cmd="{escape(item["c"], quote=True)}" aria-label="Copy command">Copy</button>'
        )
        out.append("    </div>")
    out.append("  </div>")
    out.append("</section>")
    return "\n".join(out)


def main():
    errors = json.loads((DOCS / "data" / "errors.json").read_text(encoding="utf-8"))["errors"]
    intents = {
        i["id"]: i["q"]
        for i in json.loads((DOCS / "data" / "intents.json").read_text(encoding="utf-8"))["intents"]
    }
    replace_block(DOCS / "errors.html", START, END, "\n".join(error_card(e, intents) for e in errors))
    print(f"errors.html: {len(errors)} errors rendered")

    sheet = json.loads((DOCS / "data" / "cheatsheet.json").read_text(encoding="utf-8"))["sections"]
    cs_body = cheatsheet_toc(sheet) + "\n" + "\n".join(cheatsheet_section(s) for s in sheet)
    replace_block(DOCS / "cheatsheet.html", CS_START, CS_END, cs_body)
    total = sum(len(s["items"]) for s in sheet)
    print(f"cheatsheet.html: {len(sheet)} sections, {total} commands rendered")


if __name__ == "__main__":
    main()
