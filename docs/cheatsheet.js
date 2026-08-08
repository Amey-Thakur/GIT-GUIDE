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

  input.addEventListener("input", function () {
    var q = input.value.toLowerCase().trim();
    if (toc) toc.style.display = q ? "none" : "";
    sections.forEach(function (section) {
      var any = false;
      section.querySelectorAll(".cs-row").forEach(function (row) {
        var show = !q || row.textContent.toLowerCase().indexOf(q) !== -1;
        row.style.display = show ? "" : "none";
        if (show) any = true;
      });
      section.style.display = any ? "" : "none";
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
})();
