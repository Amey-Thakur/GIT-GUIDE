/*
  File: answers.js
  Purpose: Filter the statically rendered answer list.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript
  Description: The answers on this page are rendered at build time so they work
               with no JavaScript at all. This only narrows what is shown, and
               fills in the live count.
  Date: 2026-08-09
*/
(function () {
  "use strict";

  var input = document.getElementById("af");
  var list = document.getElementById("answer-list");
  if (!input || !list) return;

  var cards = Array.prototype.slice.call(list.querySelectorAll(".result"));
  var count = document.getElementById("acount");
  if (count) count.textContent = String(cards.length);

  var blobs = cards.map(function (c) { return c.textContent.toLowerCase(); });

  input.addEventListener("input", function () {
    var q = input.value.trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (c, i) {
      var hit = !q || blobs[i].indexOf(q) !== -1;
      c.hidden = !hit;
      if (hit) shown++;
    });
    if (count) count.textContent = String(shown);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
})();
