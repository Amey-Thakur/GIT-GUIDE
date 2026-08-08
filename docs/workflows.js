/*
  File: workflows.js
  Purpose: The step definitions for the release-and-hotfix diagram.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript, driven by stepper.js
  Description: Six steps from work on main to a shipped hotfix merged back: commit, tag, keep moving, branch from the tag, tag the fix, return the cure.
  Date: 2026-08-08
*/

(function () {
  "use strict";

  var ALL = ["w-1", "w-2", "w-3", "w-4", "w-5", "w-6"];
  var upto = function (n) { return ALL.slice(0, n); };

  window.GGStepper({
    prefix: "d4",
    reveals: ALL,
    steps: [
      { show: upto(1), on: ["w-1"], cmd: "git commit", text: "Work lands on main, commit after commit. main stays releasable at every one of them." },
      { show: upto(2), on: ["w-2"], cmd: "git tag -a v2.1.0 -m \"<note>\"", text: "A release is nothing but a tag: a permanent name on one exact commit." },
      { show: upto(3), on: ["w-3"], cmd: "git commit", text: "Work continues past the release. The tag stays planted while main moves on." },
      { show: upto(4), on: ["w-4"], cmd: "git switch -c hotfix-2.1.1 v2.1.0", text: "A bug ships? Branch from the tag itself and fix exactly what users are running, untouched by newer work." },
      { show: upto(5), on: ["w-5"], cmd: "git tag -a v2.1.1 -m \"<fix note>\"", text: "The fix ships as its own tag from the hotfix line. Users upgrade one clean step." },
      { show: upto(6), on: ["w-6"], cmd: "git merge hotfix-2.1.1", text: "Merge the fix back so main keeps the cure, and the line carries on. The branch retires." }
    ]
  });
})();
