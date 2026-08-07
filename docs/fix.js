/*
  File: fix.js
  Purpose: Drive the rescue triage: ask, branch, and land on the exact answer.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript
  Description: Walks the decision tree in data/scenarios.json. Choices build a breadcrumb you can step back through; leaves render the full answer card from intents.json via render.js.
  Date: 2026-08-07
*/

(function () {
  "use strict";

  var wizard = document.getElementById("wizard");
  if (!wizard) return;

  var GG = window.GG;
  var crumbsEl = document.getElementById("crumbs");
  var TREE = null;
  var INTENTS = null;
  var path = [];

  Promise.all([
    fetch("data/scenarios.json").then(function (r) { return r.json(); }),
    fetch("data/intents.json").then(function (r) { return r.json(); })
  ]).then(function (loaded) {
    TREE = loaded[0];
    INTENTS = loaded[1].intents;
    show(TREE.start);
  });

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function renderCrumbs() {
    clear(crumbsEl);
    if (!path.length) return;
    var start = GG.el("button", "crumb", "Start over");
    start.addEventListener("click", function () { path = []; show(TREE.start); });
    crumbsEl.appendChild(start);
    path.forEach(function (step, i) {
      crumbsEl.appendChild(GG.el("span", "crumb-sep", "›"));
      var b = GG.el("button", "crumb", step.label);
      b.addEventListener("click", function () {
        path = path.slice(0, i);
        show(i === 0 ? TREE.start : path[i - 1].to);
      });
      crumbsEl.appendChild(b);
    });
  }

  function show(nodeId) {
    renderCrumbs();
    clear(wizard);
    var node = TREE.nodes[nodeId];
    wizard.appendChild(GG.el("h2", "wizard-q", node.q));
    var opts = GG.el("div", "wizard-opts");
    node.opts.forEach(function (opt) {
      var b = GG.el("button", "wizard-opt", opt.label);
      b.addEventListener("click", function () {
        if (opt.next) {
          path.push({ label: opt.label, to: opt.next });
          show(opt.next);
        } else {
          path.push({ label: opt.label, to: null });
          leaf(opt.leaf);
        }
      });
      opts.appendChild(b);
    });
    wizard.appendChild(opts);
  }

  function leaf(intentId) {
    renderCrumbs();
    clear(wizard);
    var intent = INTENTS.find(function (x) { return x.id === intentId; });
    wizard.appendChild(GG.renderIntent(intent, INTENTS, "index.html"));
    var again = GG.el("button", "wizard-opt restart", "Start over");
    again.addEventListener("click", function () { path = []; show(TREE.start); });
    wizard.appendChild(again);
  }
})();
