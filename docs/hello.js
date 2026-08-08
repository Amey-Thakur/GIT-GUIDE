/*
  File: hello.js
  Purpose: The console greeting for developers who open the inspector.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript
  Description: A short, styled hello in the developer console: who built this, where the source lives, and an invitation to read it. Nothing else.
  Date: 2026-08-07
*/

(function () {
  "use strict";
  try {
    console.log(
      "%c Git Guide %c every Git and GitHub answer in one place",
      "background:#f05133;color:#fff;font-weight:700;padding:2px 6px;border-radius:3px",
      "color:inherit;font-weight:600"
    );
    console.log(
      "Built by Amey Thakur · github.com/Amey-Thakur/GIT-GUIDE\n" +
      "Plain HTML, CSS, and vanilla JS. No frameworks, no trackers, no build step.\n" +
      "Curious how something works? Read the source; every file does one thing."
    );
  } catch (e) { /* consoles that object change nothing */ }
})();
