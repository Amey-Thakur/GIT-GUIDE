/*
  File: undo.js
  Purpose: The four ways to undo, from one starting point, side by side.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript, inline SVG
  Description: revert, reset --soft, reset --hard and restore are the four
               answers to "undo that", and choosing between them is the question
               people get wrong. The difference is not what they are called, it
               is what each one leaves behind: history, your files, and whether
               anyone else can safely pull afterwards. Same graph every time,
               redrawn for whichever one you pick.
  Date: 2026-08-09
*/
(function () {
  "use strict";

  var svg = document.getElementById("undo-svg");
  var picker = document.getElementById("undo-picker");
  if (!svg || !picker) return;

  var NS = "http://www.w3.org/2000/svg";

  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  /* The starting point, and it never changes. Three commits, main on the last
     one, and one uncommitted edit sitting in the working tree. Every answer
     below is a different thing to do about that. */
  var BASE = [
    { id: "a1b2c3d", msg: "Add the parser" },
    { id: "e4f5a6b", msg: "Handle empty input" },
    { id: "9c8d7e6", msg: "Cover the off-by-one" }
  ];

  var OPTS = [
    {
      key: "revert",
      cmd: "git revert HEAD",
      danger: "safe",
      dangerText: "safe",
      tip: 3,
      ghost: [],
      extra: { id: "f0a1b2c", msg: "Revert the off-by-one" },
      history: "Grows. The commit you regret is still there, and a new commit on top " +
        "undoes what it did.",
      files: "Back to how they were before that commit, recorded as a change like any other.",
      shared: "The only one of the four you can use on a branch other people have already " +
        "pulled. Nothing they have moves.",
      back: "Run it again. A revert of a revert puts the change back.",
      when: "Something is already pushed, or anyone else could have it."
    },
    {
      key: "soft",
      cmd: "git reset --soft HEAD~1",
      danger: "history",
      dangerText: "rewrites history",
      tip: 1,
      ghost: [2],
      extra: null,
      history: "Shrinks. The branch stops pointing at the last commit, and nothing else " +
        "points at it either.",
      files: "Untouched, and the changes are still staged, ready to be committed again.",
      shared: "No. Anyone who pulled that commit still has it, and your history no longer " +
        "matches theirs.",
      back: "git reset --hard <hash> from git reflog. The commit is faded, not gone.",
      when: "The commit was fine but the message was wrong, or you want to fold it into " +
        "the next one."
    },
    {
      key: "hard",
      cmd: "git reset --hard HEAD~1",
      danger: "destructive",
      dangerText: "destructive",
      tip: 1,
      ghost: [2],
      extra: null,
      history: "Shrinks, exactly as the soft reset does. The commit is unreferenced, not " +
        "deleted.",
      files: "Wiped back to the earlier commit. The committed work is recoverable. Anything " +
        "uncommitted at the time is not.",
      shared: "No, for the same reason as the soft reset, and with more to lose.",
      back: "git reset --hard <hash> from git reflog, for the committed part. There is no " +
        "way back for uncommitted work.",
      when: "You want the commit and its changes gone from where you are standing."
    },
    {
      key: "restore",
      cmd: "git restore src/parser.js",
      danger: "destructive",
      dangerText: "destructive",
      tip: 2,
      ghost: [],
      extra: null,
      history: "Untouched. Not one commit moves, and the graph is exactly as it was.",
      files: "One file goes back to its last committed state. Your edit to it is gone.",
      shared: "Nothing is published, so nobody else is affected at all.",
      back: "None. The edit was never committed, so Git never had a copy of it and the " +
        "reflog cannot help.",
      when: "You edited a file, have not committed, and want that file back."
    }
  ];

  var X0 = 130, GAP = 175, Y = 118;

  function commitNode(x, msg, id, ghost) {
    var g = el("g", { class: "pnode" + (ghost ? " ghost" : "") });
    g.appendChild(el("circle", { cx: x, cy: Y, r: 19 }));
    var h = el("text", { x: x, y: Y + 5, "text-anchor": "middle", class: "phash" });
    h.textContent = id.slice(0, 4);
    g.appendChild(h);
    var m = el("text", { x: x, y: Y + 44, "text-anchor": "middle", class: "pmsg" });
    m.textContent = msg;
    g.appendChild(m);
    return g;
  }

  function label(x, y, text, cls) {
    var w = Math.max(48, text.length * 8.4 + 18);
    var g = el("g", { class: cls });
    g.appendChild(el("rect", { x: x - w / 2, y: y - 16, width: w, height: 26, rx: 6 }));
    var t = el("text", { x: x, y: y + 2, "text-anchor": "middle" });
    t.textContent = text;
    g.appendChild(t);
    return g;
  }

  function draw(o) {
    var rows = BASE.slice();
    if (o.extra) rows.push(o.extra);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var w = X0 * 2 + (rows.length - 1) * GAP;
    svg.setAttribute("viewBox", "0 0 " + w + " 200");

    rows.forEach(function (c, i) {
      if (i === 0) return;
      var ghost = o.ghost.indexOf(i) !== -1;
      svg.appendChild(el("line", {
        x1: X0 + (i - 1) * GAP + 20, y1: Y, x2: X0 + i * GAP - 20, y2: Y,
        class: "pedge" + (ghost ? " ghost" : "")
      }));
    });

    rows.forEach(function (c, i) {
      svg.appendChild(commitNode(X0 + i * GAP, c.msg, c.id, o.ghost.indexOf(i) !== -1));
    });

    var tx = X0 + o.tip * GAP;
    svg.appendChild(label(tx, Y - 40, "main", "pbranch on"));
    svg.appendChild(label(tx, Y - 70, "HEAD", "phead"));
  }

  function set(i) {
    var o = OPTS[i];
    draw(o);

    [].forEach.call(picker.children, function (b, n) {
      b.classList.toggle("active", n === i);
      b.setAttribute("aria-pressed", n === i ? "true" : "false");
    });

    document.getElementById("undo-cmd").textContent = o.cmd;
    var badge = document.getElementById("undo-badge");
    badge.className = "badge " + o.danger;
    badge.textContent = o.dangerText;
    document.getElementById("undo-when").textContent = o.when;
    document.getElementById("undo-history").textContent = o.history;
    document.getElementById("undo-files").textContent = o.files;
    document.getElementById("undo-shared").textContent = o.shared;
    document.getElementById("undo-back").textContent = o.back;
  }

  OPTS.forEach(function (o, i) {
    // The chip carries its danger level before you click it, so the choice is
    // already coloured by what it costs.
    var b = document.createElement("button");
    b.type = "button";
    b.className = "chip undo-chip lvl-" + o.danger;
    b.textContent = o.cmd;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", function () { set(i); });
    picker.appendChild(b);
  });

  set(0);
})();
