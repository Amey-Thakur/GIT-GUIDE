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
      rescued: false,
      used: {},          // which commands have been run at least once
      switches: 0,       // branch switches, for the "move between branches" lesson
      didFF: false, didSoftReset: false, didAmend: false, didRebase: false,
      didCherryPick: false, didStashPop: false, wasDetached: false, didCommit: false,
      remote: null,      // { url, branches: {name: commitId} } once origin exists
      upstream: {},      // local branch -> true when it tracks origin
      prs: {},           // open pull requests, keyed by branch
      didPush: false, didFetch: false, didPullAfterReject: false,
      pushRejected: false, didOpenPR: false, didMergePR: false
    };
    S.commits[root] = { id: root, parents: [], msg: "Initial commit" };
    S.order.push(root);
    note("HEAD", "commit (initial): Initial commit");
    if (!quiet) {
      clear();
      say("A fresh repository on <b>main</b>, one commit in. Type a command, or press Enter on an example below.", "sys");
    }
  }

  /* A stack of past states. Everything in S is plain data, so a JSON round trip
     is a complete and cheap snapshot. Experimenting is only fun when it is
     reversible, and this is the sandbox's own undo, not Git's. */
  var past = [];

  function snapshot() {
    try {
      past.push(JSON.stringify(S));
      if (past.length > 40) past.shift();
    } catch (e) { /* nothing sensible to do; undo just will not reach this far */ }
  }

  function undo() {
    if (!past.length) { say("Nothing left to undo.", "sys"); return; }
    try {
      S = JSON.parse(past.pop());
    } catch (e) { say("That step cannot be undone.", "err"); return; }
    say("Stepped back one command. <b>This is the sandbox's undo, not Git's</b>: " +
      "real Git has no such button, which is why every answer on this site carries its own way back.", "sys");
    draw();
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

  /* Every command the sandbox knows, with the shape people forget. */
  var VOCAB = [
    ["edit <file>", "change a file, standing in for your editor"],
    ["git status", "what is changed right now"],
    ["git add .", "stage everything for the next commit"],
    ["git commit -m \"message\"", "record a snapshot"],
    ["git commit --amend -m \"message\"", "replace the last commit"],
    ["git restore <file>", "throw away an uncommitted change"],
    ["git log", "the history behind you"],
    ["git branch <name>", "create a label here"],
    ["git branch -d <name>", "delete a label"],
    ["git switch <name>", "move onto a branch"],
    ["git switch -c <name>", "create a branch and move onto it"],
    ["git merge <branch>", "join another branch into this one"],
    ["git rebase <branch>", "replay your commits onto another base"],
    ["git cherry-pick <hash>", "copy one commit to here"],
    ["git revert HEAD", "add a commit that undoes the last one"],
    ["git reset --soft HEAD~1", "drop the commit, keep the work"],
    ["git reset --hard HEAD~1", "drop the commit and the work"],
    ["git reflog", "everywhere HEAD has been, including what you abandoned"],
    ["git stash", "shelve your changes"],
    ["git stash pop", "take them back off the shelf"],
    ["git tag <name>", "a label that does not move"],
    ["git clone <url>", "copy an existing repository, history and all"],
    ["git remote add origin <url>", "connect a GitHub repository"],
    ["git push -u origin <branch>", "publish a branch and track it"],
    ["git fetch", "update your origin labels, change nothing else"],
    ["git pull", "fetch, then merge"],
    ["gh pr create", "open a pull request for this branch"],
    ["gh pr merge", "merge the open pull request"],
    ["teammate", "a colleague pushes, so you can meet a rejected push"],
    ["undo", "step the sandbox back one command"],
    ["reset", "start the sandbox over"],
    ["clear", "clear this log"]
  ];

  function showHelp() {
    say("<b>Everything this sandbox understands.</b> Click any one to run it.<br>" +
      VOCAB.map(function (v) {
        return '<code>' + esc(v[0]) + "</code> <span class=\"m\">" + esc(v[1]) + "</span>";
      }).join("<br>"), "out");
  }

  /* ------------------------------------------------------------- commands */

  function run(line) {
    var t = tokenize(line);
    if (!t.length) return;

    if (t[0] === "clear") { clear(); return; }
    if (t[0] === "reset" && t.length === 1) { reset(); draw(); return; }

    // A stand-in for editing a file in your editor. Not a Git command, and labelled as such.
    if (t[0] === "edit" || t[0] === "touch") {
      snapshot();
      var f = t[1] || "notes.txt";
      S.files[f] = S.files[f] ? "modified" : "untracked";
      say("Edited <code>" + esc(f) + "</code>. Not a Git command: this stands for changing the file in your editor.", "sys");
      return;
    }

    // A stand-in for a colleague pushing to the shared repository. Not a real
    // command, and labelled as such, but there is no other way to feel what a
    // rejected push is like.
    if (t[0] === "undo") { undo(); return; }
    if (t[0] === "help" || t[0] === "?") { showHelp(); return; }
    if (t[0] === "teammate") { snapshot(); teammatePushes(); return; }

    if (t[0] === "gh") {
      snapshot();
      var g = GH[t[1]];
      if (!g) { say("This sandbox models <code>gh pr create</code> and <code>gh pr merge</code>.", "err"); return; }
      S.used["gh " + t[1]] = true;
      g(t.slice(2));
      checkLessons();
      return;
    }

    if (t[0] !== "git") {
      say("Commands start with <code>git</code> or <code>gh</code>. There is also <code>edit &lt;file&gt;</code>, " +
        "<code>teammate</code>, and <code>clear</code>.", "err");
      return;
    }

    var cmd = t[1], a = t.slice(2);
    var fn = CMDS[cmd];
    var READONLY = { status: 1, log: 1, reflog: 1, branch: 1, remote: 1, tag: 1 };
    if (fn && !(READONLY[cmd] && a.length === 0)) snapshot();
    if (fn) S.used[cmd] = true;
    if (!fn) { say("<code>git " + esc(cmd || "") + "</code> is not something this sandbox models. Try the examples below.", "err"); return; }
    fn(a);
    // Read-only commands like status and log never redraw, so the lesson check
    // has to run here too or those lessons only register a command later.
    checkLessons();
  }

  var CMDS = {};

  function remoteTip(b) {
    return S.remote && S.remote.branches[b] != null ? S.remote.branches[b] : null;
  }

  // A colleague pushes one commit on top of whatever origin already has.
  function teammatePushes() {
    if (!S.remote) { say("There is no remote yet. <code>git remote add origin &lt;url&gt;</code> first.", "err"); return; }
    var b = S.head.type === "branch" ? S.head.name : "main";
    var base = remoteTip(b);
    if (base == null) { say("Nothing is on origin/" + esc(b) + " yet. Push first, then try again.", "err"); return; }
    var id = nextId();
    S.commits[id] = { id: id, parents: [base], msg: "Teammate's fix" };
    S.order.push(id);
    S.remote.branches[b] = id;
    say("A teammate pushed <b>" + id + "</b> to <b>origin/" + esc(b) + "</b>. " +
      "Your local branch has not moved, so the two have now diverged.", "out");
    draw();
  }

  CMDS.clone = function (a) {
    var url = a.filter(function (x) { return x[0] !== "-"; })[0] ||
              "https://github.com/you/project.git";
    // Cloning replaces whatever is here, exactly as it would in a fresh folder.
    past = [];
    reset(true);
    S.commits[S.branches.main].msg = "Initial commit";
    var msgs = ["Add README", "Set up the project"];
    msgs.forEach(function (m) { commit(m, [headId()]); });
    S.remote = { url: url, branches: { main: S.branches.main } };
    S.upstream.main = true;
    S.used.clone = true;
    note("HEAD", "clone: from " + url);
    clear();
    say("Cloned <b>" + esc(url) + "</b>.<br>" +
      "You did not download a snapshot: you have <b>the entire history</b>, every commit, " +
      "and you can work offline from here.<br>" +
      "Notice what came with it: <b>origin</b> is already configured, <b>origin/main</b> marks where " +
      "the server was, and your <b>main</b> is already tracking it. This is why cloning is the " +
      "easiest way to start, and <code>git init</code> plus <code>git remote add</code> is the " +
      "longer road to the same place.", "out");
    draw();
  };

  CMDS.remote = function (a) {
    if (!a.length || a[0] === "-v") {
      if (!S.remote) { say("No remotes yet. <code>git remote add origin &lt;url&gt;</code> connects one.", "out"); return; }
      say("origin&nbsp;&nbsp;" + esc(S.remote.url) + " (fetch)<br>origin&nbsp;&nbsp;" + esc(S.remote.url) + " (push)", "out");
      return;
    }
    if (a[0] === "add") {
      var url = a[2] || "https://github.com/you/project.git";
      S.remote = { url: url, branches: {} };
      say("Added <b>origin</b> pointing at " + esc(url) + ". Nothing has been sent yet: " +
        "a remote is only an address until you push.", "out");
      draw(); return;
    }
    say("This sandbox models <code>git remote add</code> and <code>git remote -v</code>.", "err");
  };

  CMDS.push = function (a) {
    if (!S.remote) { say("No remote. <code>git remote add origin &lt;url&gt;</code> first.", "err"); return; }
    if (S.head.type !== "branch") { say("You are not on a branch, so there is nothing to push.", "err"); return; }
    var b = S.head.name;
    var mine = S.branches[b];
    var theirs = remoteTip(b);

    if (theirs != null && theirs === mine) { say("Everything up-to-date.", "out"); return; }

    // The rejection everyone meets: origin has a commit you do not.
    if (theirs != null && !isAncestor(theirs, mine)) {
      S.pushRejected = true;
      say('<span class="r">! [rejected]&nbsp;&nbsp;' + esc(b) + " -> " + esc(b) + " (non-fast-forward)</span><br>" +
        "origin has work you do not. Git refuses rather than throwing it away. " +
        "<b>Do not force.</b> Run <code>git pull</code> to bring it in, then push again.", "err");
      return;
    }

    S.remote.branches[b] = mine;
    if (a.indexOf("-u") !== -1 || a.indexOf("--set-upstream") !== -1) S.upstream[b] = true;
    S.didPush = true;
    if (S.pushRejected) S.didPullAfterReject = true;
    say("Pushed <b>" + esc(b) + "</b> to origin. <b>origin/" + esc(b) + "</b> now points where you do." +
      (S.upstream[b] ? " Tracking is set, so plain <code>git push</code> works from here." : ""), "out");
    draw();
  };

  CMDS.fetch = function () {
    if (!S.remote) { say("No remote to fetch from.", "err"); return; }
    S.didFetch = true;
    say("Fetched from origin. Your <b>origin/*</b> labels are up to date, and <b>nothing in your own work moved</b>. " +
      "That is the whole difference between fetch and pull.", "out");
    draw();
  };

  CMDS.pull = function () {
    if (!S.remote) { say("No remote to pull from.", "err"); return; }
    if (S.head.type !== "branch") { say("You are not on a branch.", "err"); return; }
    var b = S.head.name;
    var theirs = remoteTip(b);
    if (theirs == null) { say("origin has no " + esc(b) + " yet.", "err"); return; }
    var mine = S.branches[b];
    S.didFetch = true;
    if (isAncestor(theirs, mine)) { say("Already up to date.", "out"); return; }
    if (isAncestor(mine, theirs)) {
      S.branches[b] = theirs;
      note("HEAD", "pull " + b + ": fast-forward");
      say("<b>Fast-forward.</b> You had nothing of your own, so your branch slid up to origin.", "out");
      draw(); return;
    }
    var id = commit("Merge branch '" + b + "' of origin", [mine, theirs]);
    note("HEAD", "pull " + b + ": merge");
    say("Pulled and merged: <b>" + id + "</b> joins your work to your teammate's. " +
      "A pull is a fetch and a merge in one step, which is why it can surprise you.", "out");
    draw();
  };

  /* ---------------------------------------------------------- GitHub, gh */

  var GH = {};

  GH.pr = function (a) {
    var verb = a[0];
    var b = S.head.type === "branch" ? S.head.name : null;

    if (verb === "create") {
      if (!S.remote) { say("Push to GitHub before opening a pull request.", "err"); return; }
      if (!b || b === "main") { say("A pull request proposes a branch into main, so make one and switch to it first.", "err"); return; }
      if (remoteTip(b) == null) { say("Push the branch first: <code>git push -u origin " + esc(b) + "</code>.", "err"); return; }
      S.prs[b] = { open: true };
      S.didOpenPR = true;
      say("Opened a pull request: <b>" + esc(b) + "</b> into <b>main</b>. " +
        "A pull request is a conversation about a branch, not a Git command: the commits are already on GitHub, " +
        "this asks for them to be merged.", "out");
      draw(); return;
    }

    if (verb === "merge") {
      var open = b && S.prs[b] && S.prs[b].open ? b : Object.keys(S.prs).filter(function (x) { return S.prs[x].open; })[0];
      if (!open) { say("No open pull request. <code>gh pr create</code> opens one.", "err"); return; }
      var head = remoteTip(open), base = remoteTip("main");
      if (base == null) { say("main is not on origin yet. Push it first.", "err"); return; }
      var id = nextId();
      S.commits[id] = { id: id, parents: [base, head], msg: "Merge pull request from " + open };
      S.order.push(id);
      S.remote.branches.main = id;
      S.prs[open].open = false;
      S.didMergePR = true;
      say("Merged the pull request. <b>origin/main</b> now has your work, but <b>your local main does not</b>. " +
        "That is the step people forget: <code>git switch main</code> then <code>git pull</code>.", "out");
      draw(); return;
    }

    say("This sandbox models <code>gh pr create</code> and <code>gh pr merge</code>.", "err");
  };

  CMDS.restore = function (a) {
    var f = a.filter(function (x) { return x[0] !== "-"; })[0];
    var staged = a.indexOf("--staged") !== -1;
    if (staged) {
      var n = Object.keys(S.staged).length;
      if (!n) { say("Nothing is staged.", "err"); return; }
      Object.keys(S.staged).forEach(function (x) { S.files[x] = "modified"; });
      S.staged = {};
      say("Unstaged " + n + " file" + (n === 1 ? "" : "s") + ". The changes are still in your working tree.", "out");
      draw(); return;
    }
    if (!f) { say("Which file? <code>git restore &lt;file&gt;</code>.", "err"); return; }
    if (S.files[f] == null) { say("No uncommitted change to <code>" + esc(f) + "</code>.", "err"); return; }
    delete S.files[f];
    say("Discarded your changes to <code>" + esc(f) + "</code>. " +
      "<b>This one is not recoverable</b>: the work was never committed, so Git never had a copy.", "out");
    draw();
  };

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
      S.didAmend = true;
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
    S.didCommit = true;
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
      S.switches = (S.switches || 0) + 1;
      note("HEAD", "checkout: moving to " + name);
      say("Switched to <b>" + esc(name) + "</b>.", "out");
      draw(); return;
    }
    var id = resolve(name);
    if (id) {
      S.head = { type: "detached", id: id };
      S.wasDetached = true;
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
      S.didFF = true;
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
    S.didRebase = true;
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
    if (mode === "--soft" && id !== was) S.didSoftReset = true;
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
    S.didCherryPick = true;
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
      if (a[0] === "pop") S.didStashPop = true;
      say("Restored your changes to the working tree.", "out"); return;
    }
    if (!dirty()) { say("No local changes to save.", "err"); return; }
    S.stash.unshift(S.files);
    S.files = {}; S.staged = {};
    say("Saved your changes on the shelf and cleaned the working tree. <code>git stash pop</code> brings them back.", "out");
  };

  /* ------------------------------------------------------- click and drag */

  // Clicking a commit explains exactly what it is and what still points at it.
  function inspect(id) {
    var c = S.commits[id];
    if (!c) return;
    var refs = Object.keys(S.branches).filter(function (b) { return S.branches[b] === id; });
    var tags = Object.keys(S.tags).filter(function (t) { return S.tags[t] === id; });
    var reachable = {};
    Object.keys(S.branches).forEach(function (b) {
      var anc = ancestors(S.branches[b]);
      Object.keys(anc).forEach(function (x) { reachable[x] = true; });
    });

    var bits = ["<b>" + id + "</b> " + esc(c.msg)];
    bits.push(c.parents.length === 0 ? "The root commit: it has no parent."
      : c.parents.length === 1 ? "Parent: " + c.parents[0]
      : "A merge, with two parents: " + c.parents.join(" and "));
    if (refs.length) bits.push("Pointed at by <b>" + refs.map(esc).join("</b>, <b>") + "</b>.");
    if (tags.length) bits.push("Tagged <b>" + tags.map(esc).join("</b>, <b>") + "</b>.");
    if (id === headId()) bits.push("This is where <b>HEAD</b> is: your next commit lands on top of it.");
    if (!reachable[id]) {
      bits.push('<span class="r">Nothing points at this one any more.</span> It is not deleted: ' +
        "<code>git reset --hard " + id + "</code> brings it back.");
    } else if (!refs.length) {
      bits.push("Reachable as history from a branch, so it is safe.");
    }
    say(bits.join("<br>"), "out");
  }

  // Drag anywhere on the canvas to move the graph around.
  (function enablePan() {
    var box = svg.parentNode;
    if (!box) return;
    var down = false, sx = 0, sy = 0, sl = 0, st = 0, moved = 0;

    box.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      down = true; moved = 0;
      sx = e.clientX; sy = e.clientY;
      sl = box.scrollLeft; st = box.scrollTop;
      box.classList.add("dragging");
    });
    box.addEventListener("pointermove", function (e) {
      if (!down) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
      box.scrollLeft = sl - dx;
      box.scrollTop = st - dy;
      if (moved > 4) e.preventDefault();
    });
    function end() { down = false; box.classList.remove("dragging"); }
    box.addEventListener("pointerup", end);
    box.addEventListener("pointerleave", end);
    box.addEventListener("pointercancel", end);

    // A drag that ends over a commit must not also count as a click on it.
    box.addEventListener("click", function (e) {
      if (moved > 4) { e.stopPropagation(); e.preventDefault(); moved = 0; }
    }, true);
  })();

  /* --------------------------------------------------------------- layout */

  var SVGNS = "http://www.w3.org/2000/svg";

  function el(n, at) {
    var e = document.createElementNS(SVGNS, n);
    for (var k in at) e.setAttribute(k, at[k]);
    return e;
  }

  var drawnBefore = {};

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
    if (S.remote) {
      Object.keys(S.remote.branches).forEach(function (b) {
        var anc = ancestors(S.remote.branches[b]);
        Object.keys(anc).forEach(function (id) { live[id] = true; });
      });
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
    if (S.remote) {
      Object.keys(S.remote.branches).forEach(function (b) { tips.push(S.remote.branches[b]); });
    }
    tips.forEach(function (tip) {
      var chain = [], cur = tip;
      while (cur && lane[cur] == null) { chain.push(cur); cur = S.commits[cur].parents[0]; }
      if (chain.length) { var l = next++; chain.forEach(function (id) { lane[id] = l; }); }
    });
    S.order.forEach(function (id) { if (lane[id] == null) lane[id] = next++; });

    // A commit can carry several pointers at once: HEAD, its branch, the matching
    // origin/branch, and any tags. They stack upward, so the top padding and the
    // lane spacing both have to be sized from the tallest stack actually present,
    // or the topmost label is clipped off the canvas.
    var stackAt = {};
    function bump(id) { if (id != null) stackAt[id] = (stackAt[id] || 0) + 1; }
    Object.keys(S.tags).forEach(function (t) { bump(S.tags[t]); });
    if (S.remote) Object.keys(S.remote.branches).forEach(function (b) { bump(S.remote.branches[b]); });
    Object.keys(S.branches).forEach(function (b) { bump(S.branches[b]); });
    bump(S.head.type === "branch" ? S.branches[S.head.name] : S.head.id);
    var maxStack = 1;
    Object.keys(stackAt).forEach(function (id) { if (stackAt[id] > maxStack) maxStack = stackAt[id]; });

    var LABEL_H = 30;                                   // one pointer and its gap
    var GX = 150;
    var PADY = 58 + (maxStack - 1) * LABEL_H;           // room above the top lane
    var GY = Math.max(132, maxStack * LABEL_H + 62);    // room between lanes
    var PADX = 80;
    var maxG = 0, maxL = 0;
    S.order.forEach(function (id) {
      if (gen[id] > maxG) maxG = gen[id];
      if (lane[id] > maxL) maxL = lane[id];
    });
    // The 48 below is the caption's height plus its descender.
    var W = Math.max(PADX * 2 + maxG * GX, 200), H = PADY + maxL * GY + 66;

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
          svg.appendChild(el("line", { x1: x1 + 20, y1: y1, x2: x2 - 20, y2: y2, class: cls }));
        } else {
          var mx = (x1 + x2) / 2;
          svg.appendChild(el("path", {
            d: "M" + (x1 + 18) + "," + y1 + " C" + mx + "," + y1 + " " + mx + "," + y2 + " " + (x2 - 18) + "," + y2,
            class: cls, fill: "none"
          }));
        }
      });
    });

    var hid = headId();
    S.order.forEach(function (id) {
      var c = S.commits[id];
      var gnode = el("g", { class: "pnode" + (live[id] ? "" : " ghost") + (c.parents.length > 1 ? " merge" : "") });
      // Newly arrived commits animate in, so cause and effect are obvious.
      if (!drawnBefore[id]) gnode.classList.add("pnew");
      gnode.appendChild(el("circle", { cx: X(id), cy: Y(id), r: 19 }));
      var t = el("text", { x: X(id), y: Y(id) + 5, "text-anchor": "middle", class: "phash" });
      t.textContent = id.slice(0, 4);
      gnode.appendChild(t);
      var m = el("text", { x: X(id), y: Y(id) + 42, "text-anchor": "middle", class: "pmsg" });
      m.textContent = c.msg.length > 16 ? c.msg.slice(0, 15) + "…" : c.msg;
      gnode.appendChild(m);
      var title = el("title");
      title.textContent = id + "  " + c.msg + (live[id] ? "" : "  (unreferenced: recoverable with git reflog)");
      gnode.appendChild(title);

      // A generous invisible target, so the commit is easy to hit by mouse.
      var hit = el("circle", { cx: X(id), cy: Y(id), r: 36, fill: "transparent", class: "phit" });
      gnode.insertBefore(hit, gnode.firstChild);
      gnode.setAttribute("tabindex", "0");
      gnode.setAttribute("role", "button");
      gnode.setAttribute("aria-label", "Commit " + id + ", " + c.msg);
      gnode.addEventListener("click", function () { inspect(id); });
      gnode.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inspect(id); }
      });
      svg.appendChild(gnode);
    });

    // Branch and tag pointers, stacked above their commit.
    var stack = {};
    function label(id, text, cls, onPick) {
      var k = id;
      stack[k] = (stack[k] || 0) + 1;
      var y = Y(id) - 38 - (stack[k] - 1) * 30;
      var w = Math.max(42, text.length * 8.4 + 18);
      var gl = el("g", { class: cls });
      gl.appendChild(el("rect", { x: X(id) - w / 2, y: y - 16, width: w, height: 26, rx: 6 }));
      var tx = el("text", { x: X(id), y: y + 2, "text-anchor": "middle" });
      tx.textContent = text;
      gl.appendChild(tx);
      if (onPick) {
        gl.insertBefore(el("rect", { x: X(id) - w / 2 - 6, y: y - 19, width: w + 12, height: 32,
                                     fill: "transparent", class: "phit" }), gl.firstChild);
        gl.setAttribute("tabindex", "0");
        gl.setAttribute("role", "button");
        gl.setAttribute("aria-label", "Switch to branch " + text);
        gl.addEventListener("click", onPick);
        gl.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); }
        });
        gl.classList.add("pclick");
      }
      svg.appendChild(gl);
    }
    if (S.remote) {
      Object.keys(S.remote.branches).forEach(function (b) {
        var at = S.remote.branches[b];
        if (S.commits[at]) label(at, "origin/" + b, "premote");
      });
    }
    Object.keys(S.tags).forEach(function (t) { label(S.tags[t], t, "ptag"); });
    names.forEach(function (n) {
      var on = S.head.type === "branch" && S.head.name === n;
      label(S.branches[n], n, "pbranch" + (on ? " on" : ""), on ? null : function () {
        S.head = { type: "branch", name: n };
        S.switches = (S.switches || 0) + 1;
        note("HEAD", "checkout: moving to " + n);
        say("Switched to <b>" + esc(n) + "</b>, the same as <code>git switch " + esc(n) + "</code>.", "out");
        draw();
      });
    });
    if (S.head.type === "detached") label(S.head.id, "HEAD", "pbranch on detached");
    else label(S.branches[S.head.name], "HEAD", "phead");

    var nc = Object.keys(S.commits).length, nb = Object.keys(S.branches).length;
    statusEl.innerHTML = "On <b>" + esc(headName()) + "</b> · " +
      nc + (nc === 1 ? " commit" : " commits") + " · " +
      nb + (nb === 1 ? " branch" : " branches") +
      (dirty() ? ' · <span class="r">uncommitted changes</span>' : "") +
      (function () {
        if (!S.remote || S.head.type !== "branch") return "";
        var b = S.head.name, t = remoteTip(b);
        if (t == null) return ' · <span class="r">not on GitHub yet</span>';
        if (t === S.branches[b]) return " · in sync with origin";
        if (isAncestor(t, S.branches[b])) return ' · <span class="r">ahead of origin</span>';
        return ' · <span class="r">behind origin</span>';
      })();

    drawnBefore = {};
    S.order.forEach(function (id) { drawnBefore[id] = true; });

    checkLessons();
  }

  /* ------------------------------------------------------------- the course */

  /* Sixteen lessons in five chapters, ordered so nothing depends on something
     you have not met yet. Each states its goal in plain language, says why it is
     worth knowing, and checks the repository rather than the typing, so any
     route to the right end state counts. */
  var CHAPTERS = [
    { n: 1, name: "First steps",     blurb: "What a commit actually is" },
    { n: 2, name: "Branching",       blurb: "Working on more than one thing" },
    { n: 3, name: "Undoing safely",  blurb: "Three undos, and when each is right" },
    { n: 4, name: "Rewriting",       blurb: "Changing history, and the rule that governs it" },
    { n: 5, name: "Everyday extras", blurb: "The rest of what you will reach for" },
    { n: 6, name: "Git meets GitHub", blurb: "Publishing, pull requests, and the push that gets rejected" }
  ];

  var LESSONS = [
    { id: "first-commit", ch: 1, t: "Make your first commit",
      goal: "Get one change of your own into the history.",
      why: "A commit is a snapshot plus a message. Nothing enters history until you make one.",
      hint: "Three moves: <code>edit app.js</code>, then <code>git add .</code>, then <code>git commit -m \"Add app\"</code>.",
      done: "That is the whole loop: change, stage, commit. Everything else is built on it.",
      ok: function () { return !!S.didCommit; } },

    { id: "status-and-log", ch: 1, t: "Look before you leap",
      goal: "Run the two commands that tell you where you stand.",
      why: "status answers what is changed right now; log answers what happened before. Between them you are never lost.",
      hint: "<code>git status</code> and <code>git log</code>.",
      done: "Those two are your compass. When Git confuses you, reach for them first.",
      ok: function () { return S.used.status && S.used.log; } },

    { id: "restore-uncommitted", ch: 1, t: "Throw away an uncommitted change",
      goal: "Edit a file, then discard that edit without committing it.",
      why: "Work that was never committed is the one thing Git cannot get back for you. Learn where that line sits.",
      hint: "<code>edit notes.txt</code>, then <code>git restore notes.txt</code>.",
      done: "Note the asymmetry: committed work is nearly always recoverable, uncommitted work is not.",
      ok: function () { return !!S.used.restore; } },

    { id: "branch-and-commit", ch: 2, t: "Start a branch and commit on it",
      goal: "Create a branch, move onto it, and add a commit there.",
      why: "A branch is a movable label pointing at one commit. Creating one copies nothing and costs nothing.",
      hint: "<code>git switch -c feature</code>, then edit, add, and commit.",
      done: "Nothing was duplicated. You added a second label and moved it forward.",
      ok: function () {
        return Object.keys(S.branches).some(function (b) {
          return b !== "main" && S.branches[b] !== S.branches.main &&
                 !isAncestor(S.branches[b], S.branches.main);
        });
      } },

    { id: "switch-branches", ch: 2, t: "Move between branches",
      goal: "Switch to another branch and back again.",
      why: "Switching points HEAD at a different label. Your other work is not lost, it is simply not checked out.",
      hint: "<code>git switch main</code> and <code>git switch feature</code>. Clicking a branch label in the graph does the same.",
      done: "HEAD is just which label you are standing on.",
      ok: function () { return (S.switches || 0) >= 2; } },

    { id: "fast-forward", ch: 2, t: "Merge with a fast-forward",
      goal: "Merge a branch into main while main has no commits of its own.",
      why: "When nothing has diverged, Git slides the label forward and creates no merge commit. People are often surprised by that.",
      hint: "From an unchanged main: <code>git merge feature</code>.",
      done: "A fast-forward is less a merge than a catch-up.",
      ok: function () { return !!S.didFF; } },

    { id: "real-merge", ch: 2, t: "Make a real merge commit",
      goal: "Let main and a branch each gain a commit, then merge them.",
      why: "When both sides have moved, Git records a commit with two parents. That is what preserves the true shape of the work.",
      hint: "Commit on main, commit on the branch, then <code>git merge feature</code> from main.",
      done: "Two parents. Both histories survive exactly as they happened.",
      ok: function () {
        return Object.keys(S.commits).some(function (id) {
          return S.commits[id].parents.length > 1 && isAncestor(id, S.branches.main);
        });
      } },

    { id: "revert", ch: 3, t: "Undo a commit the safe way",
      goal: "Cancel a commit without removing it from history.",
      why: "revert adds a commit that reverses an old one. It rewrites nothing, which makes it the only safe undo once others have your work.",
      hint: "<code>git revert HEAD</code>.",
      done: "This is the undo for a shared branch. It is honest: the mistake and its reversal both stay visible.",
      ok: function () {
        return Object.keys(S.commits).some(function (id) { return /^Revert /.test(S.commits[id].msg); });
      } },

    { id: "soft-reset", ch: 3, t: "Uncommit, but keep the work",
      goal: "Drop the last commit while keeping its changes.",
      why: "Committed too early, or with the wrong message? A soft reset moves the label back and leaves everything else alone.",
      hint: "<code>git reset --soft HEAD~1</code>.",
      done: "The commit is gone from the branch; the work is not gone from you.",
      ok: function () { return !!S.didSoftReset; } },

    { id: "rescue-with-reflog", ch: 3, t: "Abandon a commit, then rescue it",
      goal: "Throw a commit away with a hard reset, then bring it back.",
      why: "The most reassuring fact in Git: a hard reset does not delete commits, it stops pointing at them.",
      hint: "<code>git reset --hard HEAD~1</code>, then <code>git reflog</code>. <code>HEAD@{0}</code> is where you are now, so the hash you want is below it.",
      done: "Nothing was destroyed. The reflog is the safety net under almost every Git mistake.",
      ok: function () { return !!S.rescued; } },

    { id: "amend", ch: 4, t: "Amend the last commit",
      goal: "Change the most recent commit instead of adding another.",
      why: "Amend does not edit a commit. It builds a replacement and abandons the original, which is why amending after a push needs a force.",
      hint: "<code>git commit --amend -m \"A better message\"</code>.",
      done: "Look at the hash: it changed. That is exactly why amend counts as rewriting history.",
      ok: function () { return !!S.didAmend; } },

    { id: "rebase", ch: 4, t: "Rebase instead of merging",
      goal: "Replay a branch on top of main so the history is a straight line.",
      why: "Rebase copies your commits onto a new base. Same changes, new hashes, originals left behind.",
      hint: "From a branch that has diverged: <code>git rebase main</code>.",
      done: "The faded circles are your originals. Because the hashes changed, never rebase work someone else already has.",
      ok: function () { return !!S.didRebase; } },

    { id: "cherry-pick", ch: 4, t: "Take one commit from elsewhere",
      goal: "Copy a single commit onto your current branch.",
      why: "Cherry-pick is the answer to work committed on the wrong branch. It copies the change and leaves the original in place.",
      hint: "<code>git log</code> for a hash, then <code>git cherry-pick &lt;hash&gt;</code>.",
      done: "One commit, copied. The everyday use is a hotfix, or a commit that landed in the wrong place.",
      ok: function () { return !!S.didCherryPick; } },

    { id: "stash", ch: 5, t: "Park work you cannot commit yet",
      goal: "Stash a change, then bring it back.",
      why: "A stash is a shelf. It gets you to a clean tree without inventing a commit you did not mean to make.",
      hint: "Edit a file, then <code>git stash</code>, then <code>git stash pop</code>.",
      done: "Label your stashes in real life. An unnamed stash is a mystery by Thursday.",
      ok: function () { return !!S.didStashPop; } },

    { id: "tag", ch: 5, t: "Mark a release with a tag",
      goal: "Put a tag on a commit.",
      why: "A tag is a label that does not move. A branch follows you forward; a tag stays where you put it.",
      hint: "<code>git tag v1.0</code>.",
      done: "That is the distinction worth keeping: branches move, tags do not.",
      ok: function () { return Object.keys(S.tags).length > 0; } },

    { id: "detached-head", ch: 5, t: "Detach HEAD, and get back",
      goal: "Check out a commit directly, then return to a branch.",
      why: "Detached HEAD is not an error. You are standing on a commit rather than a branch, and commits made there belong to nothing.",
      hint: "<code>git switch HEAD~1</code> to detach, then <code>git switch main</code> to return.",
      done: "Just a place to visit. Commit while detached and you need a branch to keep the work.",
      ok: function () { return !!S.wasDetached && S.head.type === "branch"; } },

    { id: "clone", ch: 6, t: "Start from a repository that already exists",
      goal: "Clone a repository and see what you were given.",
      why: "Most people meet Git by cloning, not by starting empty. A clone brings the whole history, not a snapshot, and configures the remote and tracking for you.",
      hint: "<code>git clone https://github.com/you/project.git</code>, then <code>git log</code> to see the history came too.",
      done: "Everything a new repository needs, in one command: full history, origin configured, and main already tracking origin/main.",
      ok: function () { return !!S.used.clone; } },

    { id: "remote-add", ch: 6, t: "Connect your repository to GitHub",
      goal: "Add a remote called origin.",
      why: "Git works perfectly with no server at all. A remote is just an address you have given a nickname, and adding one sends nothing.",
      hint: "<code>git remote add origin https://github.com/you/project.git</code>, then <code>git remote -v</code> to see it.",
      done: "origin is only a nickname for a URL. Your history is still entirely local until you push.",
      ok: function () { return !!S.remote; } },

    { id: "push", ch: 6, t: "Publish your work",
      goal: "Push a branch to GitHub and set it to track.",
      why: "Pushing copies commits to the remote and moves the remote's branch label. The origin/main you see is your record of where GitHub was.",
      hint: "<code>git push -u origin main</code>.",
      done: "The -u sets tracking, so plain git push and git pull know where to go from now on.",
      ok: function () { return !!S.didPush; } },

    { id: "pull-request", ch: 6, t: "Open a pull request",
      goal: "Push a branch, then propose it into main.",
      why: "A pull request is not a Git command. The commits are already on GitHub; a pull request asks for them to be merged, and gives people somewhere to talk about it.",
      hint: "<code>git switch -c feature</code>, commit something, <code>git push -u origin feature</code>, then <code>gh pr create</code>.",
      done: "Review happens on the branch you pushed. New commits pushed to that branch join the same pull request.",
      ok: function () { return !!S.didOpenPR; } },

    { id: "merge-pr", ch: 6, t: "Merge it, and bring it home",
      goal: "Merge the pull request, then get the result into your local main.",
      why: "Merging on GitHub moves origin/main. Your own main knows nothing about it until you pull. This is the step people forget.",
      hint: "<code>gh pr merge</code>, then <code>git switch main</code> and <code>git pull</code>.",
      done: "Two separate places moved: GitHub's main, then yours. They are never the same thing.",
      ok: function () {
        return !!S.didMergePR && S.remote && S.branches.main === S.remote.branches.main;
      } },

    { id: "rejected-push", ch: 6, t: "Survive a rejected push",
      goal: "Let a teammate push, watch your push be refused, then resolve it.",
      why: "The most common wall in real work. Git refuses because origin has a commit you do not, and forcing would erase it.",
      hint: "<code>teammate</code> pushes for you. Commit something yourself, try <code>git push</code>, then <code>git pull</code> and push again.",
      done: "Rejection is Git protecting someone else's work. Pull, resolve, push. Force is almost never the answer.",
      ok: function () { return !!S.didPullAfterReject; } }
  ];

  /* --------------------------------------------------------------- progress */

  var STORE = "gg-play-progress";

  /* Progress is stored against each lesson's id, never its position. Storing
     positions meant that inserting a lesson silently reassigned everyone's
     completed work to the wrong lessons. */
  function loadProgress() {
    try {
      var raw = window.localStorage.getItem(STORE);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (Object.prototype.toString.call(saved) === "[object Array]") {
        // The old format was an array of flags by position. Read it once so
        // nobody loses progress in the upgrade, then it is rewritten by id.
        saved.forEach(function (v, i) { if (v && LESSONS[i]) solved[i] = true; });
        return;
      }
      LESSONS.forEach(function (l, i) { if (saved[l.id]) solved[i] = true; });
    } catch (e) { /* private mode or a corrupt value: just start fresh */ }
  }

  function saveProgress() {
    try {
      var byId = {};
      LESSONS.forEach(function (l, i) { if (solved[i]) byId[l.id] = 1; });
      window.localStorage.setItem(STORE, JSON.stringify(byId));
    } catch (e) { /* progress simply will not persist */ }
  }

  function doneCount() {
    return LESSONS.reduce(function (n, _, i) { return n + (solved[i] ? 1 : 0); }, 0);
  }

  function firstUnsolved() {
    for (var i = 0; i < LESSONS.length; i++) if (!solved[i]) return i;
    return -1;
  }

  /* ------------------------------------------------------------- lesson view */

  function set(id, text) {
    var e = document.getElementById(id);
    if (e) e.textContent = text;
  }

  function renderLesson() {
    var k = LESSONS[task];
    var ch = CHAPTERS[k.ch - 1];
    var n = doneCount();

    set("lsn-chapter", "Chapter " + ch.n + " of " + CHAPTERS.length + ": " + ch.name);
    set("lsn-title", (task + 1) + ". " + k.t);
    set("lsn-goal", k.goal);
    set("lsn-why", k.why);
    set("lsn-count", n + " of " + LESSONS.length);

    var fill = document.getElementById("lsn-fill");
    if (fill) fill.style.width = Math.round(n / LESSONS.length * 100) + "%";
    var bar = document.getElementById("lsn-bar");
    if (bar) {
      bar.setAttribute("aria-valuenow", n);
      bar.setAttribute("aria-valuemax", LESSONS.length);
    }

    var hint = document.getElementById("lsn-hint-text");
    if (hint) { hint.innerHTML = k.hint; hint.hidden = true; }
    var hbtn = document.getElementById("lsn-hint");
    if (hbtn) { hbtn.textContent = "Show me how"; hbtn.setAttribute("aria-expanded", "false"); }

    var badge = document.getElementById("lsn-state");
    if (badge) {
      badge.textContent = solved[task] ? "Done" : "Not yet";
      badge.className = "lsn-state" + (solved[task] ? " is-done" : "");
    }

    var prev = document.getElementById("lsn-prev");
    var next = document.getElementById("lsn-next");
    if (prev) prev.disabled = task === 0;
    if (next) next.disabled = task === LESSONS.length - 1;

    renderMap();
  }

  function renderMap() {
    var map = document.getElementById("lsn-map");
    if (!map) return;
    map.innerHTML = "";
    CHAPTERS.forEach(function (ch) {
      var col = document.createElement("div");
      col.className = "lsn-chap";

      var mine = LESSONS.filter(function (l) { return l.ch === ch.n; });
      var mineDone = LESSONS.filter(function (l, i) { return l.ch === ch.n && solved[i]; }).length;

      var h = document.createElement("p");
      h.className = "lsn-chap-h" + (mineDone === mine.length ? " is-done" : "");
      h.textContent = ch.n + ". " + ch.name;
      col.appendChild(h);

      var sub = document.createElement("p");
      sub.className = "lsn-chap-b";
      sub.textContent = ch.blurb;
      col.appendChild(sub);

      LESSONS.forEach(function (l, i) {
        if (l.ch !== ch.n) return;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "lsn-step" + (solved[i] ? " is-done" : "") + (i === task ? " is-now" : "");
        b.textContent = l.t;
        if (i === task) b.setAttribute("aria-current", "step");
        b.addEventListener("click", function () { task = i; renderLesson(); });
        col.appendChild(b);
      });
      map.appendChild(col);
    });
  }

  function checkLessons() {
    var fresh = [];
    LESSONS.forEach(function (l, i) {
      var pass = false;
      try { pass = !!l.ok(); } catch (e) { pass = false; }
      if (!solved[i] && pass) { solved[i] = true; fresh.push(i); }
    });
    if (fresh.length) {
      saveProgress();
      // One command can satisfy more than one lesson. Say so for each, or the
      // learner silently loses credit they earned.
      fresh.forEach(function (i) {
        say('<b class="g">Lesson ' + (i + 1) + " done: " + esc(LESSONS[i].t) + ".</b> " + LESSONS[i].done, "win");
      });
      // A finished chapter is worth marking; it is the unit of real progress.
      var chapsDone = {};
      fresh.forEach(function (i) {
        var c = LESSONS[i].ch;
        var all = LESSONS.every(function (l, j) { return l.ch !== c || solved[j]; });
        if (all) chapsDone[c] = true;
      });
      Object.keys(chapsDone).forEach(function (c) {
        var ch = CHAPTERS[+c - 1];
        say('<b class="g">Chapter ' + c + " complete: " + esc(ch.name) + ".</b> " + esc(ch.blurb) + ".", "cheer");
      });

      var n = doneCount();
      if (n === LESSONS.length) {
        say('<b class="g">All ' + LESSONS.length + " lessons complete.</b> You have committed, branched, merged, " +
            "reverted, reset, rescued abandoned work, rebased, cherry-picked, stashed, tagged, detached HEAD, " +
            "published to GitHub, opened and merged a pull request, and recovered from a rejected push. " +
            "By hand, on a real graph. That is more of Git than most people touch in a year of using it.", "win");
      } else if (fresh.indexOf(task) !== -1) {
        // Only move on if the lesson they were actually looking at is the one
        // that landed; otherwise leave them where they are.
        var nxt = firstUnsolved();
        if (nxt !== -1) task = nxt;
      }
    }
    renderLesson();
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

  /* Suggestions as you type. Nobody can use a terminal they cannot guess at,
     and a beginner does not know that "switch" exists to be typed. */
  var sugBox = document.getElementById("psuggest");

  function suggestionsFor(text) {
    var q = text.trim().toLowerCase();
    if (!q) return [];
    var starts = [], contains = [];
    VOCAB.forEach(function (v) {
      var c = v[0].toLowerCase();
      if (c.indexOf(q) === 0) starts.push(v);
      else if (c.indexOf(q) !== -1) contains.push(v);
    });
    return starts.concat(contains).slice(0, 5);
  }

  function renderSuggestions() {
    if (!sugBox) return;
    var list = suggestionsFor(inEl.value);
    sugBox.innerHTML = "";
    if (!list.length || !inEl.value.trim()) { sugBox.hidden = true; return; }
    if (list.length === 1 && list[0][0] === inEl.value.trim()) { sugBox.hidden = true; return; }
    list.forEach(function (v) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "psug";
      b.innerHTML = "<code>" + esc(v[0]) + "</code><span>" + esc(v[1]) + "</span>";
      b.addEventListener("mousedown", function (e) {
        e.preventDefault();
        inEl.value = v[0];
        renderSuggestions();
        inEl.focus();
      });
      sugBox.appendChild(b);
    });
    sugBox.hidden = false;
  }

  function hideSuggestions() { if (sugBox) { sugBox.hidden = true; } }

  var hist = [], hi = -1;

  inEl.addEventListener("input", renderSuggestions);
  inEl.addEventListener("blur", function () { window.setTimeout(hideSuggestions, 120); });

  inEl.addEventListener("keydown", function (e) {
    if (e.key === "Tab") {
      var list = suggestionsFor(inEl.value);
      if (list.length) {
        e.preventDefault();
        inEl.value = list[0][0];
        renderSuggestions();
      }
      return;
    }
    if (e.key === "Escape") { hideSuggestions(); return; }
    if (e.key === "Enter") {
      var v = inEl.value.trim();
      if (!v) return;
      say('<span class="p">$</span> ' + esc(v), "cmd");
      hist.unshift(v); hi = -1;
      inEl.value = "";
      hideSuggestions();
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
    if (e.target.closest("#preset")) { past = []; reset(); draw(); return; }
    if (e.target.closest("#pundo")) { undo(); return; }

    if (e.target.closest("#lsn-next")) {
      if (task < LESSONS.length - 1) { task += 1; renderLesson(); }
      return;
    }
    if (e.target.closest("#lsn-prev")) {
      if (task > 0) { task -= 1; renderLesson(); }
      return;
    }
    // Any command shown in a hint runs on click. It is the difference between
    // reading a tutorial and doing one.
    var runnable = e.target.closest(".lsn-hint-text code, .pnotes code");
    if (runnable) {
      var text = runnable.textContent.trim();
      if (/^(git|gh|edit|teammate) /.test(text) || text === "teammate") {
        inEl.value = text;
        inEl.focus();
        say('<span class="p">$</span> ' + esc(text), "cmd");
        try { run(text); } catch (err) { say("The sandbox tripped over that one.", "err"); }
        inEl.value = "";
        return;
      }
    }

    if (e.target.closest("#lsn-hint")) {
      var box = document.getElementById("lsn-hint-text");
      var btn = document.getElementById("lsn-hint");
      if (box) {
        box.hidden = !box.hidden;
        btn.textContent = box.hidden ? "Show me how" : "Hide the hint";
        btn.setAttribute("aria-expanded", box.hidden ? "false" : "true");
      }
      return;
    }
    if (e.target.closest("#lsn-clear")) {
      solved = [];
      saveProgress();
      task = 0;
      reset();
      draw();
      say("Progress cleared. Starting again from lesson one.", "sys");
      return;
    }
  });

  loadProgress();
  var resume = firstUnsolved();
  task = resume === -1 ? 0 : resume;
  reset();
  draw();
})();
