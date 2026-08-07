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

  function initStepper(cfg) {
    var i = 0;
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
      text.textContent = step.text;
      prev.disabled = i === 0;
      next.disabled = i === cfg.steps.length - 1;
      Array.prototype.forEach.call(dots.children, function (d, n) {
        d.classList.toggle("active", n === i);
      });
    }

    prev.addEventListener("click", function () { if (i > 0) { i -= 1; apply(); } });
    next.addEventListener("click", function () { if (i < cfg.steps.length - 1) { i += 1; apply(); } });
    apply();

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
  }

  window.GGStepper = initStepper;
})();
