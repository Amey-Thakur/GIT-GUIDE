/*
  File: app.js
  Purpose: The finder. Searches every answer and every known error message as you type.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript, no dependencies
  Description: Loads intents.json and errors.json, ranks matches for plain-language questions and pasted error text, and renders copy-ready answers through render.js. Handles chips, deep links, and the / shortcut.
  Date: 2026-08-07
*/

(function () {
  "use strict";

  var input = document.getElementById("q");
  if (!input) return;

  var GG = window.GG;
  var resultsEl = document.getElementById("results");
  var indexEl = document.getElementById("all-questions");
  var DATA = null;
  var ERRORS = [];

  Promise.all([
    fetch("data/intents.json").then(function (r) { return r.json(); }),
    fetch("data/errors.json").then(function (r) { return r.json(); })
  ]).then(function (loaded) {
    DATA = loaded[0].intents;
    ERRORS = loaded[1].errors;
    renderIndex();
    var statA = document.getElementById("stat-a");
    var statE = document.getElementById("stat-e");
    if (statA) statA.textContent = String(DATA.length);
    if (statE) statE.textContent = String(ERRORS.length);
    var initial = decodeURIComponent(location.hash.replace("#", ""));
    if (initial) showById(initial);
  });

  /* The depth showcase: one click, one expert answer most people have never met. */
  var EXPERT = ["worktrees", "rerere", "bisect", "fixup-autosquash", "range-diff", "git-bundle", "sparse-checkout", "blame-ignore-revs", "rebase-exec", "stash-branch", "two-github-accounts", "patches-email", "recover-dropped-stash", "add-patch"];
  var lucky = document.getElementById("lucky");
  if (lucky) {
    lucky.addEventListener("click", function () {
      if (!DATA) return;
      location.hash = EXPERT[Math.floor(Math.random() * EXPERT.length)];
    });
  }

  function norm(s) { return s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim(); }

  function intentHaystack(intent) {
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
      var hs = intentHaystack(intent);
      var title = norm(intent.q + " " + intent.aka.join(" "));
      var score = 0;
      if (title.indexOf(q) !== -1) score += 100;
      var hit = 0;
      tokens.forEach(function (t) { if (hs.indexOf(t) !== -1) hit += 1; });
      if (hit === tokens.length) score += 20 * hit;
      else score += 4 * hit;
      if (hit > 0) scored.push({ kind: "intent", item: intent, score: score });
    });

    ERRORS.forEach(function (err) {
      var hs = norm(err.msg + " " + err.why);
      var score = 0;
      if (norm(err.msg).indexOf(q) !== -1) score += 140;
      var hit = 0;
      tokens.forEach(function (t) { if (hs.indexOf(t) !== -1) hit += 1; });
      if (hit === tokens.length) score += 18 * hit;
      else score += 3 * hit;
      if (hit > 0) scored.push({ kind: "error", item: err, score: score });
    });

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, 8);
  }

  function renderError(err) {
    var card = GG.el("article", "result errcard");
    var h = GG.el("h2", null, "");
    var code = GG.el("code", "errmsg", err.msg);
    h.appendChild(code);
    card.appendChild(h);
    card.appendChild(GG.el("p", "note", err.why));
    if (err.intent) {
      var ref = DATA.find(function (x) { return x.id === err.intent; });
      if (ref) {
        var p = GG.el("p", "seealso", "Full answer: ");
        var link = GG.el("a", null, ref.q);
        link.href = "#" + ref.id;
        p.appendChild(link);
        card.appendChild(p);
      }
    } else {
      (err.fix || []).forEach(function (c) {
        var row = GG.el("div", "cmd");
        row.appendChild(GG.el("code", null, c.c));
        row.appendChild(GG.copyButton(c.c));
        card.appendChild(row);
        if (c.n) card.appendChild(GG.el("p", "note", c.n));
      });
      var more = GG.el("p", "seealso", "");
      var a = GG.el("a", null, "Every Git error, decoded");
      a.href = "errors.html#" + err.id;
      more.appendChild(a);
      card.appendChild(more);
    }
    return card;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function render(list, query) {
    clear(resultsEl);
    if (!list.length && query) {
      var empty = GG.el("p", "empty");
      empty.appendChild(document.createTextNode("No answer for that yet. "));
      var ask = GG.el("a", null, "Ask in Discussions");
      ask.href = "https://github.com/Amey-Thakur/GIT-GUIDE/discussions";
      empty.appendChild(ask);
      empty.appendChild(document.createTextNode(" and it will be added."));
      resultsEl.appendChild(empty);
      return;
    }
    list.forEach(function (r) {
      resultsEl.appendChild(r.kind === "error" ? renderError(r.item) : GG.renderIntent(r.item, DATA));
    });
  }

  function showById(id) {
    var intent = DATA.find(function (x) { return x.id === id; });
    if (intent) {
      input.value = "";
      clear(resultsEl);
      resultsEl.appendChild(GG.renderIntent(intent, DATA));
      window.scrollTo({ top: 0 });
    }
  }

  function renderIndex() {
    if (!indexEl) return;
    clear(indexEl);
    var sorted = DATA.slice().sort(function (a, b) { return a.q.localeCompare(b.q); });
    sorted.forEach(function (intent) {
      var li = GG.el("li");
      var a = GG.el("a", null, intent.q);
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
