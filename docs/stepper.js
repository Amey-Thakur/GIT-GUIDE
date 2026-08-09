/*
  File: stepper.js
  Purpose: The shared engine behind every step-through diagram on the site.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript
  Description: A config names the SVG elements each step reveals and highlights, plus the command and caption to show. Wires Previous, Next, clickable dots, and arrow keys for the first diagram on the page.
  Date: 2026-08-07
*/

(function () {
  "use strict";

  var first = null;

  var SVGNS = "http://www.w3.org/2000/svg";

  /* An SVG shape drawn with fill="none" has no interior to hit, so clicking
     inside a zone box landed on the bare canvas and nothing happened. Give each
     clickable group a transparent rectangle over its own bounds, and make it
     reachable from the keyboard while we are here. */
  function makeClickable(g, label, onPick) {
    if (!g || g.dataset.hit) return;
    var b;
    try { b = g.getBBox(); } catch (err) { return; }
    if (!b.width || !b.height) return;
    var pad = 8;
    var r = document.createElementNS(SVGNS, "rect");
    r.setAttribute("x", b.x - pad);
    r.setAttribute("y", b.y - pad);
    r.setAttribute("width", b.width + pad * 2);
    r.setAttribute("height", b.height + pad * 2);
    r.setAttribute("fill", "transparent");
    r.setAttribute("class", "hitarea");
    g.insertBefore(r, g.firstChild);
    g.dataset.hit = "1";

    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    if (label) g.setAttribute("aria-label", label);
    g.addEventListener("click", onPick);
    g.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); }
    });
  }

  window.GGMakeClickable = makeClickable;



  /* A diagram that only teaches while you are looking at it has taught you very
     little. This turns the walkthrough into the sequence itself, drawn from the
     steps so it cannot describe something the diagram did not show. Steps whose
     "command" is really a caption, like (edit files), are left out. */
  function buildRecipe(cfg, after) {
    var real = [];
    (cfg.steps || []).forEach(function (st) {
      var c = (st.cmd || "").trim();
      if (!c || c.charAt(0) === "(") return;
      // Strip the parenthetical asides used for context in a caption.
      c = c.replace(/\s*\([^)]*\)\s*$/, "").trim();
      if (c && real.indexOf(c) === -1) real.push(c);
    });
    if (real.length < 2 || !after || !after.parentNode) return;

    var box = document.createElement("details");
    box.className = "recipe";

    var sum = document.createElement("summary");
    sum.textContent = "The commands this diagram covers";
    box.appendChild(sum);

    var p = document.createElement("p");
    p.className = "recipe-note";
    p.textContent = "In the order the diagram walks them. Every one carries its danger level and its undo in the finder.";
    box.appendChild(p);

    var pre = document.createElement("pre");
    pre.className = "recipe-code";
    var code = document.createElement("code");
    code.textContent = real.join(String.fromCharCode(10));
    pre.appendChild(code);
    box.appendChild(pre);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy recipe-copy";
    btn.textContent = "Copy all";
    btn.setAttribute("data-cmd", real.join(String.fromCharCode(10)));
    box.appendChild(btn);

    after.parentNode.insertBefore(box, after.nextSibling);
  }

  function initStepper(cfg) {
    var i = 0;
    var api = null;
    var prev = document.getElementById(cfg.prefix + "-prev");
    var next = document.getElementById(cfg.prefix + "-next");
    var dots = document.getElementById(cfg.prefix + "-dots");
    var cmd = document.getElementById(cfg.prefix + "-cmd");
    var text = document.getElementById(cfg.prefix + "-text");
    if (!prev) return;

    cfg.steps.forEach(function (_, n) {
      var d = document.createElement("span");
      d.className = "stepdot";
      d.addEventListener("click", function () { i = n; apply(); });
      dots.appendChild(d);
    });

    function apply() {
      var step = cfg.steps[i];
      var show = step.show || [];
      (cfg.reveals || []).forEach(function (id) {
        var e = document.getElementById(id);
        if (e) e.classList.toggle("shown", show.indexOf(id) !== -1);
      });
      var container = prev.closest(".wrap");
      container.querySelectorAll(".on").forEach(function (e) { e.classList.remove("on"); });
      (step.on || []).forEach(function (id) {
        var e = document.getElementById(id);
        if (e) e.classList.add("on");
      });
      cmd.textContent = step.cmd;
      // The same three levels the rest of the guide uses, so a command shown in
      // a diagram is coloured exactly like the same command in an answer card.
      // Unmarked steps are safe, and safe reads green everywhere on this site.
      cmd.className = "danger-" + (step.danger || "safe");
      text.textContent = step.text;
      prev.disabled = i === 0;
      next.disabled = i === cfg.steps.length - 1;
      Array.prototype.forEach.call(dots.children, function (d, n) {
        d.classList.toggle("active", n === i);
      });
    }

    buildRecipe(cfg, prev.closest(".stepfoot") || prev.parentNode);

    prev.addEventListener("click", function () { if (i > 0) { i -= 1; apply(); } });
    next.addEventListener("click", function () { if (i < cfg.steps.length - 1) { i += 1; apply(); } });
    apply();
    api = { goto: function (n) { if (n >= 0 && n < cfg.steps.length) { i = n; apply(); } } };

    if (!first) {
      first = cfg.prefix;
      document.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        var active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
        var btn = document.getElementById(e.key === "ArrowRight" ? first + "-next" : first + "-prev");
        if (btn && !btn.disabled) btn.click();
      });
    }
    return api;
  }

  window.GGStepper = initStepper;
})();
