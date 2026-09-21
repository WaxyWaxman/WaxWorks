/*
 * Wax Works service worker — the app shell and nothing else (A-1).
 *
 * Online-only in v1: this worker caches the static shell so the application
 * opens and paints without a network round-trip. It queues no write, replays
 * no request, and holds no data. A write made while offline fails visibly in
 * the screen that made it. There is deliberately no "sync" listener and no
 * IndexedDB: an offline queue is the design A-1 rejected.
 */
const VERSION = "m0-1";
const CACHE = `waxworks-shell-${VERSION}`;

// The shell. Static assets only — never a route under /api, never a Supabase
// URL, never a page whose content depends on who is signed in.
const APP_SHELL = ["/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Writes and anything that is not a plain GET go straight to the network and
  // fail there if the network is gone. Nothing is queued.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (!APP_SHELL.includes(url.pathname)) return;
  event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
});
