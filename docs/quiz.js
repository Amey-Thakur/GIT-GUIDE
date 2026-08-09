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

  var ROUND = 5;   // how many to ask at a time; the bank is far larger

  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* A different five each round, and the options in a different order every
     time, so the answer cannot be remembered by its position. Recall is the
     point; recognising "it was the second one" is not. */
  function deal(bank) {
    return shuffled(bank).slice(0, Math.min(ROUND, bank.length)).map(function (q) {
      return { q: q.q, a: shuffled(q.a) };
    });
  }

  function start(root, bank) {

    var questions = deal(bank);
    var at = 0;
    var answered = [];
    var picked = [];     // which option index was chosen, so Back can replay it

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

      // Back matters: going over one you got wrong is where the learning is.
      var prev = el("button", "qz-back", "Back");
      prev.type = "button";
      prev.disabled = at === 0;
      prev.addEventListener("click", function () { if (at > 0) { at -= 1; render(); } });
      foot.appendChild(prev);

      var next = el("button", "qz-next", at === questions.length - 1 ? "Finish" : "Next");
      next.type = "button";
      next.disabled = answered[at] === undefined;
      next.addEventListener("click", function () {
        if (at < questions.length - 1) { at += 1; render(); }
        else { finish(); }
      });
      foot.appendChild(next);
      root.appendChild(foot);

      // Coming back to a question you already answered shows your answer again,
      // rather than pretending you never saw it.
      if (picked[at] !== undefined) {
        choose(picked[at], opts, opts.children[picked[at]], true);
      }
    }

    function choose(i, opts, btn, replaying) {
      var q = questions[at];
      var right = q.a[i].ok === true;
      // Answer once: after that the options are a reference, not a game to retry.
      if (answered[at] === undefined) answered[at] = right;
      if (!replaying) picked[at] = i;

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
      if (bank.length > ROUND) {
        box.appendChild(el("p", "qz-bank",
          "Drawn from " + bank.length + " questions, so the next five will be different."));
      }
      var again = el("button", "qz-next", bank.length > ROUND ? "Ask me another five" : "Try again");
      again.type = "button";
      again.addEventListener("click", function () {
        questions = deal(bank);
        at = 0; answered = []; picked = [];
        render();
      });
      box.appendChild(again);
      root.appendChild(box);
    }

    render();
  }

  window.GGQuiz = mount;
})();
