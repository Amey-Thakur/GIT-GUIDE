/*
  File: play.js
  Purpose: A real Git engine in the browser. Type actual commands, watch the graph move.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript, SVG
  Description: Models commits, branches, HEAD, the index, and the reflog, then draws the
               result. Nothing is faked: merges create merge commits, rebase replays and
               abandons the originals, reset leaves the old commits reachable by reflog.
  Date: 2026-08-08
*/
(function () {
  "use strict";

  var svg = document.getElementById("pg");
  if (!svg) return;

  var outEl = document.getElementById("pout");
  var inEl = document.getElementById("pin");
  var statusEl = document.getElementById("pstatus");
  var taskEl = document.getElementById("ptask");
  var hintEl = document.getElementById("phint");
  var dotsEl = document.getElementById("pdots");

  /* ---------------------------------------------------------------- state */

  var S, seed, task = 0, solved = [];

  // A small deterministic generator, so the same session always yields the
  // same short hashes. Easier to talk about, and easier to test.
  function nextId() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    var h = seed.toString(16);
    while (h.length < 7) h = "0" + h;
    return h.slice(0, 7);
  }

  function reset(quiet) {
    seed = 20260808;
    var root = nextId();
    S = {
      commits: {},
      order: [],
      branches: { main: root },
      head: { type: "branch", name: "main" },
      tags: {},
      files: {},
      staged: {},
      stash: [],
      reflog: [],
      rescued: false
    };
    S.commits[root] = { id: root, parents: [], msg: "Initial commit" };
    S.order.push(root);
    note("HEAD", "commit (initial): Initial commit");
    if (!quiet) {
      clear();
      say("A fresh repository on <b>main</b>, one commit in. Type a command, or press Enter on an example below.", "sys");
    }
  }

  function note(ref, what) {
    S.reflog.unshift({ ref: ref, id: headId(), what: what });
    if (S.reflog.length > 40) S.reflog.pop();
  }

  /* ------------------------------------------------------------- plumbing */

  function headId() {
    return S.head.type === "branch" ? S.branches[S.head.name] : S.head.id;
  }

  function headName() {
    return S.head.type === "branch" ? S.head.name : "detached at " + S.head.id;
  }

  function ancestors(id) {
    var seen = {}, stack = [id];
    while (stack.length) {
      var c = stack.pop();
      if (!c || seen[c]) continue;
      seen[c] = true;
      var cm = S.commits[c];
      if (cm) stack.push.apply(stack, cm.parents);
    }
    return seen;
  }

  function isAncestor(a, b) {
    return !!ancestors(b)[a];
  }

  // Resolve main, HEAD, HEAD~2, HEAD^, a tag, or a short hash.
  function resolve(ref) {
    if (!ref) return null;
    var m = /^(.+?)([~^])(\d*)$/.exec(ref);
    if (m) {
      var base = resolve(m[1]);
      if (!base) return null;
      var n = m[2] === "^" ? (m[3] ? parseInt(m[3], 10) : 1) : (m[3] ? parseInt(m[3], 10) : 1);
      if (m[2] === "^") {
        var c = S.commits[base];
        return c && c.parents[n - 1] ? c.parents[n - 1] : null;
      }
      var cur = base;
      for (var i = 0; i < n; i++) {
        var cm = S.commits[cur];
        if (!cm || !cm.parents.length) return null;
        cur = cm.parents[0];
      }
      return cur;
    }
    if (ref === "HEAD") return headId();
    if (S.branches[ref] != null) return S.branches[ref];
    if (S.tags[ref] != null) return S.tags[ref];
    if (S.commits[ref]) return ref;
    return null;
  }

  function commit(msg, parents) {
    var id = nextId();
    S.commits[id] = { id: id, parents: parents, msg: msg };
    S.order.push(id);
    if (S.head.type === "branch") S.branches[S.head.name] = id;
    else S.head.id = id;
    return id;
  }

  function dirty() {
    return Object.keys(S.files).some(function (f) { return S.files[f] !== "clean"; }) ||
      Object.keys(S.staged).length > 0;
  }

  /* ------------------------------------------------------------- commands */

  function run(line) {
    var t = tokenize(line);
    if (!t.length) return;

    if (t[0] === "clear") { clear(); return; }
    if (t[0] === "reset" && t.length === 1) { reset(); draw(); return; }

    // A stand-in for editing a file in your editor. Not a Git command, and labelled as such.
    if (t[0] === "edit" || t[0] === "touch") {
      var f = t[1] || "notes.txt";
      S.files[f] = S.files[f] ? "modified" : "untracked";
      say("Edited <code>" + esc(f) + "</code>. Not a Git command: this stands for changing the file in your editor.", "sys");
      return;
    }

    if (t[0] !== "git") { say("Only <code>git</code> commands, plus <code>edit &lt;file&gt;</code> and <code>clear</code>.", "err"); return; }

    var cmd = t[1], a = t.slice(2);
    var fn = CMDS[cmd];
    if (!fn) { say("<code>git " + esc(cmd || "") + "</code> is not something this sandbox models. Try the examples below.", "err"); return; }
    fn(a);
  }

  var CMDS = {};

  CMDS.status = function () {
    var lines = [];
    lines.push("On branch <b>" + esc(headName()) + "</b>");
    var st = Object.keys(S.staged);
    if (st.length) lines.push('<span class="g">Changes to be committed:</span> ' + st.map(esc).join(", "));
    var mod = Object.keys(S.files).filter(function (f) { return S.files[f] === "modified"; });
    if (mod.length) lines.push('<span class="r">Changes not staged:</span> ' + mod.map(esc).join(", "));
    var un = Object.keys(S.files).filter(function (f) { return S.files[f] === "untracked"; });
    if (un.length) lines.push('<span class="r">Untracked files:</span> ' + un.map(esc).join(", "));
    if (!st.length && !mod.length && !un.length) lines.push("nothing to commit, working tree clean");
    say(lines.join("<br>"), "out");
  };

  CMDS.add = function (a) {
    if (!a.length) { say("Nothing specified. Use <code>git add .</code> or <code>git add &lt;file&gt;</code>.", "err"); return; }
    var names = a[0] === "." || a[0] === "-A" ? Object.keys(S.files) : a;
    var n = 0;
    names.forEach(function (f) {
      if (S.files[f] == null) return;
      S.staged[f] = true;
      delete S.files[f];
      n++;
    });
    if (!n) { say("No matching changes to stage. Run <code>edit &lt;file&gt;</code> first.", "err"); return; }
    say("Staged " + n + " file" + (n === 1 ? "" : "s") + ". They are now in the index, drafted for the next commit.", "out");
  };

  CMDS.commit = function (a) {
    var i = a.indexOf("-m");
    var msg = i !== -1 && a[i + 1] ? a[i + 1] : "Update";
    var amend = a.indexOf("--amend") !== -1;

    if (amend) {
      var cur = S.commits[headId()];
      if (!cur || !cur.parents.length) { say("Nothing to amend onto.", "err"); return; }
      var old = cur.id;
      var nid = nextId();
      S.commits[nid] = { id: nid, parents: cur.parents, msg: (i !== -1 && a[i + 1]) ? msg : cur.msg };
      S.order.push(nid);
      if (S.head.type === "branch") S.branches[S.head.name] = nid; else S.head.id = nid;
      S.staged = {};
      note("HEAD", "commit (amend): " + S.commits[nid].msg);
      say("Amended. <b>This is a new commit</b> (" + nid + "), not an edited one. " +
        old + " is now unreferenced, which is why amending after a push needs a force.", "out");
      draw(); return;
    }

    if (!Object.keys(S.staged).length) {
      say("nothing to commit, working tree clean. Stage something first: <code>edit app.js</code> then <code>git add .</code>", "err");
      return;
    }
    S.staged = {};
    var id = commit(msg, [headId()]);
    note("HEAD", "commit: " + msg);
    say("Committed <b>" + id + "</b> " + esc(msg) + ". The branch pointer moved with you.", "out");
    draw();
  };

  CMDS.branch = function (a) {
    if (!a.length) {
      say(Object.keys(S.branches).map(function (n) {
        return (S.head.type === "branch" && S.head.name === n ? "* <b>" : "&nbsp; ") + esc(n) +
          (S.head.type === "branch" && S.head.name === n ? "</b>" : "");
      }).join("<br>"), "out");
      return;
    }
    if (a[0] === "-d" || a[0] === "-D") {
      var n = a[1];
      if (!S.branches[n]) { say("branch '" + esc(n) + "' not found.", "err"); return; }
      if (S.head.type === "branch" && S.head.name === n) { say("Cannot delete the branch you are standing on. <code>git switch main</code> first.", "err"); return; }
      var tip = S.branches[n];
      var merged = Object.keys(S.branches).some(function (o) { return o !== n && isAncestor(tip, S.branches[o]); });
      if (!merged && a[0] === "-d") {
        say("The branch <b>" + esc(n) + "</b> is not fully merged. Git is protecting you. Use <code>-D</code> if you really mean it.", "err");
        return;
      }
      delete S.branches[n];
      say("Deleted branch " + esc(n) + ". Only the pointer went; the commits are still there until Git garbage-collects them.", "out");
      draw(); return;
    }
    S.branches[a[0]] = resolve(a[1]) || headId();
    say("Created <b>" + esc(a[0]) + "</b> here. A branch is just a movable pointer to one commit. You are still on " + esc(headName()) + ".", "out");
    draw();
  };

  function switchTo(a) {
    var create = a.indexOf("-c") !== -1 || a.indexOf("-b") !== -1;
    var name = a.filter(function (x) { return x[0] !== "-"; })[0];
    if (!name) { say("Which branch?", "err"); return; }
    if (create) {
      if (S.branches[name]) { say("A branch named " + esc(name) + " already exists.", "err"); return; }
      S.branches[name] = headId();
      S.head = { type: "branch", name: name };
      note("HEAD", "checkout: moving to " + name);
      say("Created and switched to <b>" + esc(name) + "</b>. Same commit, new pointer, and HEAD now follows it.", "out");
      draw(); return;
    }
    if (S.branches[name] != null) {
      S.head = { type: "branch", name: name };
      note("HEAD", "checkout: moving to " + name);
      say("Switched to <b>" + esc(name) + "</b>.", "out");
      draw(); return;
    }
    var id = resolve(name);
    if (id) {
      S.head = { type: "detached", id: id };
      note("HEAD", "checkout: moving to " + id);
      say("You are in <b>detached HEAD</b> at " + id + ". Commits here belong to no branch. " +
        "<code>git switch -c &lt;name&gt;</code> keeps them; <code>git switch main</code> walks away.", "out");
      draw(); return;
    }
    say("No branch or commit named " + esc(name) + ".", "err");
  }

  CMDS.switch = switchTo;
  CMDS.checkout = switchTo;

  CMDS.merge = function (a) {
    var name = a.filter(function (x) { return x[0] !== "-"; })[0];
    var target = resolve(name);
    if (!target) { say("No branch named " + esc(name || "") + ".", "err"); return; }
    var h = headId();
    if (isAncestor(target, h)) { say("Already up to date. Everything in " + esc(name) + " is already here.", "out"); return; }
    if (isAncestor(h, target)) {
      if (S.head.type === "branch") S.branches[S.head.name] = target; else S.head.id = target;
      note("HEAD", "merge " + name + ": fast-forward");
      say("<b>Fast-forward.</b> Your branch had nothing of its own, so Git slid the pointer along. No merge commit exists.", "out");
      draw(); return;
    }
    var id = commit("Merge branch '" + name + "'", [h, target]);
    note("HEAD", "merge " + name + ": merge commit");
    say("Created merge commit <b>" + id + "</b>, with <b>two parents</b>. Both histories are preserved exactly as they happened.", "out");
    draw();
  };

  CMDS.rebase = function (a) {
    var name = a.filter(function (x) { return x[0] !== "-"; })[0];
    var upstream = resolve(name);
    if (!upstream) { say("No branch named " + esc(name || "") + ".", "err"); return; }
    if (S.head.type !== "branch") { say("Rebase in detached HEAD is beyond this sandbox.", "err"); return; }
    var h = headId();
    if (isAncestor(h, upstream)) { say("Already up to date.", "out"); return; }
    var up = ancestors(upstream);
    var mine = [], cur = h;
    while (cur && !up[cur]) { mine.push(cur); cur = S.commits[cur].parents[0]; }
    if (!mine.length) { say("Nothing to replay.", "out"); return; }
    mine.reverse();
    var base = upstream, made = [];
    mine.forEach(function (old) {
      var id = nextId();
      S.commits[id] = { id: id, parents: [base], msg: S.commits[old].msg };
      S.order.push(id);
      made.push(id);
      base = id;
    });
    S.branches[S.head.name] = base;
    note("HEAD", "rebase onto " + name);
    say("Replayed " + mine.length + " commit" + (mine.length === 1 ? "" : "s") + " onto " + esc(name) +
      ". The new ones are <b>" + made.join(", ") + "</b>: different hashes, same changes. " +
      "The originals (" + mine.join(", ") + ") are now unreferenced, shown faded. " +
      "<b>That is why you never rebase a branch someone else has.</b>", "out");
    draw();
  };

  CMDS.reset = function (a) {
    var mode = a.filter(function (x) { return x[0] === "-"; })[0] || "--mixed";
    var ref = a.filter(function (x) { return x[0] !== "-"; })[0] || "HEAD";
    var id = resolve(ref);
    if (!id) { say("Cannot resolve " + esc(ref) + ".", "err"); return; }
    var was = headId();

    // Was the target orphaned before this reset? Then this is a genuine rescue,
    // not just a move, and that is the thing worth learning.
    var reachable = {};
    Object.keys(S.branches).forEach(function (b) {
      var anc = ancestors(S.branches[b]);
      Object.keys(anc).forEach(function (c) { reachable[c] = true; });
    });
    if (!reachable[id]) S.rescued = true;

    if (S.head.type === "branch") S.branches[S.head.name] = id; else S.head.id = id;
    note("HEAD", "reset: moving to " + ref);
    if (mode === "--hard") { S.staged = {}; S.files = {}; }
    say("Moved <b>" + esc(headName()) + "</b> back to " + id + " with <code>" + esc(mode) + "</code>." +
      (mode === "--hard" ? " Working tree wiped too." : mode === "--soft" ? " Your changes are still staged." : " Your changes are kept, unstaged.") +
      "<br>" + was + " is <b>not deleted</b>, only unreferenced. <code>git reflog</code> still knows it.", "out");
    draw();
  };

  CMDS.revert = function (a) {
    var id = resolve(a[0] || "HEAD");
    if (!id) { say("Cannot resolve " + esc(a[0] || "HEAD") + ".", "err"); return; }
    var nid = commit('Revert "' + S.commits[id].msg + '"', [headId()]);
    note("HEAD", "revert " + id);
    say("Added <b>" + nid + "</b>, a new commit that undoes " + id + ". Nothing was rewritten, " +
      "which is what makes revert the safe undo on a shared branch.", "out");
    draw();
  };

  CMDS["cherry-pick"] = function (a) {
    var id = resolve(a[0]);
    if (!id) { say("Cannot resolve " + esc(a[0] || "") + ".", "err"); return; }
    var nid = commit(S.commits[id].msg, [headId()]);
    note("HEAD", "cherry-pick " + id);
    say("Copied " + id + " here as <b>" + nid + "</b>. Same change, new commit, and the original stays where it is.", "out");
    draw();
  };

  CMDS.tag = function (a) {
    if (!a.length) { say(Object.keys(S.tags).join("<br>") || "no tags yet", "out"); return; }
    var name = a.filter(function (x) { return x[0] !== "-"; })[0];
    S.tags[name] = resolve(a[a.length - 1]) || headId();
    say("Tagged " + esc(name) + ". Unlike a branch, a tag does not move when you commit.", "out");
    draw();
  };

  CMDS.log = function () {
    var seen = ancestors(headId());
    var list = S.order.filter(function (id) { return seen[id]; }).reverse();
    say(list.map(function (id) {
      var c = S.commits[id];
      return '<span class="y">' + id + "</span> " + esc(c.msg) + (c.parents.length > 1 ? '  <span class="m">(merge)</span>' : "");
    }).join("<br>"), "out");
  };

  CMDS.reflog = function () {
    if (!S.reflog.length) { say("no reflog yet", "out"); return; }
    say(S.reflog.map(function (r, i) {
      return '<span class="y">' + r.id + "</span> HEAD@{" + i + "}: " + esc(r.what);
    }).join("<br>") + '<br><br><span class="g">Anything listed here can be recovered: <code>git reset --hard &lt;hash&gt;</code></span>', "out");
  };

  CMDS.stash = function (a) {
    if (a[0] === "pop" || a[0] === "apply") {
      if (!S.stash.length) { say("No stash entries found.", "err"); return; }
      var e = a[0] === "pop" ? S.stash.shift() : S.stash[0];
      Object.keys(e).forEach(function (f) { S.files[f] = e[f]; });
      say("Restored your changes to the working tree.", "out"); return;
    }
    if (!dirty()) { say("No local changes to save.", "err"); return; }
    S.stash.unshift(S.files);
    S.files = {}; S.staged = {};
    say("Saved your changes on the shelf and cleaned the working tree. <code>git stash pop</code> brings them back.", "out");
  };

  /* --------------------------------------------------------------- layout */

  var SVGNS = "http://www.w3.org/2000/svg";

  function el(n, at) {
    var e = document.createElementNS(SVGNS, n);
    for (var k in at) e.setAttribute(k, at[k]);
    return e;
  }

  function draw() {
    var live = {};
    Object.keys(S.branches).forEach(function (b) {
      var anc = ancestors(S.branches[b]);
      Object.keys(anc).forEach(function (id) { live[id] = true; });
    });
    if (S.head.type === "detached") {
      var ha = ancestors(S.head.id);
      Object.keys(ha).forEach(function (id) { live[id] = true; });
    }

    // Generation gives the x position, so parents always sit left of children.
    var gen = {};
    function g(id) {
      if (gen[id] != null) return gen[id];
      var c = S.commits[id];
      gen[id] = c.parents.length ? Math.max.apply(null, c.parents.map(g)) + 1 : 0;
      return gen[id];
    }
    S.order.forEach(g);

    // Lanes: walk each branch tip back along first parents, claiming free commits.
    var lane = {}, next = 0;
    var names = Object.keys(S.branches).sort(function (a, b) {
      if (a === "main") return -1;
      if (b === "main") return 1;
      return a < b ? -1 : 1;
    });
    var tips = names.map(function (n) { return S.branches[n]; });
    if (S.head.type === "detached") tips.push(S.head.id);
    tips.forEach(function (tip) {
      var chain = [], cur = tip;
      while (cur && lane[cur] == null) { chain.push(cur); cur = S.commits[cur].parents[0]; }
      if (chain.length) { var l = next++; chain.forEach(function (id) { lane[id] = l; }); }
    });
    S.order.forEach(function (id) { if (lane[id] == null) lane[id] = next++; });

    // GY clears a commit's caption before the next lane's branch label starts;
    // PADY leaves room for two pointers stacked above the top lane.
    var GX = 108, GY = 96, PADX = 60, PADY = 70;
    var maxG = 0, maxL = 0;
    S.order.forEach(function (id) {
      if (gen[id] > maxG) maxG = gen[id];
      if (lane[id] > maxL) maxL = lane[id];
    });
    // The 48 below is the caption's height plus its descender.
    var W = Math.max(PADX * 2 + maxG * GX, 150), H = PADY + maxL * GY + 48;

    var SCALE = 1.45;   // legible without magnifying a three-commit graph absurdly
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.style.width = Math.round(W * SCALE) + "px";

    function X(id) { return PADX + gen[id] * GX; }
    function Y(id) { return PADY + lane[id] * GY; }

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Edges first, so nodes sit on top.
    S.order.forEach(function (id) {
      var c = S.commits[id];
      c.parents.forEach(function (p, i) {
        if (!S.commits[p]) return;
        var x1 = X(p), y1 = Y(p), x2 = X(id), y2 = Y(id);
        var cls = "pedge" + (live[id] ? "" : " ghost") + (i > 0 ? " second" : "");
        if (y1 === y2) {
          svg.appendChild(el("line", { x1: x1 + 15, y1: y1, x2: x2 - 15, y2: y2, class: cls }));
        } else {
          var mx = (x1 + x2) / 2;
          svg.appendChild(el("path", {
            d: "M" + (x1 + 13) + "," + y1 + " C" + mx + "," + y1 + " " + mx + "," + y2 + " " + (x2 - 13) + "," + y2,
            class: cls, fill: "none"
          }));
        }
      });
    });

    var hid = headId();
    S.order.forEach(function (id) {
      var c = S.commits[id];
      var gnode = el("g", { class: "pnode" + (live[id] ? "" : " ghost") + (c.parents.length > 1 ? " merge" : "") });
      gnode.appendChild(el("circle", { cx: X(id), cy: Y(id), r: 15 }));
      var t = el("text", { x: X(id), y: Y(id) + 4, "text-anchor": "middle", class: "phash" });
      t.textContent = id.slice(0, 4);
      gnode.appendChild(t);
      var m = el("text", { x: X(id), y: Y(id) + 34, "text-anchor": "middle", class: "pmsg" });
      m.textContent = c.msg.length > 16 ? c.msg.slice(0, 15) + "…" : c.msg;
      gnode.appendChild(m);
      var title = el("title");
      title.textContent = id + "  " + c.msg + (live[id] ? "" : "  (unreferenced: recoverable with git reflog)");
      gnode.appendChild(title);
      svg.appendChild(gnode);
    });

    // Branch and tag pointers, stacked above their commit.
    var stack = {};
    function label(id, text, cls) {
      var k = id;
      stack[k] = (stack[k] || 0) + 1;
      var y = Y(id) - 26 - (stack[k] - 1) * 22;
      var w = Math.max(34, text.length * 7.6 + 12);
      var gl = el("g", { class: cls });
      gl.appendChild(el("rect", { x: X(id) - w / 2, y: y - 13, width: w, height: 20, rx: 5 }));
      var tx = el("text", { x: X(id), y: y + 2, "text-anchor": "middle" });
      tx.textContent = text;
      gl.appendChild(tx);
      svg.appendChild(gl);
    }
    Object.keys(S.tags).forEach(function (t) { label(S.tags[t], t, "ptag"); });
    names.forEach(function (n) {
      var on = S.head.type === "branch" && S.head.name === n;
      label(S.branches[n], n, "pbranch" + (on ? " on" : ""));
    });
    if (S.head.type === "detached") label(S.head.id, "HEAD", "pbranch on detached");
    else label(S.branches[S.head.name], "HEAD", "phead");

    var nc = Object.keys(S.commits).length, nb = Object.keys(S.branches).length;
    statusEl.innerHTML = "On <b>" + esc(headName()) + "</b> · " +
      nc + (nc === 1 ? " commit" : " commits") + " · " +
      nb + (nb === 1 ? " branch" : " branches") +
      (dirty() ? ' · <span class="r">uncommitted changes</span>' : "");

    checkTask();
  }

  /* ----------------------------------------------------------- challenges */

  var TASKS = [
    {
      t: "Make a commit",
      h: "Nothing is staged yet. <code>edit app.js</code>, then <code>git add .</code>, then <code>git commit -m \"Add app\"</code>.",
      d: "Watch the branch pointer move with you. That is all a commit does to the graph.",
      ok: function () { return Object.keys(S.commits).length >= 2; }
    },
    {
      t: "Start a branch and commit on it",
      h: "<code>git switch -c feature</code>, then edit, add, and commit again.",
      d: "The branch is a pointer, not a copy. Nothing was duplicated.",
      ok: function () {
        return Object.keys(S.branches).length >= 2 && Object.keys(S.branches).some(function (b) {
          return b !== "main" && S.branches[b] !== S.branches.main && !isAncestor(S.branches[b], S.branches.main);
        });
      }
    },
    {
      t: "Merge it back without a fast-forward",
      h: "Switch to main, commit once there so the branches diverge, then <code>git merge feature</code>.",
      d: "A real merge commit has two parents. Both histories survive intact.",
      ok: function () {
        return Object.keys(S.commits).some(function (id) {
          return S.commits[id].parents.length > 1 && isAncestor(id, S.branches.main);
        });
      }
    },
    {
      t: "Undo a commit the safe way",
      h: "<code>git revert HEAD</code>. It adds a commit rather than removing one.",
      d: "This is the undo that is safe after pushing, because it rewrites nothing.",
      ok: function () {
        return Object.keys(S.commits).some(function (id) { return /^Revert /.test(S.commits[id].msg); });
      }
    },
    {
      t: "Abandon a commit, then rescue it",
      h: "<code>git reset --hard HEAD~1</code> to drop one. Then <code>git reflog</code>, and reset back onto the abandoned hash. Note that <code>HEAD@{0}</code> is where you are <em>now</em>, so the one you want is below it.",
      d: "Nothing was ever deleted. The reflog is the safety net under almost every Git mistake.",
      ok: function () { return !!S.rescued; }
    },
    {
      t: "Rebase instead of merging",
      h: "Make a branch that diverges from main, then <code>git rebase main</code> on it.",
      d: "Same changes, new hashes, straight line. The faded commits are the originals you left behind.",
      ok: function () {
        return S.reflog.some(function (r) { return /^rebase/.test(r.what); });
      }
    }
  ];

  function renderTask() {
    var k = TASKS[task];
    taskEl.innerHTML = "<b>" + (task + 1) + ". " + k.t + "</b>";
    hintEl.innerHTML = solved[task] ? '<span class="g">' + k.d + "</span>" : k.h;
    dotsEl.innerHTML = TASKS.map(function (_, i) {
      return '<span class="pdot' + (solved[i] ? " done" : "") + (i === task ? " now" : "") + '"></span>';
    }).join("");
  }

  function checkTask() {
    var moved = false;
    TASKS.forEach(function (k, i) {
      if (!solved[i] && k.ok()) { solved[i] = true; if (i === task) moved = true; }
    });
    if (moved) {
      say("<b class=\"g\">Done: " + TASKS[task].t + ".</b> " + TASKS[task].d, "win");
      var nextUp = TASKS.findIndex(function (_, i) { return !solved[i]; });
      if (nextUp === -1) {
        renderTask();
        say("<b class=\"g\">That is all six.</b> You have just done, by hand, what most people avoid for years: branch, merge, revert, reset, recover, and rebase.", "win");
        return;
      }
      task = nextUp;
    }
    renderTask();
  }

  /* ------------------------------------------------------------------- io */

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function tokenize(s) {
    var out = [], cur = "", q = null;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (q) { if (ch === q) q = null; else cur += ch; }
      else if (ch === '"' || ch === "'") q = ch;
      else if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ""; } }
      else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  function say(html, kind) {
    var d = document.createElement("div");
    d.className = "pline " + (kind || "out");
    d.innerHTML = html;
    outEl.appendChild(d);
    outEl.scrollTop = outEl.scrollHeight;
  }

  function clear() { outEl.innerHTML = ""; }

  var hist = [], hi = -1;

  inEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      var v = inEl.value.trim();
      if (!v) return;
      say('<span class="p">$</span> ' + esc(v), "cmd");
      hist.unshift(v); hi = -1;
      inEl.value = "";
      try { run(v); } catch (err) { say("The sandbox tripped over that one. <code>reset</code> starts fresh.", "err"); }
    } else if (e.key === "ArrowUp") {
      if (hi + 1 < hist.length) { hi++; inEl.value = hist[hi]; e.preventDefault(); }
    } else if (e.key === "ArrowDown") {
      if (hi > 0) { hi--; inEl.value = hist[hi]; } else { hi = -1; inEl.value = ""; }
      e.preventDefault();
    }
  });

  document.addEventListener("click", function (e) {
    var b = e.target.closest(".pex");
    if (b) {
      inEl.value = b.textContent;
      inEl.focus();
      return;
    }
    if (e.target.closest("#preset")) { reset(); draw(); }
    if (e.target.closest("#pskip")) {
      task = (task + 1) % TASKS.length;
      renderTask();
    }
  });

  reset();
  draw();
})();
