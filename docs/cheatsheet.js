/*
  File: cheatsheet.js
  Purpose: Filter the cheatsheet as the user types; hide sections that empty out.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript
  Description: Matches the filter text against each command row. Sections with no visible rows disappear, and so does the jump row while filtering. Copy buttons are handled by render.js delegation.
  Date: 2026-08-07
*/

(function () {
  "use strict";

  var input = document.getElementById("cf");
  if (!input) return;

  var sections = Array.prototype.slice.call(document.querySelectorAll(".cs-section"));
  var toc = document.querySelector(".cs-toc");

  /* Hiding every section left the page empty and unexplained. */
  var empty = document.createElement("p");
  empty.className = "nomatch";
  empty.hidden = true;
  if (sections.length && sections[0].parentNode) {
    sections[sections.length - 1].parentNode.appendChild(empty);
  }

  input.addEventListener("input", function () {
    var q = input.value.toLowerCase().trim();
    if (toc) toc.style.display = q ? "none" : "";
    var shown = 0;
    sections.forEach(function (section) {
      var any = false;
      section.querySelectorAll(".cs-row").forEach(function (row) {
        var show = !q || row.textContent.toLowerCase().indexOf(q) !== -1;
        row.style.display = show ? "" : "none";
        if (show) { any = true; shown++; }
      });
      section.style.display = any ? "" : "none";
    });
    empty.hidden = shown !== 0;
    if (!shown) {
      empty.innerHTML = "No command here matches <b>" + q.replace(/[<>&]/g, "") + "</b>." +
        ' The sheet is the everyday set; <a href="answers.html">every answer</a> is the complete one.';
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
})();
