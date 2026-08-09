/*
  File: answers.js
  Purpose: Narrow the statically rendered answer list, by words and by risk.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript
  Description: The answers on this page are rendered at build time so they work
               with no JavaScript at all. This only narrows what is shown. The
               danger filter works on individual commands rather than whole
               answers, because "show me everything here that can lose my work"
               is a real question and the answer is forty-odd commands, not the
               answers that happen to contain one.
  Date: 2026-08-09
*/
(function () {
  "use strict";

  var input = document.getElementById("af");
  var list = document.getElementById("answer-list");
  if (!input || !list) return;

  var LEVELS = [
    ["safe", "Safe"],
    ["history", "Rewrites history"],
    ["destructive", "Destructive"]
  ];

  var cards = Array.prototype.slice.call(list.querySelectorAll(".result"));
  var count = document.getElementById("acount");
  var blobs = cards.map(function (c) { return c.textContent.toLowerCase(); });

  /* Each answer holds one or more commands, and they do not share a risk. The
     level lives on the variant, so that is where the filter has to work. */
  var groups = cards.map(function (c) {
    return Array.prototype.slice.call(c.querySelectorAll(".variant")).map(function (v) {
      var b = v.querySelector(".badge");
      var lvl = "safe";
      LEVELS.forEach(function (l) { if (b && b.classList.contains(l[0])) lvl = l[0]; });
      return { el: v, lvl: lvl };
    });
  });

  var on = { safe: true, history: true, destructive: true };

  /* ------------------------------------------------------------ the controls */

  var bar = document.createElement("div");
  bar.className = "dangerbar";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Filter by what a command can cost you");

  var lead = document.createElement("span");
  lead.className = "dangerbar-lead";
  lead.textContent = "Show";
  bar.appendChild(lead);

  var chips = {};
  var nums = {};
  LEVELS.forEach(function (l) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "dchip lvl-" + l[0] + " on";
    b.setAttribute("aria-pressed", "true");
    b.appendChild(document.createTextNode(l[1]));
    var n = document.createElement("span");
    n.className = "dnum";
    b.appendChild(n);
    b.addEventListener("click", function () {
      // Turning the last one off would leave an empty page and no way to read
      // why, so the last one standing stays on.
      if (on[l[0]] && LEVELS.filter(function (x) { return on[x[0]]; }).length === 1) return;
      on[l[0]] = !on[l[0]];
      apply();
    });
    chips[l[0]] = b;
    nums[l[0]] = n;
    bar.appendChild(b);
  });

  var box = document.querySelector(".finder .searchbox");
  if (box && box.parentNode) box.parentNode.insertBefore(bar, box.nextSibling);

  /* An empty result has to say so; a blank page reads as a broken one. */
  var empty = document.createElement("p");
  empty.className = "nomatch";
  empty.hidden = true;
  list.appendChild(empty);

  /* --------------------------------------------------------------- filtering */

  function apply() {
    var q = input.value.trim().toLowerCase();
    var shown = 0;
    var tally = { safe: 0, history: 0, destructive: 0 };

    cards.forEach(function (c, i) {
      var words = !q || blobs[i].indexOf(q) !== -1;
      var live = 0;
      groups[i].forEach(function (v) {
        var keep = words && on[v.lvl];
        v.el.hidden = !keep;
        if (keep) live++;
        if (words) tally[v.lvl]++;
      });
      var hit = words && (live > 0 || !groups[i].length);
      c.hidden = !hit;
      if (hit) shown++;
    });

    LEVELS.forEach(function (l) {
      nums[l[0]].textContent = String(tally[l[0]]);
      chips[l[0]].classList.toggle("on", on[l[0]]);
      chips[l[0]].setAttribute("aria-pressed", on[l[0]] ? "true" : "false");
    });

    if (count) count.textContent = String(shown);
    empty.hidden = shown !== 0;
    if (!shown) {
      empty.innerHTML = q
        ? "No answer here matches <b>" + q.replace(/[<>&]/g, "") + "</b>." +
          ' Try fewer words, or ask it in your own language on <a href="./">the finder</a>.' +
          ' Genuinely missing? <a href="https://github.com/Amey-Thakur/GIT-GUIDE/discussions">Ask for it</a>.'
        : "Nothing at that level. Turn one of the others back on.";
    }
  }

  input.addEventListener("input", apply);
  apply();

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
})();
