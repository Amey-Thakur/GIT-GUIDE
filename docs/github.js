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


  /* The four things people get wrong about GitHub, asked rather than told. */
  window.GGQuiz("github-quiz", [
    {
      q: "What does a pull request actually contain?",
      a: [
        { t: "A copy of your changed files", why: "No copying happens. The commits are already on GitHub before the pull request exists." },
        { t: "A request to merge a branch that is already pushed", ok: true,
          why: "That is all it is: your branch, proposed into another, with somewhere for people to talk about it." },
        { t: "A patch file emailed to the maintainer", why: "That is the older mailing-list workflow. Git supports it, but it is not what a pull request is." },
        { t: "A backup of your branch", why: "A pull request protects nothing. Your branch is safe because you pushed it, not because you proposed it." }
      ]
    },
    {
      q: "Your pull request was merged on GitHub. Your local main now:",
      a: [
        { t: "Has the change already", why: "It does not. Nothing reaches your machine on its own." },
        { t: "Does not have it until you pull", ok: true,
          why: "Two different places moved: GitHub's main, and later yours. This is the step people forget, and then wonder why their main looks stale." },
        { t: "Is broken and needs a fresh clone", why: "Nothing is broken. It is simply behind." },
        { t: "Updates the next time you commit", why: "Committing adds to your history; it never brings anything down from GitHub." }
      ]
    },
    {
      q: "Your push is rejected as non-fast-forward. The right first move is:",
      a: [
        { t: "git push --force", why: "This is the answer that loses somebody's work. Force overwrites the commits you have not seen." },
        { t: "git pull, then push again", ok: true,
          why: "The rejection means origin has work you do not. Bring it in, resolve anything that conflicts, then push." },
        { t: "Delete the branch and start over", why: "Nothing is wrong with your branch; it is just missing a commit from someone else." },
        { t: "Clone the repository again", why: "A fresh clone throws away your work to avoid a one-command fix." }
      ]
    },
    {
      q: "A fork is:",
      a: [
        { t: "A branch with a different name", why: "A branch lives in one repository. A fork is a separate repository." },
        { t: "Your own copy of someone else's repository, on GitHub", ok: true,
          why: "It is a server-side copy under your account, which is how you contribute somewhere you cannot push to directly." },
        { t: "A clone on your machine", why: "That is a clone. A fork exists on GitHub, and you usually clone your fork afterwards." },
        { t: "A permanent split from the original", why: "It can be, but usually a fork stays connected: you sync from upstream and send pull requests back." }
      ]
    }
  ]);

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
