/*
  File: app.js
  Purpose: The finder. Loads the intent data, searches it as you type, and renders copy-ready answers.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript, no dependencies, DOM built with createElement and textContent only
  Description: Client-side search over docs/data/intents.json with danger badges, per-command copy buttons, undo lines, and deep links. Also handles the theme toggle.
  Date: 2026-08-07
*/

(function () {
  "use strict";

  /* Theme */

  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem("theme"); } catch (e) { /* private mode */ }
  if (stored === "light" || stored === "dark") root.setAttribute("data-theme", stored);

  function currentTheme() {
    var t = root.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  var toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.textContent = currentTheme() === "dark" ? "Light" : "Dark";
    toggle.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      toggle.textContent = next === "dark" ? "Light" : "Dark";
      try { localStorage.setItem("theme", next); } catch (e) { /* private mode */ }
    });
  }

  /* Finder */

  var input = document.getElementById("q");
  if (!input) return;

  var resultsEl = document.getElementById("results");
  var indexEl = document.getElementById("all-questions");
  var DATA = null;

  fetch("data/intents.json")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      DATA = d.intents;
      renderIndex();
      var initial = decodeURIComponent(location.hash.replace("#", ""));
      if (initial) showById(initial);
    });

  function norm(s) { return s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim(); }

  function haystack(intent) {
    var parts = [intent.q, intent.id.replace(/-/g, " ")].concat(intent.aka);
    intent.variants.forEach(function (v) {
      v.cmds.forEach(function (c) { parts.push(c.c); });
    });
    return norm(parts.join(" | "));
  }

  function search(query) {
    var q = norm(query);
    if (!q) return [];
    var tokens = q.split(" ");
    var scored = [];
    DATA.forEach(function (intent) {
      var hs = haystack(intent);
      var title = norm(intent.q + " " + intent.aka.join(" "));
      var score = 0;
      if (title.indexOf(q) !== -1) score += 100;
      var hit = 0;
      tokens.forEach(function (t) { if (hs.indexOf(t) !== -1) hit += 1; });
      if (hit === tokens.length) score += 20 * hit;
      else score += 4 * hit;
      if (hit > 0) scored.push({ intent: intent, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, 8).map(function (s) { return s.intent; });
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function copyButton(text) {
    var b = el("button", "copy", "Copy");
    b.setAttribute("aria-label", "Copy command");
    b.addEventListener("click", function () {
      var done = function () {
        b.textContent = "Copied";
        b.classList.add("done");
        setTimeout(function () { b.textContent = "Copy"; b.classList.remove("done"); }, 1500);
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
    });
    return b;
  }

  var DANGER_LABEL = { safe: "Safe", history: "Rewrites history", destructive: "Destructive" };

  function renderIntent(intent) {
    var card = el("article", "result");
    card.id = intent.id;

    var h = el("h2", null, intent.q);
    var a = el("a", "anchor", "#");
    a.href = "#" + intent.id;
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
        var code = el("code", null, c.c);
        row.appendChild(code);
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

    if (intent.seealso && intent.seealso.length) {
      var sa = el("p", "seealso", "See also: ");
      intent.seealso.forEach(function (id, i) {
        var ref = DATA.find(function (x) { return x.id === id; });
        if (!ref) return;
        if (i > 0) sa.appendChild(document.createTextNode(" · "));
        var link = el("a", null, ref.q);
        link.href = "#" + id;
        sa.appendChild(link);
      });
      card.appendChild(sa);
    }

    return card;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function render(list, query) {
    clear(resultsEl);
    if (!list.length && query) {
      var empty = el("p", "empty");
      empty.appendChild(document.createTextNode("No answer for that yet. "));
      var ask = el("a", null, "Ask in Discussions");
      ask.href = "https://github.com/Amey-Thakur/GIT-GUIDE/discussions";
      empty.appendChild(ask);
      empty.appendChild(document.createTextNode(" and it will be added."));
      resultsEl.appendChild(empty);
      return;
    }
    list.forEach(function (intent) { resultsEl.appendChild(renderIntent(intent)); });
  }

  function showById(id) {
    var intent = DATA.find(function (x) { return x.id === id; });
    if (intent) {
      input.value = "";
      render([intent]);
      window.scrollTo({ top: 0 });
    }
  }

  function renderIndex() {
    if (!indexEl) return;
    clear(indexEl);
    var sorted = DATA.slice().sort(function (a, b) { return a.q.localeCompare(b.q); });
    sorted.forEach(function (intent) {
      var li = el("li");
      var a = el("a", null, intent.q);
      a.href = "#" + intent.id;
      li.appendChild(a);
      indexEl.appendChild(li);
    });
    var count = document.getElementById("count");
    if (count) count.textContent = String(DATA.length);
  }

  input.addEventListener("input", function () {
    if (!DATA) return;
    var q = input.value;
    if (!q.trim()) { clear(resultsEl); return; }
    render(search(q), q);
  });

  window.addEventListener("hashchange", function () {
    var id = decodeURIComponent(location.hash.replace("#", ""));
    if (id && DATA) showById(id);
  });

  document.querySelectorAll(".chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      input.value = chip.textContent;
      input.dispatchEvent(new Event("input"));
      input.focus();
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
})();
