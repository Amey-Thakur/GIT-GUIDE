/*
  File: setup.js
  Purpose: Show each visitor the commands for their own operating system.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript
  Description: The system chips filter every OS-labeled command row. Rows without an OS label always show; Debian, Ubuntu, and Fedora count as Linux. All systems restores everything.
  Date: 2026-08-08
*/

(function () {
  "use strict";

  var chips = document.querySelectorAll(".chip.os");
  if (!chips.length) return;

  var LINUX = ["Debian", "Ubuntu", "Fedora", "Linux"];

  function matches(label, os) {
    if (os === "All" || !label) return true;
    if (os === "Linux") return LINUX.some(function (w) { return label.indexOf(w) !== -1; });
    return label.indexOf(os) !== -1;
  }

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      chips.forEach(function (c) { c.classList.toggle("active", c === chip); });
      var os = chip.getAttribute("data-os");
      document.querySelectorAll(".chapter .cmd").forEach(function (row) {
        var label = row.querySelector(".oslabel");
        row.style.display = matches(label ? label.textContent : "", os) ? "" : "none";
      });
    });
  });
})();
