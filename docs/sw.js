/*
  File: sw.js
  Purpose: Make "works offline" true rather than a claim.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Service Worker API, Cache Storage
  Description: Precaches the finder and its data so the site opens with no network
               at all, then caches every other page and asset the first time it is
               visited. Network first so a deploy is never served stale, with the
               cache as the fallback that makes the site work with no network at
               all. Bump VERSION to retire an old cache.
  Date: 2026-08-09
*/
"use strict";

var VERSION = "git-guide-v2";
var BASE = new URL("./", self.location).pathname;

/* Enough to open the site and answer a question with no network. The heavier
   pages are not precached: making a first visit download the whole corpus to
   pay for an offline visit that may never happen is the wrong trade. */
var CORE = [
  "",
  "index.html",
  "style.css",
  "app.js",
  "render.js",
  "theme.js",
  "hello.js",
  "check.js",
  "data/intents.json",
  "assets/git-logo.svg"
].map(function (p) { return BASE + p; });

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      // One failure must not fail the whole install, or a single renamed asset
      // leaves every visitor without a worker at all.
      return Promise.all(CORE.map(function (url) {
        return c.add(url).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === VERSION ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Network first, cache as the fallback.

   The first version of this served from cache and refreshed behind the scenes.
   That is faster, and wrong for this site: every deploy left visitors looking at
   the previous version, and worse, a new page could be paired with an old
   stylesheet. Correctness beats the few milliseconds. The cache is what makes
   the site work with no network, not what makes it quick. */
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;      // never touch other hosts
  if (url.pathname.indexOf(BASE) !== 0) return;         // stay inside this site

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && res.type === "basic") {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        // Offline and never seen: the finder is always precached, and it holds
        // every answer, so it is a genuinely useful place to land.
        if (req.mode === "navigate") return caches.match(BASE + "index.html");
        return new Response("", { status: 504, statusText: "Offline" });
      });
    })
  );
});
