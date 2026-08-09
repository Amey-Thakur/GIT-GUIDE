/*
  File: keys.js
  Purpose: Keyboard shortcuts, so the guide is fast for people who live in one.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript
  Description: GitHub's own g-then-key convention, because this guide's readers
               already have it in their fingers. / focuses search, ? lists every
               shortcut, t returns to the top, Escape backs out. Nothing fires
               while you are typing, and nothing fires with a modifier held, so
               browser and screen-reader shortcuts are never stolen.
  Date: 2026-08-09
*/
(function () {
  "use strict";

  var BASE = location.pathname.replace(/[^/]*$/, "");

  var GO = [
    ["h", "index.html", "Finder"],
    ["s", "setup.html", "Start"],
    ["l", "learn.html", "Learn"],
    ["p", "play.html", "Practise"],
    ["f", "fix.html", "Fix"],
    ["e", "errors.html", "Errors"],
    ["g", "github.html", "GitHub"],
    ["w", "workflows.html", "Workflows"],
    ["c", "cheatsheet.html", "Cheatsheet"],
    ["a", "answers.html", "Every answer"]
  ];

  function typing(e) {
    var t = e.target;
    if (!t) return false;
    var tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
  }

  function searchBox() {
    return document.getElementById("q") || document.getElementById("ef") ||
           document.getElementById("af") || document.getElementById("cf");
  }

  /* ------------------------------------------------------------- the sheet */

  var sheet = null;

  function rows() {
    var out = "";
    GO.forEach(function (g) {
      out += '<div><kbd>g</kbd> <kbd>' + g[0] + "</kbd><span>" + g[2] + "</span></div>";
    });
    return out;
  }

  function toggleSheet(force) {
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.className = "keys";
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-modal", "true");
      sheet.setAttribute("aria-label", "Keyboard shortcuts");
      sheet.innerHTML =
        '<div class="keys-card">' +
          '<div class="keys-head"><h2>Keyboard shortcuts</h2>' +
          '<button type="button" class="keys-x" aria-label="Close">Close</button></div>' +
          '<div class="keys-cols">' +
            '<div><h3>Go to</h3><div class="keys-grid">' + rows() + "</div></div>" +
            '<div><h3>On any page</h3><div class="keys-grid">' +
              "<div><kbd>/</kbd><span>Jump to the search box</span></div>" +
              "<div><kbd>t</kbd><span>Back to the top</span></div>" +
              "<div><kbd>?</kbd><span>This list</span></div>" +
              "<div><kbd>Esc</kbd><span>Clear the search, or close this</span></div>" +
            "</div>" +
            '<h3>Where they apply</h3><p class="keys-note">Shortcuts stay out of the way while you are typing, ' +
            "and never fire with Ctrl, Alt or Cmd held.</p></div>" +
          "</div>" +
        "</div>";
      document.body.appendChild(sheet);
      sheet.addEventListener("click", function (e) {
        if (e.target === sheet || e.target.classList.contains("keys-x")) toggleSheet(false);
      });
    }
    var show = force === undefined ? !sheet.classList.contains("show") : force;
    sheet.classList.toggle("show", show);
    if (show) sheet.querySelector(".keys-x").focus();
  }

  /* ---------------------------------------------------------------- keys */

  var awaitingGo = false;
  var goTimer = null;

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === "Escape") {
      if (sheet && sheet.classList.contains("show")) { toggleSheet(false); return; }
      var box = searchBox();
      if (box && document.activeElement === box && box.value) {
        box.value = "";
        box.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }

    if (typing(e)) return;

    // g, then a second key: the convention GitHub taught everyone.
    if (awaitingGo) {
      awaitingGo = false;
      window.clearTimeout(goTimer);
      var hit = GO.filter(function (g) { return g[0] === e.key.toLowerCase(); })[0];
      if (hit) {
        e.preventDefault();
        location.href = BASE + hit[1];
      }
      return;
    }

    if (e.key === "g") {
      awaitingGo = true;
      // A lone g should not arm the sequence forever.
      goTimer = window.setTimeout(function () { awaitingGo = false; }, 1200);
      return;
    }

    if (e.key === "?") { e.preventDefault(); toggleSheet(); return; }

    if (e.key === "t") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (e.key === "/") {
      var s = searchBox();
      if (s) { e.preventDefault(); s.focus(); s.select(); }
    }
  });
})();
