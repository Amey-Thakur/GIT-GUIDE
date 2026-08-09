/*
  File: offline.js
  Purpose: Register the service worker that makes the site work with no network.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Service Worker API
  Description: Registration is deliberately quiet and entirely optional. If the
               browser has no support, or registration fails, the site behaves
               exactly as it always did.
  Date: 2026-08-09
*/
(function () {
  "use strict";
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () {
      /* Nothing to tell the user: the site works, it just will not work offline. */
    });
  });
})();
