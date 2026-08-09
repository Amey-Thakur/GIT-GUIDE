/*
  File: sw.js
  Purpose: Make "works offline" true rather than a claim.
  Author: Amey Thakur
  GitHub: https://github.com/Amey-Thakur
  Tech: Service Worker API, Cache Storage
  Description: Precaches the finder and its data so the site opens with no network
               at all, then caches every other page and asset the first time it is
               visited. Serves from cache immediately and refreshes in the
               background, so pages are instant on a second visit and still correct
               on the next one. Bump VERSION to retire an old cache.
  Date: 2026-08-09
*/
"use strict";

var VERSION = "git-guide-v1";
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

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;      // never touch other hosts
  if (url.pathname.indexOf(BASE) !== 0) return;         // stay inside this site

  e.respondWith(
    caches.match(req).then(function (hit) {
      var fresh = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === "basic") {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        // Offline. A page request with nothing cached still gets the finder,
        // which is the one page always precached.
        if (hit) return hit;
        if (req.mode === "navigate") return caches.match(BASE + "index.html");
        return new Response("", { status: 504, statusText: "Offline" });
      });

      // Cached copy now, corrected copy next time.
      return hit || fresh;
    })
  );
});
