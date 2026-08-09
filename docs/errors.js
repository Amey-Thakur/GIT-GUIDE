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

  /* Filtering to nothing used to leave a blank page with no explanation, which
     reads as a broken site rather than an empty result. */
  var empty = document.createElement("p");
  empty.className = "nomatch";
  empty.hidden = true;
  var list = document.getElementById("error-list");
  if (list) list.appendChild(empty);

  input.addEventListener("input", function () {
    var q = input.value.toLowerCase().trim();
    var shown = 0;
    cards.forEach(function (card) {
      var hit = !q || card.textContent.toLowerCase().indexOf(q) !== -1;
      card.style.display = hit ? "" : "none";
      if (hit) shown++;
    });
    if (count) count.textContent = String(shown);
    empty.hidden = shown !== 0;
    if (!shown) {
      empty.innerHTML = "Nothing here matches <b>" + q.replace(/[<>&]/g, "") + "</b>." +
        " Paste more of the message, or fewer words of it." +
        ' Still nothing? <a href="https://github.com/Amey-Thakur/GIT-GUIDE/discussions">Post the error</a>' +
        " and it will be added.";
    }
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
