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

  /* The clipboard can refuse: an insecure context, a locked-down browser, a
     window that has lost focus. The old code assumed it never would, so a denied
     copy left a button that appeared to do nothing and an unhandled rejection in
     the console. Now it falls back, and if even that fails it selects the command
     and says which keys to press, which is the honest answer. */
  function copyText(text, button) {
    var reset = function () {
      button.textContent = "Copy";
      button.classList.remove("done", "warn");
    };
    var done = function () {
      button.textContent = "Copied";
      button.classList.add("done");
      setTimeout(reset, 1500);
    };
    var manual = function () {
      var code = button.parentNode && button.parentNode.querySelector("code");
      if (code && window.getSelection && document.createRange) {
        var range = document.createRange();
        range.selectNodeContents(code);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      button.textContent = "Ctrl C";
      button.classList.add("warn");
      setTimeout(reset, 2500);
    };

    function legacy() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:-9999px;";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        if (legacy()) done(); else manual();
      });
      return;
    }
    if (legacy()) done(); else manual();
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
