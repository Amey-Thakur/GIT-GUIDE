/*
  File: notfound.js
  Purpose: Turn the 404 from a dead end into the search it should have been.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript
  Description: Names the path that failed, guesses the page when the name is a
               near miss, recognises an answer id typed as a path, and searches
               all thousand answers without leaving the page. Somebody who
               followed a broken link usually wants an answer, not a homepage.
  Date: 2026-08-09
*/
(function () {
  "use strict";

  /* This page renders at whatever depth the broken link had, and the site is
     served from /GIT-GUIDE/ in production and from the root when it is being
     worked on. Derive the base rather than assuming either. */
  var m = location.pathname.match(/^(.*?\/GIT-GUIDE\/)/);
  var BASE = m ? m[1] : "/";
  var path = document.getElementById("nf-path");
  var guess = document.getElementById("nf-guess");
  var input = document.getElementById("nf-q");
  var out = document.getElementById("nf-out");
  if (!path) return;

  var PAGES = [
    ["", "Finder"], ["setup.html", "Start"], ["learn.html", "Learn"],
    ["play.html", "Practise"], ["fix.html", "Fix"], ["errors.html", "Errors"],
    ["github.html", "GitHub"], ["workflows.html", "Workflows"],
    ["cheatsheet.html", "Cheatsheet"], ["answers.html", "Every answer"]
  ];

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Distance between two words, the same measure the sandbox uses to name a typo.
  function near(a, b) {
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /* ------------------------------------------------------- what was asked for */

  var asked = location.pathname + location.search;
  path.textContent = asked;

  var segment = location.pathname.replace(/\/+$/, "").split("/").pop() || "";
  var bare = segment.replace(/\.html?$/i, "").toLowerCase();

  function suggest(html) {
    if (!guess || !html) return;
    guess.innerHTML = html;
    guess.hidden = false;
  }

  var hit = null, best = 99;
  PAGES.forEach(function (p) {
    var name = (p[0].replace(/\.html$/, "") || "index").toLowerCase();
    var d = Math.min(near(bare, name), near(bare, p[1].toLowerCase()));
    if (d < best) { best = d; hit = p; }
  });
  if (bare && hit && best <= Math.max(2, Math.floor(bare.length / 3))) {
    suggest('Did you mean <a href="' + BASE + hit[0] + '">' + esc(hit[1]) + "</a>?");
  }

  /* --------------------------------------------------------------- the search */

  /* Both halves of the guide, because somebody who followed a broken link is as
     likely to have been chasing an error message as a question. */
  var DATA = null;

  function load() {
    if (DATA) return Promise.resolve(DATA);
    return Promise.all([
      fetch(BASE + "data/intents.json").then(function (r) { return r.json(); }),
      fetch(BASE + "data/errors.json").then(function (r) { return r.json(); })
    ]).then(function (both) {
      DATA = both[0].intents.map(function (it) {
        return {
          id: it.id, label: it.q, href: BASE + "#" + it.id, kind: "",
          hay: (it.q + " " + it.id.replace(/-/g, " ") + " " + it.aka.join(" ")).toLowerCase()
        };
      }).concat(both[1].errors.map(function (e) {
        return {
          id: e.id, label: e.msg, href: BASE + "errors.html#" + e.id, kind: "error",
          hay: (e.msg + " " + e.id.replace(/-/g, " ") + " " + (e.why || "")).toLowerCase()
        };
      }));
      return DATA;
    }).catch(function () { DATA = []; return DATA; });
  }

  function show(list, q) {
    out.innerHTML = "";
    if (!q) return;
    if (!list.length) {
      out.innerHTML = '<p class="nf-none">Nothing matches <b>' + esc(q) + "</b> yet. " +
        '<a href="https://github.com/Amey-Thakur/GIT-GUIDE/discussions">Ask for it</a> ' +
        "and it will be added.</p>";
      return;
    }
    var ul = document.createElement("ul");
    ul.className = "nf-hits";
    list.forEach(function (it) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = it.href;
      a.textContent = it.label;
      li.appendChild(a);
      if (it.kind) {
        var tag = document.createElement("span");
        tag.className = "nf-kind";
        tag.textContent = it.kind;
        li.appendChild(tag);
      }
      ul.appendChild(li);
    });
    out.appendChild(ul);
  }

  function search() {
    var q = input.value.trim().toLowerCase();
    if (!q) { out.innerHTML = ""; return; }
    load().then(function (all) {
      var words = q.split(/\s+/);
      // Every word, then any word, so a phrase that is almost right still lands.
      var strict = all.filter(function (it) {
        return words.every(function (w) { return it.hay.indexOf(w) !== -1; });
      });
      var loose = strict.length ? [] : all.filter(function (it) {
        return words.some(function (w) { return w.length > 2 && it.hay.indexOf(w) !== -1; });
      });
      show(strict.concat(loose).slice(0, 7), q);
    });
  }

  if (input) {
    input.addEventListener("input", search);
    input.focus({ preventScroll: true });
  }

  /* An answer id typed as a path is a link somebody built by hand, and the
     answer they wanted does exist. Send them straight to it. */
  if (bare) {
    load().then(function (all) {
      var exact = all.filter(function (it) { return it.id === bare; })[0];
      if (exact) {
        suggest('That one exists: <a href="' + exact.href + '">' + esc(exact.label) +
          "</a>. Answers live behind a <b>#</b>, not a slash.");
        return;
      }
      if (!input || input.value) return;
      input.value = bare.replace(/-/g, " ");
      search();
    });
  }
})();
