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
    reveals: ["g-reset"],
    steps: [
      { on: ["z-wt"], cmd: "(edit files)", text: "Everything begins in the working tree: the ordinary files and folders you edit. Git watches, but nothing is recorded yet." },
      { on: ["a-add", "z-stage"], cmd: "git add <file>", text: "add copies a change into the staging area, the draft of your next commit. You choose exactly what goes in; the rest waits." },
      { on: ["a-commit", "z-local"], cmd: "git commit", text: "commit seals the staged draft into a permanent snapshot inside your local repository. Still only on your machine, and that is fine." },
      { on: ["a-push", "z-remote"], cmd: "git push", text: "push uploads your new commits to the remote: GitHub, GitLab, Azure DevOps, any of them. Now others can see your work." },
      { on: ["a-fetch", "z-local"], cmd: "git fetch", text: "fetch downloads their commits into your local repository and stops there. Your branches and files have not moved; you can look before touching anything." },
      { on: ["a-merge", "z-wt"], cmd: "git merge  (git pull = fetch + merge)", text: "merge brings the fetched commits into your branch and updates your files. pull does fetch and merge in one step." },
      { on: ["a-restore", "z-wt"], cmd: "git restore <file>", text: "restore copies the recorded version back over your file: the everyday undo for edits you regret." },
      { on: ["z-local"], show: ["g-reset"], cmd: "git reset", text: "reset moves the branch pointer itself to an older commit. Nothing is deleted at first; commits simply stop being part of the branch. This is where history is un-happened, so it gets danger badges." }
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
      { show: BASE.concat(["b-main", "b-head"]), on: ["b-head"], cmd: "git switch --detach <hash>", text: "HEAD is simply where you stand, normally attached to a branch. Check out a commit directly and HEAD detaches: not an error, just you visiting a snapshot." }
    ]
  };

  window.GGStepper(D1);
  window.GGStepper(D2);
})();
