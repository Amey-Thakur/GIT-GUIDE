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
  var promptEl = document.getElementById("pprompt");

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
      content: {},        // file -> the line currently in the working tree
      tracked: {},        // file -> true once Git is following it
      removed: {},        // file -> true when a deletion is staged
      edits: 0,           // so successive edits are visibly different
      staged: {},
      stash: [],
      reflog: [],
      rescued: false,
      drill: null,       // { target, at, helped } while the recovery drill runs
      used: {},          // which commands have been run at least once
      switches: 0,       // branch switches, for the "move between branches" lesson
      didFF: false, didSoftReset: false, didAmend: false, didRebase: false,
      didCherryPick: false, didStashPop: false, wasDetached: false, didCommit: false,
      merging: null,     // { from, files: {name: 'conflict'|'resolved'} } mid-conflict
      didResolveConflict: false,
      remote: null,      // { url, branches: {name: commitId} } once origin exists
      upstream: {},      // local branch -> true when it tracks origin
      prs: {},           // open pull requests, keyed by branch
      didPush: false, didFetch: false, didPullAfterReject: false,
      pushRejected: false, didOpenPR: false, didMergePR: false
    };
    S.commits[root] = { id: root, parents: [], msg: "Initial commit", files: [], snap: {} };
    S.order.push(root);
    // The legend shows a hash that is really on the graph, so what it explains is
    // the thing being looked at.
    var lgh = document.getElementById("lg-hash");
    if (lgh) lgh.textContent = root.slice(0, 4);
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
    if (S.drill) {
      say("Not during the drill. Git has no undo button on the day this happens, " +
        "which is the whole reason the drill exists. <code>git reflog</code>.", "err");
      return;
    }
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

  function commit(msg, parents, files) {
    var id = nextId();
    var snap = {};
    (files || []).forEach(function (f) { if (S.content[f] != null) snap[f] = S.content[f]; });
    S.commits[id] = { id: id, parents: parents, msg: msg, files: files || [], snap: snap };
    S.order.push(id);
    if (S.head.type === "branch") S.branches[S.head.name] = id;
    else S.head.id = id;
    return id;
  }

  /* The most recent commit both branches share. Breadth-first from one side
     until it meets an ancestor of the other, which is close enough to Git's
     answer for a teaching model. */
  function mergeBase(a, b) {
    var ancA = ancestors(a);
    var queue = [b], seen = {};
    while (queue.length) {
      var c = queue.shift();
      if (!c || seen[c]) continue;
      seen[c] = true;
      if (ancA[c]) return c;
      var cm = S.commits[c];
      if (cm) queue.push.apply(queue, cm.parents);
    }
    return null;
  }

  // Which files a side has touched since the two branches parted.
  function touchedSince(tip, base) {
    var out = {}, queue = [tip], seen = {};
    while (queue.length) {
      var c = queue.shift();
      if (!c || seen[c] || c === base) continue;
      seen[c] = true;
      var cm = S.commits[c];
      if (!cm) continue;
      (cm.files || []).forEach(function (f) { out[f] = true; });
      queue.push.apply(queue, cm.parents);
    }
    return out;
  }

  // Every path any reachable commit has ever recorded.
  function filesAt(tip) {
    var out = {}, seen = {}, queue = [tip];
    while (queue.length) {
      var id = queue.shift();
      if (!id || seen[id]) continue;
      seen[id] = true;
      var c = S.commits[id];
      if (!c) continue;
      (c.files || []).forEach(function (f) { out[f] = true; });
      queue.push.apply(queue, c.parents);
    }
    return out;
  }

  /* Moving HEAD moves your files with it: that is the part of checkout people
     forget, and it is why a dirty working tree makes Git hesitate. Work you have
     not committed is yours rather than the commit's, so it survives the move,
     which is what Git does whenever it can. */
  function syncWorktree() {
    var tip = headId();
    var content = {}, tracked = {};
    Object.keys(filesAt(tip)).forEach(function (f) {
      tracked[f] = true;
      var body = contentAt(tip, f);
      if (body != null) content[f] = body;
    });
    Object.keys(S.files).forEach(function (f) {
      if (S.content[f] != null) content[f] = S.content[f];
      if (S.files[f] === "modified") tracked[f] = true;
    });
    Object.keys(S.staged).forEach(function (f) {
      if (S.content[f] != null) content[f] = S.content[f];
      tracked[f] = true;
    });
    S.content = content;
    S.tracked = tracked;
  }

  /* The most recent version of a file reachable from a commit. Walks first
     parents, which is enough for the shapes this sandbox can build. */
  function contentAt(tip, file) {
    var seen = {}, queue = [tip];
    while (queue.length) {
      var id = queue.shift();
      if (!id || seen[id]) continue;
      seen[id] = true;
      var c = S.commits[id];
      if (!c) continue;
      if (c.snap && c.snap[file] != null) return c.snap[file];
      queue.push.apply(queue, c.parents);
    }
    return null;
  }

  var NL = String.fromCharCode(10);
  var MARK_START = "<<<<<<< HEAD";
  var MARK_MID = "=======";

  function markerText(file, ours, theirs, from) {
    return MARK_START + "\n" + (ours == null ? "" : ours) + "\n" +
           MARK_MID + "\n" + (theirs == null ? "" : theirs) + "\n" +
           ">>>>>>> " + from;
  }

  function stillMarked(text) {
    return text.indexOf(MARK_START) !== -1 || text.indexOf(MARK_MID) !== -1 ||
           text.indexOf(">>>>>>>") !== -1;
  }

  function conflictFiles() {
    return S.merging ? Object.keys(S.merging.files) : [];
  }

  function unresolved() {
    return conflictFiles().filter(function (f) { return S.merging.files[f] === "conflict"; });
  }

  // Almost nothing is allowed to proceed while a merge is half-finished, which
  // is exactly how Git behaves and the part people find bewildering.
  function blockedByMerge(what) {
    if (!S.merging) return false;
    say("You are in the middle of a merge, so <b>" + esc(what) + "</b> will not run. " +
      "Finish it (<code>git add &lt;file&gt;</code> then <code>git commit</code>) " +
      "or walk away from it (<code>git merge --abort</code>).", "err");
    return true;
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
    ["git checkout --ours <file>", "in a conflict, keep your side"],
    ["git checkout --theirs <file>", "in a conflict, take the other side"],
    ["git merge --abort", "walk away from a conflicted merge"],
    ["git rebase <branch>", "replay your commits onto another base"],
    ["git cherry-pick <hash>", "copy one commit to here"],
    ["git revert HEAD", "add a commit that undoes the last one"],
    ["git reset --soft HEAD~1", "drop the commit, keep the work"],
    ["git reset --hard HEAD~1", "drop the commit and the work"],
    ["git reflog", "everywhere HEAD has been, including what you abandoned"],
    ["git stash", "shelve your changes"],
    ["git stash pop", "take them back off the shelf"],
    ["git stash list", "what is on the shelf"],
    ["git stash drop", "throw the top entry away, with no way back"],
    ["git tag <name>", "a label that does not move"],
    ["git tag -d <name>", "delete a tag here, not on the remote"],
    ["git clone <url>", "copy an existing repository, history and all"],
    ["git remote add origin <url>", "connect a GitHub repository"],
    ["git push -u origin <branch>", "publish a branch and track it"],
    ["git fetch", "update your origin labels, change nothing else"],
    ["git pull", "fetch, then merge"],
    ["gh pr create", "open a pull request for this branch"],
    ["gh pr merge", "merge the open pull request"],
    ["git diff", "what changed, line by line"],
    ["git diff --staged", "what the next commit would record"],
    ["git show HEAD", "one commit in full"],
    ["git blame <file>", "which commit last touched it, and why"],
    ["git grep <text>", "search what Git tracks"],
    ["git ls-files", "every path Git is following"],
    ["git rev-parse HEAD", "the hash a name points at"],
    ["git describe", "name this commit by the last tag behind it"],
    ["git shortlog", "the history grouped by author"],
    ["git rm --cached <file>", "stop tracking a file, keep it on disk"],
    ["git mv <from> <to>", "rename a tracked file"],
    ["git clean -n", "list the untracked files this would delete"],
    ["git fsck", "the commits nothing points at any more"],
    ["git config user.name", "who Git stamps on your commits"],
    ["teammate", "a colleague pushes, so you can meet a rejected push"],
    ["ls", "what is in the folder"],
    ["cat <file>", "read a file, markers and all"],
    ["pwd", "where you are"],
    ["undo", "step the sandbox back one command"],
    ["reset", "start the sandbox over"],
    ["clear", "clear the screen, the same as Command K or Control L"]
  ];

  function showHelp() {
    say("<b>Everything this sandbox understands.</b> Click any one to run it.<br>" +
      VOCAB.map(function (v) {
        return '<code>' + esc(v[0]) + "</code> <span class=\"m\">" + esc(v[1]) + "</span>";
      }).join("<br>"), "out");
  }

  /* ------------------------------------------------------------- commands */

  function run(line) {
    try { runCommand(line); } finally { drawPrompt(); }
  }

  function runCommand(line) {
    var t = tokenize(line);
    if (!t.length) return;

    if (t[0] === "clear") { clear(); return; }
    if (t[0] === "reset" && t.length === 1) { endDrill(); reset(); draw(); return; }

    // A stand-in for editing a file in your editor. Not a Git command, and labelled as such.
    if (t[0] === "edit" || t[0] === "touch") {
      snapshot();
      var f = t[1] || "notes.txt";
      S.files[f] = (S.tracked[f] || S.files[f] === "modified") ? "modified" : "untracked";
      S.edits += 1;
      var whose = S.head.type === "branch" ? S.head.name : "a detached HEAD";
      S.content[f] = 'title = "written on ' + whose + ', edit ' + S.edits + '"';
      say("Edited <code>" + esc(f) + "</code>, which now reads:<br>" +
        "<code>" + esc(S.content[f]) + "</code><br>" +
        "Not a Git command: this stands for changing the file in your editor.", "sys");
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

    if (SHELL[t[0]]) { SHELL[t[0]](t.slice(1)); return; }

    if (t[0] !== "git") {
      say("Commands start with <code>git</code> or <code>gh</code>. There is also <code>edit &lt;file&gt;</code>, " +
        "<code>teammate</code>, and <code>clear</code>.", "err");
      return;
    }

    var cmd = t[1], a = t.slice(2);
    var fn = CMDS[cmd];
    /* Commands that only read never need a snapshot, and filling undo with them
       makes the undo button useless. The second group reads when bare and writes
       when given an argument. */
    var READS = { status: 1, log: 1, reflog: 1, diff: 1, show: 1, blame: 1, grep: 1,
                  fsck: 1, gc: 1, bisect: 1, describe: 1, shortlog: 1, help: 1, init: 1,
                  "ls-files": 1, "rev-parse": 1 };
    var READS_BARE = { branch: 1, remote: 1, tag: 1, config: 1 };
    if (fn && !READS[cmd] && !(READS_BARE[cmd] && a.length === 0)) snapshot();
    if (fn) S.used[cmd] = true;

    if (!fn) {
      if (!cmd) {
        say("<code>git</code> on its own does nothing. Type <code>help</code> for " +
          "everything here.", "err");
        return;
      }
      if (EXPLAIN[cmd]) {
        say("<code>git " + esc(cmd) + "</code> " + EXPLAIN[cmd] +
          '<br><span class="m">Real, and not modelled here. Type <code>help</code> for ' +
          "what this sandbox does run.</span>", "sys");
        return;
      }
      var mean = didYouMean(cmd);
      say("<code>git " + esc(cmd) + "</code> is not a Git command." +
        (mean ? " Did you mean <code>git " + esc(mean) + "</code>?" : "") +
        '<br><span class="m">Type <code>help</code> for everything this sandbox ' +
        "understands.</span>", "err");
      return;
    }
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
    S.commits[id] = { id: id, parents: [base], msg: "Teammate's fix", files: [], snap: {} };
    S.order.push(id);
    S.remote.branches[b] = id;
    say("A teammate pushed <b>" + id + "</b> to <b>origin/" + esc(b) + "</b>. " +
      "Your local branch has not moved, so the two have now diverged.", "out");
    draw();
  }

  CMDS.clone = function (a) {
    var url = a.filter(function (x) { return x[0] !== "-"; })[0] ||
              "https://github.com/Amey-Thakur/GIT-GUIDE.git";
    // Cloning replaces whatever is here, exactly as it would in a fresh folder.
    past = [];
    reset(true);
    S.commits[S.branches.main].msg = "Initial commit";
    /* A clone that arrives empty is no use to ls, cat or blame, and those are
       among the first things anyone tries after their first clone. */
    [["README.md", "# GIT-GUIDE", "Add README"],
     [".gitignore", "node_modules/", "Ignore build output"]].forEach(function (r) {
      S.content[r[0]] = r[1];
      S.tracked[r[0]] = true;
      commit(r[2], [headId()], [r[0]]);
    });
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
      var url = a[2] || "https://github.com/Amey-Thakur/GIT-GUIDE.git";
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
    if (blockedByMerge("git pull")) return;
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
      syncWorktree();
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
      S.commits[id] = { id: id, parents: [base, head], msg: "Merge pull request from " + open,
                        files: [], snap: {} };
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
    delete S.content[f];
    say("Discarded your changes to <code>" + esc(f) + "</code>. " +
      "<b>This one is not recoverable</b>: the work was never committed, so Git never had a copy.", "out");
    draw();
  };

  CMDS.status = function () {
    var lines = [];
    lines.push("On branch <b>" + esc(headName()) + "</b>");
    if (S.merging) {
      lines.push('<span class="r">You have unmerged paths.</span>');
      conflictFiles().forEach(function (f) {
        lines.push("&nbsp;&nbsp;" + (S.merging.files[f] === "resolved"
          ? '<span class="g">resolved:</span> ' + esc(f)
          : '<span class="r">both modified:</span> ' + esc(f)));
      });
      say(lines.join("<br>"), "out");
      return;
    }
    var st = Object.keys(S.staged).filter(function (f) { return !S.removed[f]; });
    var rm = Object.keys(S.removed);
    if (st.length) lines.push('<span class="g">Changes to be committed:</span> ' + st.map(esc).join(", "));
    if (rm.length) lines.push('<span class="g">Deleted, and staged:</span> ' + rm.map(esc).join(", "));
    var mod = Object.keys(S.files).filter(function (f) { return S.files[f] === "modified"; });
    if (mod.length) lines.push('<span class="r">Changes not staged:</span> ' + mod.map(esc).join(", "));
    var un = Object.keys(S.files).filter(function (f) { return S.files[f] === "untracked"; });
    if (un.length) lines.push('<span class="r">Untracked files:</span> ' + un.map(esc).join(", "));
    if (!st.length && !rm.length && !mod.length && !un.length) {
      lines.push("nothing to commit, working tree clean");
    }
    say(lines.join("<br>"), "out");
  };

  CMDS.add = function (a) {
    if (!a.length) { say("Nothing specified. Use <code>git add .</code> or <code>git add &lt;file&gt;</code>.", "err"); return; }

    // During a conflict, add means "I have settled this file".
    if (S.merging) {
      var want = a[0] === "." || a[0] === "-A" ? conflictFiles() : a;
      var marked = 0, refused = [];
      want.forEach(function (f) {
        if (!S.merging.files[f]) return;
        if (stillMarked(S.merging.body[f] || "")) { refused.push(f); return; }
        S.merging.files[f] = "resolved";
        S.content[f] = S.merging.body[f];
        marked++;
      });
      if (refused.length) {
        say("<b>" + refused.map(esc).join("</b>, <b>") + "</b> still contains conflict markers." +
          " Delete the <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>, <code>=======</code> and " +
          "<code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> lines, and leave the version you want." +
          "<br><b>Real Git would let you commit them.</b> That is exactly how conflict markers " +
          "reach production, so this sandbox stops you instead.", "err");
        draw();
        return;
      }
      if (!marked) { say("That file is not one of the conflicted ones.", "err"); return; }
      var left = unresolved();
      say("Marked " + marked + " file" + (marked === 1 ? "" : "s") + " as resolved. " +
        (left.length
          ? "Still to settle: <b>" + left.map(esc).join("</b>, <b>") + "</b>."
          : "All conflicts settled. <code>git commit</code> completes the merge."), "out");
      draw(); return;
    }
    var names = a[0] === "." || a[0] === "-A" ? Object.keys(S.files) : a;
    var n = 0;
    names.forEach(function (f) {
      if (S.files[f] == null) return;
      S.staged[f] = true;
      S.tracked[f] = true;
      delete S.files[f];
      n++;
    });
    if (!n) { say("No matching changes to stage. Run <code>edit &lt;file&gt;</code> first.", "err"); return; }
    say("Staged " + n + " file" + (n === 1 ? "" : "s") + ". They are now in the index, drafted for the next commit.", "out");
  };

  CMDS.commit = function (a) {
    if (S.merging) { finishMerge(); return; }
    var i = a.indexOf("-m");
    var msg = i !== -1 && a[i + 1] ? a[i + 1] : "Update";
    var amend = a.indexOf("--amend") !== -1;

    if (amend) {
      var cur = S.commits[headId()];
      if (!cur || !cur.parents.length) { say("Nothing to amend onto.", "err"); return; }
      var old = cur.id;
      var nid = nextId();
      S.commits[nid] = { id: nid, parents: cur.parents,
        msg: (i !== -1 && a[i + 1]) ? msg : cur.msg,
        files: (cur.files || []).slice(), snap: cur.snap || {} };
      S.order.push(nid);
      if (S.head.type === "branch") S.branches[S.head.name] = nid; else S.head.id = nid;
      S.staged = {};
      S.didAmend = true;
      note("HEAD", "commit (amend): " + S.commits[nid].msg);
      say(REWRITES + "Amended. <b>This is a new commit</b> (" + nid + "), not an edited one. " +
        old + " is now unreferenced, which is why amending after a push needs a force.", "out");
      draw(); return;
    }

    if (!Object.keys(S.staged).length) {
      say("nothing to commit, working tree clean. Stage something first: <code>edit app.js</code> then <code>git add .</code>", "err");
      return;
    }
    var touched = Object.keys(S.staged);
    S.staged = {};
    S.removed = {};
    var id = commit(msg, [headId()], touched);
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
      syncWorktree();
      note("HEAD", "checkout: moving to " + name);
      say("Created and switched to <b>" + esc(name) + "</b>. Same commit, new pointer, and HEAD now follows it.", "out");
      draw(); return;
    }
    if (S.branches[name] != null) {
      S.head = { type: "branch", name: name };
      S.switches = (S.switches || 0) + 1;
      syncWorktree();
      note("HEAD", "checkout: moving to " + name);
      say("Switched to <b>" + esc(name) + "</b>.", "out");
      draw(); return;
    }
    var id = resolve(name);
    if (id) {
      S.head = { type: "detached", id: id };
      S.wasDetached = true;
      syncWorktree();
      note("HEAD", "checkout: moving to " + id);
      say("You are in <b>detached HEAD</b> at " + id + ". Commits here belong to no branch. " +
        "<code>git switch -c &lt;name&gt;</code> keeps them; <code>git switch main</code> walks away.", "out");
      draw(); return;
    }
    say("No branch or commit named " + esc(name) + ".", "err");
  }

  CMDS.switch = function (a) {
    if (blockedByMerge("git switch")) return;
    switchTo(a);
  };
  CMDS.checkout = function (a) {
    // In a conflict, checkout --ours/--theirs picks a side for one file.
    var side = a.indexOf("--ours") !== -1 ? "ours" : a.indexOf("--theirs") !== -1 ? "theirs" : null;
    if (side && S.merging) {
      var f = a.filter(function (x) { return x[0] !== "-"; })[0];
      if (!f || !S.merging.files[f]) { say("Which conflicted file? " + conflictFiles().map(esc).join(", "), "err"); return; }
      S.merging.files[f] = "resolved";
      var pick = side === "ours"
        ? contentAt(headId(), f)
        : contentAt(S.merging.target, f);
      S.merging.body[f] = pick == null ? "" : pick;
      S.content[f] = S.merging.body[f];
      say("Took <b>" + (side === "ours" ? "your" : "their") + "</b> version of <code>" + esc(f) + "</code>. " +
        (side === "ours"
          ? "Ours means the branch you are on."
          : "Theirs means the branch you are merging in.") +
        " Marked resolved." +
        (unresolved().length ? " Still to settle: " + unresolved().map(esc).join(", ") + "." : " <code>git commit</code> now completes the merge."), "out");
      draw(); return;
    }
    if (side) { say("Nothing is conflicted, so there are no sides to choose.", "err"); return; }
    if (blockedByMerge("git checkout")) return;
    switchTo(a);
  };

  CMDS.merge = function (a) {
    if (a.indexOf("--abort") !== -1) {
      if (!S.merging) { say("There is no merge in progress.", "err"); return; }
      S.merging = null;
      say("Merge aborted. You are back exactly where you started, with nothing half-applied. " +
        "This is always available, and it is why a conflict is never a trap.", "out");
      draw(); return;
    }
    if (a.indexOf("--continue") !== -1) { finishMerge(); return; }
    if (blockedByMerge("git merge")) return;

    var name = a.filter(function (x) { return x[0] !== "-"; })[0];
    var target = resolve(name);
    if (!target) { say("No branch named " + esc(name || "") + ".", "err"); return; }
    var h = headId();
    if (isAncestor(target, h)) { say("Already up to date. Everything in " + esc(name) + " is already here.", "out"); return; }
    if (isAncestor(h, target)) {
      if (S.head.type === "branch") S.branches[S.head.name] = target; else S.head.id = target;
      syncWorktree();
      S.didFF = true;
      note("HEAD", "merge " + name + ": fast-forward");
      say("<b>Fast-forward.</b> Your branch had nothing of its own, so Git slid the pointer along. No merge commit exists.", "out");
      draw(); return;
    }
    // Both sides moved. If they touched the same file, that is a conflict, and
    // Git stops and hands the decision to you rather than guessing.
    var base = mergeBase(h, target);
    var mine = touchedSince(h, base), theirs = touchedSince(target, base);
    var clash = Object.keys(mine).filter(function (f) { return theirs[f]; });

    if (clash.length) {
      S.merging = { from: name, target: target, files: {}, body: {} };
      clash.forEach(function (f) {
        S.merging.files[f] = "conflict";
        S.merging.body[f] = markerText(f, contentAt(h, f), contentAt(target, f), name);
      });
      say(clash.map(function (f) {
        return '<span class="r">CONFLICT (content): Merge conflict in ' + esc(f) + "</span>";
      }).join("<br>") +
        '<br><span class="r">Automatic merge failed; fix conflicts and then commit the result.</span>' +
        "<br><br><b>Nothing is broken and nothing is lost.</b> Git changed what it could and stopped " +
        "at the " + clash.length + " file" + (clash.length === 1 ? "" : "s") + " where both sides " +
        "edited the same thing, because only you know which version is right.<br>" +
        "Decide each one: <code>git checkout --ours " + esc(clash[0]) + "</code> to keep yours, " +
        "<code>git checkout --theirs " + esc(clash[0]) + "</code> to take theirs, or " +
        "<code>edit " + esc(clash[0]) + "</code> to write the answer yourself. " +
        "Then <code>git add " + esc(clash[0]) + "</code> to mark it settled.<br>" +
        "Changed your mind entirely? <code>git merge --abort</code>.", "err");
      draw(); return;
    }

    /* A clean merge brings the other side's files across. Recording them on the
       merge commit is what lets git show, cat and blame answer afterwards. */
    var brought = Object.keys(theirs).filter(function (f) { return !mine[f]; });
    brought.forEach(function (f) {
      var body = contentAt(target, f);
      if (body != null) { S.content[f] = body; S.tracked[f] = true; }
    });
    var id = commit("Merge branch '" + name + "'", [h, target], brought);
    note("HEAD", "merge " + name + ": merge commit");
    say("Created merge commit <b>" + id + "</b>, with <b>two parents</b>. Both histories are preserved exactly as they happened.", "out");
    draw();
  };

  function finishMerge() {
    if (!S.merging) { say("There is no merge in progress.", "err"); return; }
    var left = unresolved();
    if (left.length) {
      say("Still unresolved: <b>" + left.map(esc).join("</b>, <b>") + "</b>. " +
        "Choose a side or edit the file, then <code>git add</code> it.", "err");
      return;
    }
    var from = S.merging.from, target = S.merging.target;
    var files = conflictFiles();
    S.merging = null;
    S.didResolveConflict = true;
    var id = commit("Merge branch '" + from + "'", [headId(), target], files);
    note("HEAD", "merge " + from + ": conflicts resolved");
    say("Merged <b>" + id + "</b>. The conflict is recorded as part of the history: " +
      "a merge commit with two parents, holding the resolution you chose.", "out");
    draw();
  }

  CMDS.rebase = function (a) {
    if (blockedByMerge("git rebase")) return;
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
      var o = S.commits[old];
      var id = nextId();
      // Same changes, new commits. A replayed commit that carried no files was
      // unreadable to git show and git blame the moment it landed.
      S.commits[id] = { id: id, parents: [base], msg: o.msg,
                        files: (o.files || []).slice(), snap: o.snap || {} };
      S.order.push(id);
      made.push(id);
      base = id;
    });
    S.branches[S.head.name] = base;
    syncWorktree();
    S.didRebase = true;
    note("HEAD", "rebase onto " + name);
    say(REWRITES + "Replayed " + mine.length + " commit" + (mine.length === 1 ? "" : "s") + " onto " + esc(name) +
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

    /* The three modes differ in how far the reset reaches. Soft moves the branch
       and stops. Mixed also resets the index, which is what unstaging means.
       Hard goes one further and rewrites your files. Saying "your changes are
       kept, unstaged" while leaving everything staged was simply untrue. */
    var unstaged = 0, restored = [];
    if (mode === "--mixed") {
      Object.keys(S.staged).forEach(function (f) {
        if (!S.removed[f]) { S.files[f] = "modified"; unstaged++; }
      });
      restored = Object.keys(S.removed);
      S.staged = {};
      S.removed = {};
      syncWorktree();
    }
    if (mode === "--hard") {
      S.staged = {};
      S.files = {};
      S.removed = {};
      syncWorktree();
      if (S.merging) {
        S.merging = null;
        say("The conflicted merge went with it: a hard reset abandons a merge in progress, " +
          "the same as <code>git merge --abort</code> would have.", "sys");
      }
    }
    /* Only say a commit was left behind when one actually was. Resetting onto
       where you already stand, or onto a descendant, leaves nothing stranded,
       and claiming otherwise is the kind of small lie that costs trust. */
    var stillHeld = {};
    Object.keys(S.branches).forEach(function (b) {
      Object.keys(ancestors(S.branches[b])).forEach(function (c) { stillHeld[c] = true; });
    });
    if (S.head.type === "detached") {
      Object.keys(ancestors(S.head.id)).forEach(function (c) { stillHeld[c] = true; });
    }

    say(REWRITES + "Moved <b>" + esc(headName()) + "</b> back to " + id + " with <code>" + esc(mode) + "</code>." +
      (mode === "--hard" ? " Working tree wiped too."
        : mode === "--soft" ? " Your changes are still staged."
        : unstaged ? " " + unstaged + " file" + (unstaged === 1 ? "" : "s") + " unstaged, and the edits are still in your working tree."
        : " The index was reset. Nothing was staged, so nothing moved.") +
      (restored.length
        ? "<br>" + restored.map(esc).join(", ") + " came back: the staged deletion was part of the index this reset threw away."
        : "") +
      (was !== id && !stillHeld[was]
        ? "<br>" + was + " is <b>not deleted</b>, only unreferenced. <code>git reflog</code> still knows it."
        : ""), "out");
    draw();
  };

  CMDS.revert = function (a) {
    if (blockedByMerge("git revert")) return;
    var id = resolve(a[0] || "HEAD");
    if (!id) { say("Cannot resolve " + esc(a[0] || "HEAD") + ".", "err"); return; }
    var was = S.commits[id];
    var files = (was.files || []).slice();
    // A revert is a commit like any other, and the change it records is the
    // change back. Putting the contents where they were is what makes it one.
    var parent = was.parents[0];
    files.forEach(function (f) {
      var before = parent ? contentAt(parent, f) : null;
      if (before == null) delete S.content[f]; else S.content[f] = before;
    });
    var nid = commit('Revert "' + was.msg + '"', [headId()], files);
    note("HEAD", "revert " + id);
    say("Added <b>" + nid + "</b>, a new commit that undoes " + id + ". Nothing was rewritten, " +
      "which is what makes revert the safe undo on a shared branch." +
      (files.length ? " <code>" + files.map(esc).join("</code>, <code>") +
        "</code> " + (files.length === 1 ? "is" : "are") + " back to the version before it." : ""), "out");
    draw();
  };

  CMDS["cherry-pick"] = function (a) {
    if (blockedByMerge("git cherry-pick")) return;
    var id = resolve(a[0]);
    if (!id) { say("Cannot resolve " + esc(a[0] || "") + ".", "err"); return; }
    var src = S.commits[id];
    var picked = (src.files || []).slice();
    picked.forEach(function (f) {
      if (src.snap && src.snap[f] != null) { S.content[f] = src.snap[f]; S.tracked[f] = true; }
    });
    var nid = commit(src.msg, [headId()], picked);
    S.didCherryPick = true;
    note("HEAD", "cherry-pick " + id);
    say("Copied " + id + " here as <b>" + nid + "</b>. Same change, new commit, and the original stays where it is.", "out");
    draw();
  };

  CMDS.tag = function (a) {
    if (!a.length) { say(Object.keys(S.tags).join("<br>") || "no tags yet", "out"); return; }

    if (a[0] === "-d") {
      var doomed = a[1];
      if (S.tags[doomed] == null) { say("No tag called " + esc(doomed || "") + ".", "err"); return; }
      delete S.tags[doomed];
      say("Deleted the tag " + esc(doomed) + " here. On the remote it lives on until " +
        "<code>git push origin --delete " + esc(doomed) + "</code>, which is why a deleted tag " +
        "keeps coming back for everyone else.", "out");
      draw(); return;
    }

    /* A message is an argument, not a target, and the old parser read the last
       word as the commit to tag. It also let a second tag of the same name look
       like it worked while quietly leaving the tag where it was. */
    var mi = a.indexOf("-m");
    var msg = mi !== -1 ? a[mi + 1] : null;
    var plain = a.filter(function (x) { return x.charAt(0) !== "-" && x !== msg; });
    var name = plain[0];
    if (!name) { say("Which name? <code>git tag v1.0</code>.", "err"); return; }
    if (S.tags[name] != null) {
      say("A tag called <b>" + esc(name) + "</b> already exists, and Git will not move it. " +
        "That is what separates a tag from a branch. <code>git tag -d " + esc(name) +
        "</code> first if you really mean to.", "err");
      return;
    }
    var at = plain[1] ? resolve(plain[1]) : headId();
    if (!at) { say("Cannot resolve " + esc(plain[1]) + ".", "err"); return; }
    S.tags[name] = at;
    say("Tagged " + esc(name) + " at " + at + ". Unlike a branch, a tag does not move when you commit.", "out");
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
    if (blockedByMerge("git stash")) return;
    if (a[0] === "list") {
      if (!S.stash.length) { say("The shelf is empty.", "out"); return; }
      say(S.stash.map(function (e, i) {
        return "stash@{" + i + "}: WIP on " + esc(headName()) + " (" +
          Object.keys(e.files).length + " file" + (Object.keys(e.files).length === 1 ? "" : "s") + ")";
      }).join("<br>"), "out");
      return;
    }
    if (a[0] === "pop" || a[0] === "apply") {
      if (!S.stash.length) { say("No stash entries found.", "err"); return; }
      var e = a[0] === "pop" ? S.stash.shift() : S.stash[0];
      Object.keys(e.files).forEach(function (f) { S.files[f] = e.files[f]; });
      Object.keys(e.content).forEach(function (f) { S.content[f] = e.content[f]; });
      if (a[0] === "pop") S.didStashPop = true;
      say("Restored your changes to the working tree." +
        (a[0] === "apply" ? " <b>apply</b> left the entry on the shelf; <b>pop</b> takes it off." : ""), "out");
      draw(); return;
    }
    if (a[0] === "drop" || a[0] === "clear") {
      if (!S.stash.length) { say("The shelf is already empty.", "err"); return; }
      var gone = a[0] === "clear" ? S.stash.length : 1;
      if (a[0] === "clear") S.stash = []; else S.stash.shift();
      say("Dropped " + gone + " stash entr" + (gone === 1 ? "y" : "ies") + ". " +
        "<b>There is no way back.</b> A dropped stash is not in any commit, so the reflog " +
        "cannot help and neither can anything else.", "out");
      return;
    }
    if (!dirty()) { say("No local changes to save.", "err"); return; }
    /* The shelf has to hold the contents as well as the file names, or popping
       restores a status with nothing behind it and cat prints the wrong thing. */
    var shelf = { files: S.files, content: {} };
    Object.keys(S.files).forEach(function (f) {
      if (S.content[f] != null) shelf.content[f] = S.content[f];
    });
    S.stash.unshift(shelf);
    S.files = {}; S.staged = {}; S.removed = {};
    syncWorktree();
    say("Saved your changes on the shelf and cleaned the working tree. <code>git stash pop</code> brings them back.", "out");
    draw();
  };

  /* ------------------------------------------------------- click and drag */

  // Clicking a commit explains exactly what it is and what still points at it.

  /* ---------------------------------------------------- reading the repository

     Everything below exists so that typing something reasonable gets a real
     answer. A sandbox that only accepts the commands its own lessons need is a
     track, not a visualiser. */

  function knownAt(f) {
    return S.files[f] != null || S.staged[f] || contentAt(headId(), f) != null;
  }

  function bodyOf(f) {
    return S.content[f] != null ? S.content[f] : contentAt(headId(), f);
  }

  function diffLines(f, was, now) {
    var out = ["<b>" + esc(f) + "</b>"];
    if (was == null && now == null) {
      out.push('<span class="m">No contents recorded. <code>edit ' + esc(f) +
        "</code> gives it a line to compare.</span>");
      return out;
    }
    if (was != null) out.push('<span class="r">- ' + esc(was) + "</span>");
    if (now != null) out.push('<span class="g">+ ' + esc(now) + "</span>");
    return out;
  }

  CMDS.init = function () {
    say("You are already inside a repository, so there is nothing to create. " +
      "<code>git init</code> makes the hidden <code>.git</code> folder in a directory that " +
      "has none, and everything on this page lives inside one." +
      "<br>To start again from a single commit, type <code>reset</code>.", "sys");
  };

  CMDS.help = function () { showHelp(); };

  CMDS.config = function (a) {
    var key = a.filter(function (x) { return x.charAt(0) !== "-"; })[0];
    if (!key) {
      say("<code>user.name</code> and <code>user.email</code> are the two that matter. " +
        "Git stamps them onto every commit you make, which is why a commit is never " +
        "anonymous once it leaves your machine.", "out");
      return;
    }
    say("Settings are not modelled here, because nothing on this page reaches a real " +
      "repository. On your own machine <code>git config --global " + esc(key) +
      "</code> writes to <code>~/.gitconfig</code>, and without <code>--global</code> it " +
      "writes to that one repository.", "sys");
  };

  CMDS.diff = function (a) {
    var staged = a.indexOf("--staged") !== -1 || a.indexOf("--cached") !== -1;
    /* Git compares what it is already following. It says nothing at all about a
       file it has never seen, and that silence is the commonest reason a diff
       comes back empty, so it is worth saying out loud. */
    var names = staged ? Object.keys(S.staged)
      : Object.keys(S.files).filter(function (f) { return S.files[f] === "modified"; });
    var newFiles = Object.keys(S.files).filter(function (f) { return S.files[f] === "untracked"; });
    if (!names.length) {
      var why = staged
        ? "Nothing is staged, so there is nothing to compare against the last commit."
        : "No change to a file Git is following. Anything staged is shown by " +
          "<code>git diff --staged</code>.";
      if (!staged && newFiles.length) {
        why += '<br><span class="m">Git has never seen <b>' + newFiles.map(esc).join("</b>, <b>") +
          "</b>, and <code>git diff</code> never mentions a file it is not following. " +
          "That is the commonest reason a diff comes back empty. <code>git add</code> " +
          "them and they appear.</span>";
      }
      say(why, "out");
      return;
    }
    var lines = [];
    names.forEach(function (f) {
      lines = lines.concat(diffLines(f, contentAt(headId(), f), S.content[f]));
    });
    lines.push('<span class="m">' + (staged
      ? "What the next commit would record, against the last one."
      : "Your files against the last commit. Reading only: nothing moves.") + "</span>");
    say(lines.join("<br>"), "out");
  };

  CMDS.show = function (a) {
    var ref = a.filter(function (x) { return x.charAt(0) !== "-"; })[0] || "HEAD";
    var id = resolve(ref);
    if (!id) { say("Nothing here answers to <code>" + esc(ref) + "</code>.", "err"); return; }
    var c = S.commits[id];
    var lines = ["commit <b>" + id + "</b>"];
    lines.push(c.parents.length
      ? '<span class="m">parent ' + c.parents.join(" ") + "</span>"
      : '<span class="m">the root commit, which has no parent</span>');
    lines.push("&nbsp;&nbsp;&nbsp;&nbsp;" + esc(c.msg));
    var fl = c.files || [];
    if (!fl.length) lines.push('<span class="m">No files recorded against this one.</span>');
    fl.forEach(function (f) {
      var was = c.parents.length ? contentAt(c.parents[0], f) : null;
      var now = c.snap && c.snap[f] != null ? c.snap[f] : null;
      lines = lines.concat(diffLines(f, was, now));
    });
    say(lines.join("<br>"), "out");
  };

  CMDS["ls-files"] = function () {
    // The index as it stands, not everything that has ever been committed. A
    // file removed two commits ago is still in history and is not in this list.
    var all = Object.keys(S.tracked).sort();
    if (!all.length) { say("Nothing is tracked yet, because nothing has been committed.", "out"); return; }
    say(all.map(esc).join("<br>") + '<br><span class="m">Every path Git is following. ' +
      "An untracked file is one missing from this list.</span>", "out");
  };

  CMDS["rev-parse"] = function (a) {
    var ref = a.filter(function (x) { return x.charAt(0) !== "-"; })[0] || "HEAD";
    var id = resolve(ref);
    if (!id) { say("<code>" + esc(ref) + "</code> does not name anything here.", "err"); return; }
    say("<b>" + id + '</b><br><span class="m">That is what <code>' + esc(ref) +
      "</code> means right now. Every name in Git is only a way of reaching one of " +
      "these.</span>", "out");
  };

  CMDS.describe = function () {
    var here = headId(), best = null, dist = 0, cur = here, n = 0;
    while (cur && n < 500) {
      var hit = Object.keys(S.tags).filter(function (t) { return S.tags[t] === cur; })[0];
      if (hit) { best = hit; dist = n; break; }
      var c = S.commits[cur];
      if (!c || !c.parents.length) break;
      cur = c.parents[0];
      n++;
    }
    if (!best) {
      say("No tag behind you yet. <code>git tag v1.0</code> puts one here, and then this " +
        "command can name any commit by how far it has travelled since.", "out");
      return;
    }
    say("<b>" + esc(best) + (dist === 0 ? "" : "-" + dist + "-g" + here) + "</b>" +
      '<br><span class="m">' + (dist === 0
        ? "Exactly on the tag."
        : dist + " commit" + (dist === 1 ? "" : "s") + " past <b>" + esc(best) +
          "</b>. This is where build numbers come from.") + "</span>", "out");
  };

  CMDS.shortlog = function () {
    var mine = [], theirs = [];
    S.order.forEach(function (id) {
      var m = S.commits[id].msg;
      if (m === "Teammate's fix") theirs.push(m); else mine.push(m);
    });
    var lines = ["<b>You</b> (" + mine.length + ")"];
    mine.forEach(function (m) { lines.push("&nbsp;&nbsp;&nbsp;&nbsp;" + esc(m)); });
    if (theirs.length) {
      lines.push("<b>Teammate</b> (" + theirs.length + ")");
      theirs.forEach(function (m) { lines.push("&nbsp;&nbsp;&nbsp;&nbsp;" + esc(m)); });
    }
    lines.push('<span class="m">The same history as <code>git log</code>, grouped by who ' +
      "wrote it. This is how release notes get written.</span>");
    say(lines.join("<br>"), "out");
  };

  CMDS.blame = function (a) {
    var f = a.filter(function (x) { return x.charAt(0) !== "-"; })[0];
    if (!f) { say("Which file? <code>git blame &lt;file&gt;</code>.", "err"); return; }
    var cur = headId(), n = 0;
    while (cur && n < 500) {
      var c = S.commits[cur];
      if (!c) break;
      if (c.snap && c.snap[f] != null) {
        say("<b>" + cur + "</b> " + esc(c.msg) + "<br>&nbsp;&nbsp;" + esc(c.snap[f]) +
          '<br><span class="m">The last commit to touch <code>' + esc(f) +
          "</code>. Blame answers who, and more usefully why, by pointing at the message " +
          "behind the line.</span>", "out");
        return;
      }
      if (!c.parents.length) break;
      cur = c.parents[0];
      n++;
    }
    say("<code>" + esc(f) + "</code> has never been committed on this branch.", "err");
  };

  CMDS.grep = function (a) {
    var q = a.filter(function (x) { return x.charAt(0) !== "-"; })[0];
    if (!q) { say("What are you looking for? <code>git grep &lt;text&gt;</code>.", "err"); return; }
    var hits = [];
    Object.keys(S.content).forEach(function (f) {
      if (S.content[f].indexOf(q) !== -1) hits.push(esc(f) + ": " + esc(S.content[f]));
    });
    if (!hits.length) { say("No match for <code>" + esc(q) + "</code> in your working tree.", "out"); return; }
    say(hits.join("<br>") + '<br><span class="m">Grep searches what Git tracks, which is ' +
      "why it beats searching the folder.</span>", "out");
  };

  CMDS.fsck = function () {
    var live = {};
    Object.keys(S.branches).forEach(function (b) {
      var anc = ancestors(S.branches[b]);
      Object.keys(anc).forEach(function (x) { live[x] = true; });
    });
    if (S.head.type === "detached") {
      var ha = ancestors(S.head.id);
      Object.keys(ha).forEach(function (x) { live[x] = true; });
    }
    var lost = S.order.filter(function (id) { return !live[id]; });
    if (!lost.length) {
      say("No dangling commits. Everything on the graph is reachable from a branch.", "out");
      return;
    }
    say(lost.map(function (id) {
      return "dangling commit <b>" + id + "</b> " + esc(S.commits[id].msg);
    }).join("<br>") + '<br><span class="m">These are the faded ones on the graph. They are ' +
      "still on disk, which is the whole reason <code>git reflog</code> can save you.</span>", "out");
  };

  CMDS.gc = function () {
    say("Nothing is collected here, deliberately: the faded commits are the point of the " +
      "graph.<br>On a real repository <code>git gc</code> tidies loose objects, and it is " +
      "the reason recovery has a deadline. An unreferenced commit survives for a while, " +
      "and then it does not.", "sys");
  };

  CMDS.bisect = function () {
    say("Not modelled here, because it needs a bug and a test to hunt with." +
      "<br><code>git bisect start</code>, then mark one commit <code>bad</code> and an " +
      "older one <code>good</code>. Git checks out the midpoint and halves what is left " +
      "each time you answer, so a thousand commits take about ten guesses.", "sys");
  };

  CMDS.rm = function (a) {
    var cached = a.indexOf("--cached") !== -1;
    var f = a.filter(function (x) { return x.charAt(0) !== "-"; })[0];
    if (!f) { say("Which file? <code>git rm &lt;file&gt;</code>.", "err"); return; }
    if (!knownAt(f)) { say("<code>" + esc(f) + "</code> is not in this repository.", "err"); return; }
    delete S.staged[f];
    delete S.tracked[f];
    if (cached) {
      S.files[f] = "untracked";
      say("Stopped tracking <code>" + esc(f) + "</code>. The file stays where it is and Git " +
        "lets go of it. This is the fix for something committed by mistake, and the next " +
        "step is always a <code>.gitignore</code> entry.", "out");
    } else {
      delete S.files[f];
      delete S.content[f];
      S.staged[f] = true;
      S.removed[f] = true;
      say("Deleted <code>" + esc(f) + "</code> and staged the deletion. Commit to record it. " +
        "Every earlier commit still holds the file, so nothing committed is lost.", "out");
    }
    draw();
  };

  CMDS.mv = function (a) {
    var plain = a.filter(function (x) { return x.charAt(0) !== "-"; });
    if (plain.length < 2) { say("Two names needed: <code>git mv &lt;from&gt; &lt;to&gt;</code>.", "err"); return; }
    var from = plain[0], to = plain[1];
    if (!knownAt(from)) { say("<code>" + esc(from) + "</code> is not in this repository.", "err"); return; }
    var body = bodyOf(from);
    delete S.files[from];
    delete S.staged[from];
    delete S.content[from];
    delete S.tracked[from];
    S.staged[to] = true;
    S.tracked[to] = true;
    if (body != null) S.content[to] = body;
    say("Renamed <code>" + esc(from) + "</code> to <code>" + esc(to) + "</code> and staged it." +
      "<br>Git records no rename. It sees one path gone and another arrived, and works out " +
      "afterwards that the contents match. That is why a rename plus a heavy edit shows up " +
      "as a delete and an add.", "out");
    draw();
  };

  CMDS.clean = function (a) {
    var flags = a.filter(function (x) { return x.charAt(0) === "-"; }).join("");
    var force = flags.indexOf("f") !== -1;
    var dry = flags.indexOf("n") !== -1;
    var un = Object.keys(S.files).filter(function (f) { return S.files[f] === "untracked"; });
    if (!un.length) { say("Nothing untracked to remove.", "out"); return; }
    if (dry || !force) {
      say("Would remove: <b>" + un.map(esc).join("</b>, <b>") + "</b><br>" +
        (dry ? "That is all <code>-n</code> does. It shows you and stops."
             : "Git refuses without <code>-f</code>, and it is right to. Run it with " +
               "<code>-n</code> first to see the list."), "out");
      return;
    }
    un.forEach(function (f) { delete S.files[f]; delete S.content[f]; });
    say("Removed " + un.length + " untracked file" + (un.length === 1 ? "" : "s") + "." +
      "<br><b>Nothing brings these back.</b> They were never committed, so Git never held a " +
      "copy and the reflog cannot help. This is the quietest destructive command in Git.", "out");
    draw();
  };

  /* Real commands this sandbox cannot run. Saying what they do beats refusing,
     because whoever typed one has already decided it is what they want. */
  var EXPLAIN = {
    worktree: "opens a second working directory from the same repository, so two branches " +
      "are checked out at once with no stashing and no second clone.",
    submodule: "pins another repository inside this one at an exact commit. Powerful, and " +
      "the usual reason a fresh clone arrives with empty folders.",
    archive: "exports a commit as a zip or a tar, with no history attached.",
    apply: "applies a patch file to your working tree without making a commit.",
    am: "applies a mailbox of patches and commits each one, keeping the original author.",
    "format-patch": "turns commits into patch files you can send by email.",
    notes: "attaches a note to a commit without changing it, so the hash survives.",
    bundle: "packs a repository, or part of one, into a single file you can carry.",
    "filter-branch": "rewrites every commit in history. Superseded by git filter-repo, " +
      "which is faster and much harder to misuse.",
    rerere: "remembers how you resolved a conflict and replays your answer next time.",
    "sparse-checkout": "checks out only part of a very large repository.",
    maintenance: "runs the housekeeping a large repository needs, on a schedule.",
    prune: "deletes unreachable objects. The command that finally ends recovery.",
    lfs: "stores large files outside the repository and leaves a pointer behind.",
    daemon: "serves repositories over the git protocol.",
    "cat-file": "prints a raw object: a commit, a tree, or a blob. The floor of Git.",
    "hash-object": "computes the ID Git would give some content. The whole naming scheme " +
      "in one command.",
    "update-index": "edits the index directly. Plumbing, and rarely what you want.",
    "symbolic-ref": "reads or moves what HEAD points at, without touching your files.",
    "verify-commit": "checks the signature on a commit."
  };

  // How far apart two words are, so a near miss can be named instead of refused.
  function near(a, b) {
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function didYouMean(cmd) {
    var best = null, score = 99;
    Object.keys(CMDS).forEach(function (k) {
      var d = near(cmd, k);
      if (d < score) { score = d; best = k; }
    });
    return score <= Math.max(1, Math.floor(cmd.length / 3)) ? best : null;
  }

  /* Pressing the mouse on a focusable SVG group makes the browser draw its own
     focus ring, in the text colour, which showed as a white box around a commit.
     Refusing the default press stops the focus without stopping the click, so the
     ring is left to keyboard users, who are the ones it is for. */
  function noRing(e) { e.preventDefault(); }


  /* The prompt an Oh My Zsh user sees on a Mac. It is live, not decoration: the
     branch and the mark come from the same state the graph is drawn from, so
     the prompt says what a real one is telling you. */
  function promptHTML() {
    /* Detached, a real prompt shows the hash, because there is no branch name to
       show. The state marker is the same idea as the one zsh gives you mid-merge:
       the prompt is where you find out you are somewhere unusual. */
    var label = S.head.type === "branch" ? S.head.name : S.head.id;
    var state = S.merging ? "|MERGING" : S.head.type === "detached" ? "|DETACHED" : "";
    return '<span class="pp-arrow">&#10140;</span>' +
      '<span class="pp-dir">GIT-GUIDE</span>' +
      '<span class="pp-git">git:(</span>' +
      '<span class="pp-branch">' + esc(label) + "</span>" +
      (state ? '<span class="pp-state">' + state + "</span>" : "") +
      '<span class="pp-git">)</span>' +
      (dirty() ? '<span class="pp-dirty">&#10007;</span>' : "");
  }

  function drawPrompt() { if (promptEl) promptEl.innerHTML = promptHTML(); }

  /* The commands people type in a terminal without thinking about it. Each one
     is cheap to answer, and refusing them is what makes a fake shell feel fake. */
  var SHELL = {};

  SHELL.pwd = function () {
    say("<code>~/GIT-GUIDE</code>", "out");
  };

  SHELL.cd = function () {
    say("There is one directory here and you are already in it. On your own machine " +
      "<code>cd</code> is how you reach a repository, and every Git command fails " +
      "until you have.", "sys");
  };

  SHELL.exit = function () {
    say("Nothing to exit: this shell is a web page. <code>reset</code> starts it over, " +
      "and <code>clear</code> just wipes the screen.", "sys");
  };

  SHELL.ls = function () {
    // What is on disk: what Git follows, plus anything new, minus what has been
    // deleted and is only waiting for the commit that records it.
    var seen = {};
    Object.keys(S.tracked).forEach(function (f) { seen[f] = 1; });
    Object.keys(S.files).forEach(function (f) { seen[f] = 1; });
    Object.keys(S.removed).forEach(function (f) { delete seen[f]; });
    var all = Object.keys(seen).sort();
    if (!all.length) {
      say("The folder is empty. <code>edit app.js</code> puts something in it.", "out");
      return;
    }
    say(all.map(esc).join("&nbsp;&nbsp;&nbsp;") + '<br><span class="m">Everything in the ' +
      "folder. <code>git status</code> says which of them Git is following.</span>", "out");
  };

  SHELL.cat = function (a) {
    var f = a.filter(function (x) { return x.charAt(0) !== "-"; })[0];
    if (!f) { say("Which file? <code>cat &lt;file&gt;</code>.", "err"); return; }
    var body = S.merging && S.merging.body[f] != null ? S.merging.body[f]
      : S.content[f] != null ? S.content[f] : contentAt(headId(), f);
    if (body == null) { say("cat: " + esc(f) + ": No such file or directory", "err"); return; }
    var shown = esc(body).split(String.fromCharCode(10)).join("<br>");
    say(shown + (S.merging && S.merging.body[f] != null
      ? '<br><span class="m">This is what a conflict actually looks like on disk. Both ' +
        "versions, and the markers Git left for you to delete.</span>"
      : ""), "out");
  };


  /* ------------------------------------------------------------------ the drill

     Everything about recovery is easy to agree with and hard to believe until it
     has happened to you. This makes it happen, on purpose, with a clock running. */

  var DRILL_BEST = "gg-drill-best";
  var drillTimer = null;

  var drillEls = {
    box: document.getElementById("pdrill"),
    title: document.getElementById("drill-title"),
    body: document.getElementById("drill-body"),
    clock: document.getElementById("drill-clock"),
    best: document.getElementById("drill-best"),
    go: document.getElementById("drill-go"),
    help: document.getElementById("drill-help"),
    stop: document.getElementById("drill-stop"),
    hint: document.getElementById("drill-hint")
  };

  function bestTime() {
    try {
      var v = parseFloat(window.localStorage.getItem(DRILL_BEST));
      return isFinite(v) && v > 0 ? v : null;
    } catch (e) { return null; }
  }

  function saveBest(secs) {
    try {
      var b = bestTime();
      if (b == null || secs < b) window.localStorage.setItem(DRILL_BEST, String(secs));
    } catch (e) { /* it simply will not persist */ }
  }

  function showBest() {
    if (!drillEls.best) return;
    var b = bestTime();
    drillEls.best.textContent = b == null ? "" : "best " + b.toFixed(1) + "s";
  }

  function drillSeconds() {
    if (!S.drill || !S.drill.at) return 0;
    return (Date.now() - S.drill.at) / 1000;
  }

  function tickClock() {
    if (!drillEls.clock) return;
    drillEls.clock.textContent = drillSeconds().toFixed(1) + "s";
  }

  function drillButtons(running) {
    if (!drillEls.go) return;
    drillEls.go.textContent = running ? "Start over" : "Start the drill";
    if (drillEls.help) {
      drillEls.help.hidden = !running;
      drillEls.help.setAttribute("aria-expanded", "false");
    }
    if (drillEls.stop) drillEls.stop.hidden = !running;
    if (drillEls.hint) drillEls.hint.hidden = true;
    if (drillEls.box) drillEls.box.classList.toggle("running", !!running);
  }

  function endDrill() {
    if (drillTimer) { window.clearInterval(drillTimer); drillTimer = null; }
    S.drill = null;
    drillButtons(false);
  }

  function startDrill() {
    past = [];                       // no undo, the same as the day it happens
    reset(true);
    clear();
    var root = headId();

    [["parser.js", "Add the parser"],
     ["parser.js", "Handle empty input"],
     ["tests.js", "Cover the off-by-one"]].forEach(function (w) {
      S.content[w[0]] = "the work in " + w[1].toLowerCase();
      S.tracked[w[0]] = true;
      commit(w[1], [headId()], [w[0]]);
      note("HEAD", "commit: " + w[1]);
    });

    var lost = headId();
    S.branches.main = root;
    S.files = {}; S.staged = {}; S.removed = {}; S.tracked = {}; S.content = {};
    note("HEAD", "reset: moving to HEAD~3");

    S.drill = { target: lost, at: Date.now(), helped: false };

    say("Three commits of real work, and then:", "sys");
    say('<span class="p">' + promptHTML() + "</span> git reset --hard HEAD~3", "cmd");
    say("<b>Gone.</b> Three commits of work, and <code>main</code> is back at the beginning. " +
      "Look at the graph: they are faded, not deleted." +
      "<br>Nothing points at <b>" + lost + "</b> any more, so no branch can find it and " +
      "<code>git log</code> will not show it." +
      '<br><span class="m">One thing still remembers where HEAD has been. Get ' +
      "<code>main</code> back onto that commit. The clock is running.</span>", "err");

    drillButtons(true);
    tickClock();
    if (drillTimer) window.clearInterval(drillTimer);
    drillTimer = window.setInterval(tickClock, 100);
    draw();
    if (drillEls.box) drillEls.box.scrollIntoView({ block: "nearest" });
  }

  /* The answer belongs in the card the question was asked from. Printing it into
     the terminal, which is most of a screen away, read as the button doing
     nothing at all. */
  function drillHelp() {
    if (!S.drill || !drillEls.hint) return;
    S.drill.helped = true;
    var open = drillEls.hint.hidden;
    drillEls.hint.innerHTML =
      "<code>git reflog</code> lists everywhere HEAD has been, newest first. The commit you " +
      "want is the line directly below the reset, and the hash is the first thing on it. " +
      "Then <code>git reset --hard &lt;hash&gt;</code> puts <b>main</b> back onto it." +
      '<br><span class="m">A time set with help still counts. The run after this one, ' +
      "without it, is the one that means something.</span>";
    drillEls.hint.hidden = !open;
    if (drillEls.help) drillEls.help.setAttribute("aria-expanded", open ? "true" : "false");
  }

  /* Won when the lost tip is reachable again from where you are standing. Any
     route counts: reset, branch, cherry-pick, merge. Git does not care how the
     work came home, and neither does this. */
  function checkDrill() {
    if (!S.drill) return;
    var here = headId();
    if (here !== S.drill.target && !isAncestor(S.drill.target, here)) return;
    var secs = drillSeconds();
    var was = bestTime();
    saveBest(secs);
    showBest();
    endDrill();
    if (drillEls.clock) drillEls.clock.textContent = secs.toFixed(1) + "s";
    say("<b>Recovered in " + secs.toFixed(1) + " seconds.</b> " +
      (was != null && secs < was ? "A new best. " : "") +
      "Nothing was ever destroyed. The commits sat there the whole time, unreferenced, " +
      "waiting for something to point at them again." +
      "<br>That is the fact worth carrying out of here: <b>committed work is almost always " +
      "recoverable</b>. Uncommitted work is not, which is why <code>git commit</code> early " +
      "is the cheapest insurance in software." +
      '<br><span class="m">The sandbox is yours again, with the rescued commits still in it. ' +
      "<b>Reset the sandbox</b>, under The course, puts it back to one commit.</span>", "win");
  }

  showBest();

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

    var bits = ["<b>" + id + "</b> " + esc(c.msg),
      '<span class="m">Those four characters are the start of this ID. Git names a commit ' +
      "after the contents it holds, so the name is unique and can never change.</span>"];
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

  /* --------------------------------------------------- the conflict editor

     A conflict is the one moment where Git hands you a file and asks you to
     decide. Reading the markers and deleting them is the skill; picking a side
     from a button is not. So the marked-up file is shown, and it is editable. */
  var editor = document.getElementById("pconflict");

  function renderConflictEditor() {
    if (!editor) return;
    if (!S.merging) { editor.hidden = true; editor.innerHTML = ""; return; }

    var files = conflictFiles();
    var open = editor.querySelector(".pcf-body");
    var keepFocus = open && document.activeElement === open ? open.dataset.file : null;
    var caret = keepFocus ? open.selectionStart : null;

    editor.hidden = false;
    editor.innerHTML = "";

    var head = document.createElement("p");
    head.className = "pcf-head";
    head.innerHTML = "<b>" + files.length + " file" + (files.length === 1 ? "" : "s") +
      " to settle.</b> Git changed everything it safely could and stopped here, because only " +
      "you know which version is right. Edit the text, delete the marker lines, then " +
      "<code>git add</code> the file.";
    editor.appendChild(head);

    files.forEach(function (f) {
      var done = S.merging.files[f] === "resolved";
      var wrap = document.createElement("div");
      wrap.className = "pcf" + (done ? " is-done" : "");

      var name = document.createElement("div");
      name.className = "pcf-name";
      name.innerHTML = "<code>" + esc(f) + "</code><span>" +
        (done ? "resolved" : "both branches changed this") + "</span>";
      wrap.appendChild(name);

      var box = document.createElement("textarea");
      box.className = "pcf-body";
      box.dataset.file = f;
      box.spellcheck = false;
      box.rows = Math.max(5, (S.merging.body[f] || "").split(NL).length + 1);
      box.value = S.merging.body[f] || "";
      box.setAttribute("aria-label", "Contents of " + f);
      box.disabled = done;
      box.addEventListener("input", function () {
        S.merging.body[f] = box.value;
        var warn = wrap.querySelector(".pcf-warn");
        if (warn) warn.hidden = !stillMarked(box.value);
      });
      wrap.appendChild(box);

      var warn = document.createElement("p");
      warn.className = "pcf-warn";
      warn.hidden = done || !stillMarked(S.merging.body[f] || "");
      warn.textContent = "Conflict markers are still in this file.";
      wrap.appendChild(warn);

      if (!done) {
        var row = document.createElement("div");
        row.className = "pcf-acts";
        [["Keep ours", "git checkout --ours " + f],
         ["Take theirs", "git checkout --theirs " + f],
         ["Mark resolved", "git add " + f]].forEach(function (pair) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "pcf-btn";
          btn.textContent = pair[0];
          btn.addEventListener("click", function () {
            say('<span class="p">' + promptHTML() + "</span> " + esc(pair[1]), "cmd");
            run(pair[1]);
          });
          row.appendChild(btn);
        });
        wrap.appendChild(row);
      }

      editor.appendChild(wrap);
    });

    if (keepFocus) {
      var again = editor.querySelector('.pcf-body[data-file="' + keepFocus + '"]');
      if (again && !again.disabled) {
        again.focus();
        if (caret != null) again.setSelectionRange(caret, caret);
      }
    }
  }

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
      gnode.addEventListener("mousedown", noRing);
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
        gl.addEventListener("mousedown", noRing);
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
        syncWorktree();
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
      (S.merging ? ' · <span class="r">merging: ' + unresolved().length + " unresolved</span>" : "") +
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

    drawPrompt();
    renderConflictEditor();
    checkLessons();
    checkDrill();
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

    { id: "merge-conflict", ch: 2, t: "Resolve a merge conflict",
      goal: "Make both branches change the same file, merge, and settle the conflict.",
      why: "A conflict is not a failure. Git changed everything it safely could and stopped where both sides edited the same thing, because only you know which version is right.",
      hint: "<code>edit shared.js</code> and commit on main, then the same file on a branch, then merge. A pane appears with the marked-up file: delete the marker lines and leave the version you want, then <code>git add shared.js</code> and <code>git commit</code>.",
      done: "Nothing was lost and nothing was guessed. The resolution you chose is recorded in the merge commit, and git merge --abort was available the whole time.",
      ok: function () { return !!S.didResolveConflict; } },

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
      hint: "<code>git clone https://github.com/Amey-Thakur/GIT-GUIDE.git</code>, then <code>git log</code> to see the history came too.",
      done: "Everything a new repository needs, in one command: full history, origin configured, and main already tracking origin/main.",
      ok: function () { return !!S.used.clone; } },

    { id: "remote-add", ch: 6, t: "Connect your repository to GitHub",
      goal: "Add a remote called origin.",
      why: "Git works perfectly with no server at all. A remote is just an address you have given a nickname, and adding one sends nothing.",
      hint: "<code>git remote add origin https://github.com/Amey-Thakur/GIT-GUIDE.git</code>, then <code>git remote -v</code> to see it.",
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
    if (hbtn) { hbtn.textContent = "Ask Amey"; hbtn.setAttribute("aria-expanded", "false"); }

    var badge = document.getElementById("lsn-state");
    if (badge) {
      badge.textContent = solved[task] ? "Done" : "Not yet";
      badge.className = "lsn-state" + (solved[task] ? " is-done" : "");
    }

    var prev = document.getElementById("lsn-prev");
    var next = document.getElementById("lsn-next");
    if (prev) prev.disabled = task === 0;

    /* A dead button at the end of the last lesson is a dead end. From here Next
       goes to the first lesson still outstanding, and once there are none it
       says so instead. */
    var pending = LESSONS.map(function (_, i) { return i; }).filter(function (i) { return !solved[i]; });
    var last = task === LESSONS.length - 1;
    if (next) {
      next.disabled = last && !pending.length;
      next.textContent = last && pending.length ? "Next unfinished" : "Next";
    }

    var finale = document.getElementById("lsn-finale");
    if (finale) finale.hidden = pending.length > 0;

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

  var REWRITES = '<span class="rw">rewrites history</span> ';

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
    /* The two ways people already clear a terminal: Command K in Terminal on a
       Mac, and Control L in any shell anywhere. Control K is left alone, because
       macOS text fields use it to cut to the end of the line. */
    var k = e.key.toLowerCase();

    /* Control C throws the line away and prints the mark, the way it does in
       every shell. A selection means the user is copying, so that is left alone. */
    if (e.ctrlKey && !e.metaKey && k === "c" && inEl.selectionStart === inEl.selectionEnd) {
      e.preventDefault();
      say('<span class="p">' + promptHTML() + "</span> " + esc(inEl.value) + "^C", "cmd");
      inEl.value = "";
      hideSuggestions();
      return;
    }

    if ((e.metaKey && k === "k") || (e.ctrlKey && !e.metaKey && k === "l")) {
      e.preventDefault();
      clear();
      hideSuggestions();
      return;
    }
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
      say('<span class="p">' + promptHTML() + "</span> " + esc(v), "cmd");
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
    if (e.target.closest("#drill-go")) { startDrill(); return; }
    if (e.target.closest("#drill-help")) { drillHelp(); return; }
    /* Stopping has to hand the sandbox back clean. The drill leaves three
       abandoned commits and a branch at the beginning, and carrying on with a
       lesson against that wreckage is confusing rather than instructive. */
    if (e.target.closest("#drill-stop")) {
      endDrill();
      past = [];
      reset(true);
      clear();
      say("Drill stopped, and the sandbox is back to a fresh repository so the lessons " +
        "above make sense again.<br>The commits from the drill went with it. Start it " +
        "again whenever you want another go.", "sys");
      draw();
      return;
    }
    if (e.target.closest("#preset")) { past = []; endDrill(); reset(); draw(); return; }
    if (e.target.closest("#pundo")) { undo(); return; }

    if (e.target.closest("#finale-drill")) { startDrill(); return; }

    if (e.target.closest("#lsn-next")) {
      if (task < LESSONS.length - 1) { task += 1; renderLesson(); return; }
      // On the last one, carry on to whatever is still outstanding.
      var todo = LESSONS.map(function (_, i) { return i; }).filter(function (i) { return !solved[i]; })[0];
      if (todo != null) { task = todo; renderLesson(); }
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
      if (/^(git|gh|edit|ls|cat|pwd) /.test(text) || /^(teammate|ls|pwd|clear)$/.test(text)) {
        inEl.value = text;
        inEl.focus();
        say('<span class="p">' + promptHTML() + "</span> " + esc(text), "cmd");
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
        btn.textContent = box.hidden ? "Ask Amey" : "Hide it";
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
