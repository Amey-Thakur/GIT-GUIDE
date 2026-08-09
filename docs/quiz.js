/*
  File: quiz.js
  Purpose: A short self-check, so a page can ask instead of only telling.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Vanilla JavaScript
  Description: Mounts a one-question-at-a-time check into any element. Answering is
               the point, not scoring: every option explains itself the moment it is
               chosen, a wrong answer is never a dead end, and the whole thing is
               short enough that nobody feels tested.
  Date: 2026-08-09
*/
(function () {
  "use strict";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* The questions live in docs/data/quizzes.json, like every other answer on
     this site, so the page and the structured data in its head are rendered
     from one source and cannot drift apart. */
  function mount(id, quizId) {
    var root = document.getElementById(id);
    if (!root) return;
    fetch("data/quizzes.json")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var quiz = (d.quizzes || []).filter(function (q) { return q.id === quizId; })[0];
        if (quiz && quiz.questions && quiz.questions.length) start(root, quiz.questions);
      })
      .catch(function () { /* no check today; the page above it still teaches */ });
  }

  function start(root, questions) {

    var at = 0;
    var answered = [];

    function render() {
      root.innerHTML = "";

      var head = el("div", "qz-head");
      head.appendChild(el("p", "qz-step", "Question " + (at + 1) + " of " + questions.length));
      var dots = el("span", "qz-dots");
      questions.forEach(function (_, i) {
        var d = el("span", "qz-dot" +
          (answered[i] === true ? " is-right" : answered[i] === false ? " is-wrong" : "") +
          (i === at ? " is-now" : ""));
        dots.appendChild(d);
      });
      head.appendChild(dots);
      root.appendChild(head);

      var q = questions[at];
      root.appendChild(el("p", "qz-q", q.q));

      var opts = el("div", "qz-opts");
      q.a.forEach(function (opt, i) {
        var b = el("button", "qz-opt");
        b.type = "button";
        b.textContent = opt.t;
        b.addEventListener("click", function () { choose(i, opts, b); });
        opts.appendChild(b);
      });
      root.appendChild(opts);

      root.appendChild(el("p", "qz-why"));

      var foot = el("div", "qz-foot");
      var next = el("button", "qz-next", at === questions.length - 1 ? "Finish" : "Next question");
      next.type = "button";
      next.disabled = true;
      next.addEventListener("click", function () {
        if (at < questions.length - 1) { at += 1; render(); }
        else { finish(); }
      });
      foot.appendChild(next);
      root.appendChild(foot);
    }

    function choose(i, opts, btn) {
      var q = questions[at];
      var right = q.a[i].ok === true;
      // Answer once: after that the options are a reference, not a game to retry.
      if (answered[at] === undefined) answered[at] = right;

      Array.prototype.forEach.call(opts.children, function (b, j) {
        b.disabled = true;
        b.classList.toggle("is-right", q.a[j].ok === true);
        b.classList.toggle("is-chosen", j === i);
      });
      btn.classList.add(right ? "picked-right" : "picked-wrong");

      var why = root.querySelector(".qz-why");
      why.innerHTML = (right ? '<b class="qz-yes">Yes. </b>' : '<b class="qz-no">Not quite. </b>') + q.a[i].why;
      why.classList.add("is-shown");

      root.querySelector(".qz-next").disabled = false;
      render_dots();
    }

    function render_dots() {
      var dots = root.querySelectorAll(".qz-dot");
      questions.forEach(function (_, i) {
        if (!dots[i]) return;
        dots[i].classList.toggle("is-right", answered[i] === true);
        dots[i].classList.toggle("is-wrong", answered[i] === false);
      });
    }

    function finish() {
      var right = answered.filter(function (v) { return v === true; }).length;
      root.innerHTML = "";
      var box = el("div", "qz-done");
      box.appendChild(el("p", "qz-score", right + " of " + questions.length));
      box.appendChild(el("p", "qz-note",
        right === questions.length
          ? "All of them. You are not memorising commands any more, you are reading the model."
          : right >= questions.length - 1
            ? "Close to all of it. The one you missed is the one worth rereading above."
            : "Worth another pass over the diagram above; these answers are all in it."));
      var again = el("button", "qz-next", "Try again");
      again.type = "button";
      again.addEventListener("click", function () { at = 0; answered = []; render(); });
      box.appendChild(again);
      root.appendChild(box);
    }

    render();
  }

  window.GGQuiz = mount;
})();
