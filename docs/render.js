/*
  File: render.js
  Purpose: The one place that turns an answer into DOM: cards, badges, commands, copy buttons.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript, DOM built with createElement and textContent only
  Description: Shared by the finder and the rescue wizard so an answer looks identical everywhere. Also delegates clicks for static copy buttons rendered at build time.
  Date: 2026-08-07
*/

(function () {
  "use strict";

  var DANGER_LABEL = { safe: "Safe", history: "Rewrites history", destructive: "Destructive" };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function copyText(text, button) {
    var done = function () {
      button.textContent = "Copied";
      button.classList.add("done");
      setTimeout(function () { button.textContent = "Copy"; button.classList.remove("done"); }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done);
    } else {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    }
  }

  function copyButton(text) {
    var b = el("button", "copy", "Copy");
    b.setAttribute("aria-label", "Copy command");
    b.addEventListener("click", function () { copyText(text, b); });
    return b;
  }

  function renderIntent(intent, all, linkBase) {
    var base = linkBase || "";
    var card = el("article", "result");
    card.id = intent.id;

    var h = el("h2", null, intent.q);
    var a = el("a", "anchor", "#");
    a.href = base + "#" + intent.id;
    a.setAttribute("aria-label", "Link to this answer");
    h.appendChild(a);
    card.appendChild(h);

    intent.variants.forEach(function (v) {
      var box = el("div", "variant");
      var when = el("div", "when");
      when.appendChild(el("span", null, v.when));
      when.appendChild(el("span", "badge " + v.danger, DANGER_LABEL[v.danger]));
      box.appendChild(when);

      v.cmds.forEach(function (c) {
        var row = el("div", "cmd");
        row.appendChild(el("code", null, c.c));
        row.appendChild(copyButton(c.c));
        box.appendChild(row);
        if (c.n) box.appendChild(el("p", "note", c.n));
      });

      var undo = el("p", "undo");
      undo.appendChild(el("strong", null, "Undo: "));
      undo.appendChild(document.createTextNode(v.undo));
      box.appendChild(undo);

      card.appendChild(box);
    });

    if (all && intent.seealso && intent.seealso.length) {
      var sa = el("p", "seealso", "See also: ");
      var first = true;
      intent.seealso.forEach(function (id) {
        var ref = all.find(function (x) { return x.id === id; });
        if (!ref) return;
        if (!first) sa.appendChild(document.createTextNode(" · "));
        first = false;
        var link = el("a", null, ref.q);
        link.href = base + "#" + id;
        sa.appendChild(link);
      });
      card.appendChild(sa);
    }

    return card;
  }

  /* Copy buttons rendered at build time carry their command in data-cmd. */
  document.addEventListener("click", function (e) {
    var b = e.target;
    if (b.classList && b.classList.contains("copy") && b.hasAttribute("data-cmd")) {
      copyText(b.getAttribute("data-cmd"), b);
    }
  });

  window.GG = { el: el, copyButton: copyButton, renderIntent: renderIntent, DANGER_LABEL: DANGER_LABEL };
})();
