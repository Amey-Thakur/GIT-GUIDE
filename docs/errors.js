/*
  File: errors.js
  Purpose: Filter the static error list as the user types or pastes an error.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript
  Description: Hides error cards whose text does not contain the filter string. The content itself is static HTML rendered at build time; copy buttons are handled by render.js delegation.
  Date: 2026-08-07
*/

(function () {
  "use strict";

  var input = document.getElementById("ef");
  if (!input) return;

  var cards = Array.prototype.slice.call(document.querySelectorAll("#error-list .errcard"));

  var count = document.getElementById("ecount");
  if (count) count.textContent = String(cards.length);

  input.addEventListener("input", function () {
    var q = input.value.toLowerCase().trim();
    cards.forEach(function (card) {
      card.style.display = !q || card.textContent.toLowerCase().indexOf(q) !== -1 ? "" : "none";
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
})();
