/*
  File: github.js
  Purpose: The step definitions for the pull request lifecycle diagram.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript, driven by stepper.js
  Description: Seven steps from a current main to a merged pull request: branch, commits, the PR, checks, review, response, merge.
  Date: 2026-08-07
*/

(function () {
  "use strict";

  var ALL = ["p-m1", "p-m2", "p-em", "p-main", "p-branch", "p-f1", "p-feat", "p-f2", "p-e12", "p-f3", "p-e23", "p-M", "p-e2M", "p-efM", "p-mainM", "p-panel", "p-ci", "p-review", "p-merged"];
  var S1 = ["p-m1", "p-m2", "p-em", "p-main"];
  var S2 = S1.concat(["p-branch", "p-f1", "p-feat"]);
  var S3 = S2.concat(["p-f2", "p-e12"]);
  var S4 = S3.concat(["p-panel"]);
  var S5 = S4.concat(["p-ci"]);
  var S6 = S5.concat(["p-review", "p-f3", "p-e23"]);
  var S7 = ["p-m1", "p-m2", "p-em", "p-branch", "p-f1", "p-feat", "p-f2", "p-e12", "p-f3", "p-e23", "p-M", "p-e2M", "p-efM", "p-mainM", "p-panel", "p-ci", "p-merged"];

  window.GGStepper({
    prefix: "d3",
    reveals: ALL,
    steps: [
      { show: S1, on: ["p-m1", "p-m2"], cmd: "git switch main && git pull", text: "Every pull request starts from a current main. Two commands, then branch." },
      { show: S2, on: ["p-f1", "p-feat"], cmd: "git switch -c feature", text: "Your branch is a private line of work. Name it for the change, not for yourself." },
      { show: S3, on: ["p-f2"], cmd: "git commit", text: "Small commits that each do one thing make review fast and mistakes easy to trace." },
      { show: S4, on: ["p-panel"], cmd: "git push -u origin feature", text: "Push, and GitHub offers the pull request: your branch, proposed into main, as a conversation everyone can see." },
      { show: S5, on: ["p-ci"], cmd: "(GitHub Actions runs your checks)", text: "Every push runs the checks automatically. The green tick spends machine time so reviewers spend less human time." },
      { show: S6, on: ["p-review", "p-f3"], cmd: "git commit && git push", text: "Review asks for changes; you answer with new commits, not force pushes, so the conversation keeps its history." },
      { show: S7, on: ["p-M", "p-merged"], cmd: "gh pr merge --squash --delete-branch", text: "Merge lands the work on main and the branch retires. Squash, merge commit, or rebase: the team's convention decides." }
    ]
  });
})();
