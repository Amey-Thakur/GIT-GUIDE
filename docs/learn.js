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
  window.GGQuiz("learn-quiz", [
    {
      q: "You have edited a file but have not run git add. Where does that change live?",
      a: [
        { t: "The working tree", ok: true,
          why: "Your ordinary files. Git can see the change but has recorded nothing, which is why this is the one state Git cannot get back for you." },
        { t: "The staging area", why: "Not yet. Nothing reaches the staging area until you add it." },
        { t: "The local repository", why: "No. The repository only holds what you have committed." },
        { t: "The remote", why: "No. Nothing leaves your machine until you push, and nothing is even committed yet." }
      ]
    },
    {
      q: "Which command moves what you have staged into your history?",
      a: [
        { t: "git add", why: "add moves changes into the staging area, one step earlier." },
        { t: "git commit", ok: true,
          why: "commit turns the staged snapshot into a permanent one and moves your branch label onto it." },
        { t: "git push", why: "push copies commits you have already made to a remote." },
        { t: "git stash", why: "stash puts changes on a shelf instead of recording them." }
      ]
    },
    {
      q: "A branch, in Git, is best described as:",
      a: [
        { t: "A copy of your files", why: "Nothing is copied. That is why branching is instant even on a huge repository." },
        { t: "A movable label pointing at one commit", ok: true,
          why: "That is the whole secret. Committing moves the label forward; creating a branch just adds another label." },
        { t: "A folder inside .git", why: "There is a file recording where it points, but the branch itself is only that pointer." },
        { t: "A backup of your work", why: "A branch protects nothing on its own; it is a pointer, not a copy." }
      ]
    },
    {
      q: "You run git fetch. What just changed?",
      a: [
        { t: "Your files were updated", why: "No. That is the point of fetch: your working tree is untouched." },
        { t: "Your branch moved forward", why: "No. Your own branch never moves on a fetch." },
        { t: "Your record of the remote", ok: true,
          why: "Fetch updates your origin/* labels and nothing else. Pull is fetch plus a merge, which is the part that can surprise you." },
        { t: "Nothing at all", why: "Something did change: your origin/* labels now show where the remote actually is." }
      ]
    },
    {
      q: "You ran git reset --hard and lost a commit you wanted. It is:",
      a: [
        { t: "Gone forever", why: "Almost never true, and believing it causes a lot of unnecessary panic." },
        { t: "Still there, and the reflog can find it", ok: true,
          why: "Reset moves a label; it does not delete commits. git reflog lists where HEAD has been, and resetting back to that hash brings the work home." },
        { t: "Only on the remote", why: "It may not have been pushed at all, and you still would not have lost it." },
        { t: "Recoverable only from a backup", why: "Git keeps its own safety net. The reflog is that net." }
      ]
    }
  ]);

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
