/*
  File: learn.js
  Purpose: The step definitions for the two diagrams on the Learn page.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript, driven by stepper.js
  Description: Diagram one walks the four places code lives and what each command moves. Diagram two builds the commit graph: branches as pointers, merge, rebase, and HEAD.
  Date: 2026-08-07
*/

(function () {
  "use strict";

  var D1 = {
    prefix: "d1",
    reveals: ["g-reset", "g-stash"],
    steps: [
      { on: ["z-wt"], cmd: "(edit files)", text: "Everything begins in the working tree: the ordinary files and folders you edit. Git watches, but nothing is recorded yet." },
      { on: ["a-add", "z-stage"], cmd: "git add <file>", text: "add copies a change into the staging area, the draft of your next commit. You choose exactly what goes in; the rest waits." },
      { on: ["a-commit", "z-local"], cmd: "git commit", text: "commit seals the staged draft into a permanent snapshot inside your local repository. Still only on your machine, and that is fine." },
      { on: ["a-push", "z-remote"], cmd: "git push", text: "push uploads your new commits to the remote: GitHub, GitLab, Azure DevOps, any of them. Now others can see your work." },
      { on: ["a-fetch", "z-local"], cmd: "git fetch", text: "fetch downloads their commits into your local repository and stops there. Your branches and files have not moved; you can look before touching anything." },
      { on: ["a-merge", "z-wt"], cmd: "git merge  (git pull = fetch + merge)", text: "merge brings the fetched commits into your branch and updates your files. pull does fetch and merge in one step." },
      { on: ["a-restore", "z-wt"], cmd: "git restore <file>", text: "restore copies the recorded version back over your file: the everyday undo for edits you regret." },
      { on: ["z-wt"], show: ["g-stash"], cmd: "git stash", text: "stash slides your uncommitted work onto a local shelf and hands you a clean tree. git stash pop brings it back. The shelf never leaves your machine." },
      { on: ["z-local"], show: ["g-reset"], cmd: "git reset", text: "reset moves the branch pointer itself to an older commit. Nothing is deleted at first; commits stop being part of the branch. This is where history is un-happened, so it gets danger badges." }
    ]
  };

  var BASE = ["b-c1", "b-c2", "b-c3", "b-e12", "b-e23"];
  var D2 = {
    prefix: "d2",
    reveals: BASE.concat(["b-main", "b-feat3", "b-c4", "b-e34", "b-feat4", "b-c5", "b-e35", "b-main5", "b-m", "b-e5m", "b-e4m", "b-mainm", "b-c4p", "b-e5c4p", "b-featp", "b-head"]),
    steps: [
      { show: BASE, on: ["b-c1", "b-c2", "b-c3"], cmd: "git commit", text: "A commit is a full snapshot of your project, linked to the one before it. The chain of snapshots is the history." },
      { show: BASE.concat(["b-main"]), on: ["b-main"], cmd: "git branch --show-current", text: "A branch is not a copy of anything. It is a movable label pointing at one commit. That is the whole secret." },
      { show: BASE.concat(["b-main", "b-feat3"]), on: ["b-feat3"], cmd: "git switch -c feature", text: "Creating a branch creates one more label on the same commit. Instant, free, nothing is copied." },
      { show: BASE.concat(["b-main", "b-c4", "b-e34", "b-feat4"]), on: ["b-c4", "b-feat4"], cmd: "git commit  (on feature)", text: "Committing on feature adds a snapshot and slides the feature label forward. main has not moved." },
      { show: BASE.concat(["b-main5", "b-c4", "b-e34", "b-feat4", "b-c5", "b-e35"]), on: ["b-c5", "b-main5"], cmd: "git commit  (on main)", text: "Meanwhile main gains its own commit. The lines have split: this is divergence, and it is normal." },
      { show: BASE.concat(["b-c4", "b-e34", "b-feat4", "b-c5", "b-e35", "b-m", "b-e5m", "b-e4m", "b-mainm"]), on: ["b-m", "b-mainm"], cmd: "git merge feature", text: "A merge commit has two parents and joins the lines. History shows exactly what happened. Always safe on shared branches." },
      { show: BASE.concat(["b-c4", "b-e34", "b-c5", "b-e35", "b-main5", "b-c4p", "b-e5c4p", "b-featp"]), on: ["b-c4p", "b-featp"], cmd: "git rebase main  (on feature)", text: "Rebase instead replays your commit on top of main as a new commit, c4 prime. The line is straight, but history was rewritten, which is why rebase is for unshared work." },
      { show: BASE.concat(["b-main", "b-head"]), on: ["b-head"], cmd: "git switch --detach <hash>", text: "HEAD is where you stand, normally attached to a branch. Check out a commit directly and HEAD detaches: not an error, just you visiting a snapshot." }
    ]
  };

  var d1 = window.GGStepper(D1);
  window.GGStepper(D2);


  /* A short check. Answering is the point: recall fixes a model in a way that
     rereading never does, and every option explains itself when chosen. */

  /* ------------------------------------------------- what each command touches

     The first diagram shows where code lives. This one turns that around: given
     a command, which of those places does it read, and which does it change?
     That is the question people actually hold in their heads, and the answer is
     what makes commands stop feeling arbitrary. */
  (function () {
    var picker = document.querySelector(".touch-picker");
    var arrows = document.getElementById("t-arrows");
    if (!picker || !arrows) return;

    var WT = "t-wt", IX = "t-index", LO = "t-local", RM = "t-remote";

    // from, to, and whether the source is only read
    var MOVES = [
      { c: "git add", from: WT, to: IX,
        says: "Copies your current file contents into the staging area. Your files are untouched; you are choosing what the next commit will contain." },
      { c: "git commit", from: IX, to: LO,
        says: "Turns whatever is staged into a permanent snapshot and moves your branch label onto it. Unstaged edits are left exactly where they are." },
      { c: "git push", from: LO, to: RM,
        says: "Sends commits you have already made to the remote and moves the remote's branch. It never looks at your working tree." },
      { c: "git fetch", from: RM, to: LO,
        says: "Brings down commits and updates your origin/* labels. Nothing of yours moves, which is exactly why it is the safe half of pull." },
      { c: "git pull", from: RM, to: WT, through: LO,
        says: "Fetch, then merge. It reaches all the way to your files, and that second half is what can surprise you." },
      { c: "git merge", from: LO, to: WT, through: IX,
        says: "Combines another branch into yours, writing a commit and updating your files to match." },
      { c: "git restore <file>", from: LO, to: WT,
        says: "Overwrites the file in your working tree with the committed version. The uncommitted edit is gone for good." },
      { c: "git restore --staged", from: LO, to: IX,
        says: "Takes a file back out of the staging area. Your edits stay in the working tree; only the staging choice is undone." },
      { c: "git reset --soft", from: LO, to: LO, label: "moves the branch",
        says: "Moves your branch label back. The staging area and your files are untouched, so the work stays exactly where it was." },
      { c: "git reset --mixed", from: LO, to: IX,
        says: "Moves the branch label back and clears the staging area. Your files still hold every change." },
      { c: "git reset --hard", from: LO, to: WT, through: IX, danger: true,
        says: "Moves the branch, clears staging, and overwrites your files. The one variant that can destroy uncommitted work." },
      { c: "git stash", from: WT, to: LO, label: "onto the shelf",
        says: "Puts your uncommitted changes aside in your own repository and leaves the working tree clean." },
      { c: "git switch", from: LO, to: WT,
        says: "Points HEAD at another branch and rewrites your files to match it. Nothing is lost; the other branch still exists." },
      { c: "git clone", from: RM, to: LO, label: "everything",
        says: "Copies an entire repository: all the history, plus a working tree, plus origin already configured." },
      { c: "git revert", from: LO, to: LO, label: "adds a commit",
        says: "Writes a new commit that undoes an old one. History only ever grows, which is what makes it safe to share." }
    ];

    var SVGNS = "http://www.w3.org/2000/svg";
    var current = 0;

    function centre(id) {
      var r = document.getElementById(id).querySelector("rect");
      return {
        x: +r.getAttribute("x") + +r.getAttribute("width") / 2,
        y: +r.getAttribute("y") + +r.getAttribute("height") / 2,
        left: +r.getAttribute("x"),
        right: +r.getAttribute("x") + +r.getAttribute("width")
      };
    }

    function arrow(fromId, toId, dashed, label) {
      var a = centre(fromId), b = centre(toId);
      var g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "tarrow" + (dashed ? " reads" : ""));

      if (fromId === toId) {
        // A loop, for the commands that only move a label within one place.
        var p = document.createElementNS(SVGNS, "path");
        p.setAttribute("d", "M" + (a.x - 34) + ",188 q34,34 68,0");
        p.setAttribute("fill", "none");
        g.appendChild(p);
      } else {
        // The verticals drop from box centres, so the horizontal has to join
        // those centres too. Spanning box edges left an 18px stub.
        var line = document.createElementNS(SVGNS, "line");
        line.setAttribute("x1", a.x); line.setAttribute("y1", 200);
        line.setAttribute("x2", b.x); line.setAttribute("y2", 200);
        g.appendChild(line);
        var v1 = document.createElementNS(SVGNS, "line");
        v1.setAttribute("x1", a.x); v1.setAttribute("y1", 170);
        v1.setAttribute("x2", a.x); v1.setAttribute("y2", 200);
        g.appendChild(v1);
        var v2 = document.createElementNS(SVGNS, "line");
        v2.setAttribute("x1", b.x); v2.setAttribute("y1", 200);
        v2.setAttribute("x2", b.x); v2.setAttribute("y2", 170);
        g.appendChild(v2);
        var head = document.createElementNS(SVGNS, "polygon");
        head.setAttribute("points", b.x + ",168 " + (b.x - 6) + ",180 " + (b.x + 6) + ",180");
        g.appendChild(head);
      }

      if (label) {
        var t = document.createElementNS(SVGNS, "text");
        t.setAttribute("x", (a.x + b.x) / 2);
        t.setAttribute("y", fromId === toId ? 238 : 220);
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("class", "tlabel");
        t.textContent = label;
        g.appendChild(t);
      }
      arrows.appendChild(g);
    }

    function show(i) {
      current = i;
      var m = MOVES[i];
      while (arrows.firstChild) arrows.removeChild(arrows.firstChild);

      [WT, IX, LO, RM].forEach(function (id) {
        var z = document.getElementById(id);
        z.classList.remove("writes", "reads");
      });
      document.getElementById(m.from).classList.add("reads");
      if (m.through) document.getElementById(m.through).classList.add("writes");
      document.getElementById(m.to).classList.add("writes");

      if (m.through) {
        arrow(m.from, m.through, true, null);
        arrow(m.through, m.to, false, m.label || null);
      } else {
        arrow(m.from, m.to, false, m.label || null);
      }

      document.getElementById("touch-cmd").textContent = m.c;
      document.getElementById("touch-says").textContent = m.says;
      Array.prototype.forEach.call(picker.children, function (b, n) {
        b.classList.toggle("active", n === i);
        b.setAttribute("aria-pressed", n === i ? "true" : "false");
      });
    }

    MOVES.forEach(function (m, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip touch-chip" + (m.danger ? " is-danger" : "");
      b.textContent = m.c;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () { show(i); });
      picker.appendChild(b);
    });

    show(0);
  })();

  window.GGQuiz("learn-quiz", "learn");

  /* Click any zone or arrow to jump straight to its step. */
  var JUMP = { "z-wt": 0, "a-add": 1, "z-stage": 1, "a-commit": 2, "z-local": 2,
               "a-push": 3, "z-remote": 3, "a-fetch": 4, "a-merge": 5, "a-restore": 6 };
  var LABEL = { "z-wt": "Working tree", "z-stage": "Staging area", "z-local": "Local repository",
                "z-remote": "Remote", "a-add": "git add", "a-commit": "git commit", "a-push": "git push",
                "a-fetch": "git fetch", "a-merge": "git merge or pull", "a-restore": "git restore" };
  Object.keys(JUMP).forEach(function (id) {
    var e = document.getElementById(id);
    if (e && d1) {
      window.GGMakeClickable(e, "Jump to the step for " + LABEL[id], function () { d1.goto(JUMP[id]); });
    }
  });
})();
