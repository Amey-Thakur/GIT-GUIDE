/*
  File: check.js
  Purpose: Tell you what a Git command does, how much it can cost, and how to take it back, before you run it.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript
  Description: Builds an index of every command in intents.json, matches what the user pastes against it by longest option prefix, and reports the danger level with the undo. The safety verdict is data, never a guess: it comes from the same danger and undo fields the answers carry.
  Date: 2026-08-08
*/

(function () {
  "use strict";

  var input = document.getElementById("cmdcheck");
  if (!input) return;

  var out = document.getElementById("cmdverdict");
  var GG = window.GG;
  var INDEX = [];

  var LABEL = { safe: "Safe", history: "Rewrites history", destructive: "Can lose work" };
  var MEANING = {
    safe: "Nothing is lost. Anything it changes can be changed back.",
    history: "Commits change identity. Fine on your own work, disruptive on a branch others share.",
    destructive: "Git may keep no copy afterwards. Read the undo before you run it."
  };

  fetch("data/intents.json")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      d.intents.forEach(function (i) {
        i.variants.forEach(function (v) {
          v.cmds.forEach(function (c) {
            INDEX.push({
              cmd: c.c, note: c.n, danger: v.danger, undo: v.undo,
              when: v.when, id: i.id, q: i.q, tokens: tokenize(c.c),
              // A danger level describes a whole recipe. When the recipe is one
              // command, the level is unambiguously about that command; when it
              // is five, the level belongs to the worst of them. Pasting
              // git fetch must not inherit the warning from the hard reset that
              // followed it on somebody else's card.
              solo: v.cmds.length === 1,
              words: (i.q + " " + i.aka.join(" ")).toLowerCase()
            });
          });
        });
      });
      INDEX.sort(function (a, b) { return b.tokens.length - a.tokens.length; });
    });

  /* A command reduced to its meaningful words: the program, the subcommand, and
     its flags. Case is folded on words but never on flags, because in Git the
     case is the whole difference: -d refuses to delete an unmerged branch and
     -D deletes it anyway. Lowercasing both made this checker answer "Safe" to
     git branch -D, which is exactly the mistake it exists to prevent. */
  function tokenize(s) {
    return s
      .replace(/["']/g, " ")
      .split(/\s*(?:&&|\|\||;|\|)\s*/)[0]
      .split(/\s+/)
      .filter(function (t) { return t && t.indexOf("<") === -1 && t !== "sudo"; })
      .map(function (t) { return t.charAt(0) === "-" ? t : t.toLowerCase(); });
  }

  function isFlag(t) { return t.charAt(0) === "-"; }

  // The subcommand must match, then flags decide. An entry that demands flags the
  // user did not type is a worse answer than one that matches the flags they did.
  function score(typed, e) {
    if (e.tokens.length < 2 || e.tokens[0] !== typed[0]) return -1;
    if (e.tokens[1] !== typed[1]) return -1;
    var tf = typed.filter(isFlag), ef = e.tokens.filter(isFlag);
    var shared = 0, i;
    for (i = 0; i < ef.length; i++) if (tf.indexOf(ef[i]) !== -1) shared++;
    var extra = ef.length - shared;
    var missing = 0;
    for (i = 0; i < tf.length; i++) if (ef.indexOf(tf[i]) === -1) missing++;
    var s = 100 + shared * 20 - extra * 15 - missing * 5;
    // Prefer the answer that is actually about this command.
    if (e.words.indexOf(typed[1]) !== -1) s += 8;
    if (e.solo) s += 12;
    return s;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function verdict(text) {
    clear(out);
    var typed = tokenize(text);
    if (typed.length < 2) return;

    if (typed[0] !== "git" && typed[0] !== "gh") {
      out.appendChild(GG.el("p", "cv-none", "This checker knows git and gh commands. Paste one of those."));
      return;
    }

    var best = null, bestScore = 0;
    INDEX.forEach(function (e) {
      var sc = score(typed, e);
      if (sc > bestScore) { bestScore = sc; best = e; }
    });

    if (!best) {
      out.appendChild(GG.el("p", "cv-none", "No exact match yet. Search for it below and the answer will carry its danger level and undo."));
      return;
    }

    var card = GG.el("div", "cv cv-" + best.danger);
    var head = GG.el("div", "cv-head");
    head.appendChild(GG.el("span", "cv-badge", LABEL[best.danger]));
    head.appendChild(GG.el("code", "cv-cmd", best.cmd));
    card.appendChild(head);

    /* Answering about a command with different flags, without saying so, is how
       a checker becomes worse than no checker. A flag can be the whole risk, and
       so can a subcommand: stash drop and stash branch share nothing but a word. */
    var entryFlags = best.tokens.filter(isFlag);
    var off = typed.filter(isFlag).filter(function (t) { return entryFlags.indexOf(t) === -1; });

    // A bare word in third place is a subcommand. Anything with a slash, a tilde
    // or a digit is an argument, and arguments are expected to differ.
    function subcommand(tokens) {
      var w = tokens.slice(2).filter(function (t) { return !isFlag(t) && /^[a-z][a-z-]*$/.test(t); })[0];
      return w || null;
    }
    var mine = subcommand(typed), theirs = subcommand(best.tokens);
    if (mine && theirs && mine !== theirs) off.push(mine);

    if (off.length) {
      card.appendChild(GG.el("p", "cv-approx",
        "Closest match, not an exact one. You typed " + off.join(", ") +
        ", which this answer does not cover, and in Git one word can be the whole difference."));
    }

    card.appendChild(GG.el("p", "cv-what", best.note));
    card.appendChild(GG.el("p", "cv-mean", MEANING[best.danger]));

    var undo = GG.el("div", "cv-undo");
    undo.appendChild(GG.el("span", "cv-undo-label", "Undo"));
    undo.appendChild(GG.el("code", null, best.undo));
    card.appendChild(undo);

    var more = GG.el("a", "cv-more", "Read the full answer: " + best.q);
    more.href = "#" + best.id;
    more.addEventListener("click", function () {
      var q = document.getElementById("q");
      if (q) { q.value = best.q; q.dispatchEvent(new Event("input", { bubbles: true })); }
    });
    card.appendChild(more);

    out.appendChild(card);
  }

  var timer = null;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () { verdict(input.value); }, 120);
  });

  document.querySelectorAll(".cv-example").forEach(function (b) {
    b.addEventListener("click", function () {
      input.value = b.textContent;
      verdict(input.value);
      input.focus();
    });
  });
})();
