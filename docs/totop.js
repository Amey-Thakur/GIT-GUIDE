/*
  File: totop.js
  Purpose: A way back to the top of the very long pages.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript
  Description: The answer and error indexes run to hundreds of thousands of
               pixels. This adds one button, and only on pages long enough to
               need it. It appears after two screens of scrolling and returns
               focus to the top of the document so keyboard users land where
               sighted users do.
  Date: 2026-08-09
*/
(function () {
  "use strict";

  var LONG_ENOUGH = 4;   // screens; shorter pages do not need this at all

  function build() {
    if (document.documentElement.scrollHeight < window.innerHeight * LONG_ENOUGH) return;

    var b = document.createElement("button");
    b.type = "button";
    b.className = "totop";
    b.setAttribute("aria-label", "Back to the top of the page");
    b.title = "Back to top";
    b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
      'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';

    b.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
      // Send the keyboard back too, or the next Tab resumes halfway down.
      var first = document.querySelector("a.skip") || document.body;
      first.focus({ preventScroll: true });
    });
    document.body.appendChild(b);

    var showing = false;
    function update() {
      var past = window.scrollY > window.innerHeight * 2;
      if (past !== showing) {
        showing = past;
        b.classList.toggle("show", past);
      }
    }
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
