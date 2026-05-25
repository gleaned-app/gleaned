const CACHE = "gleaned-v3";

let swLang = "en";

const APP_SHELL = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/icon-apple.png",
];

// ── Install: pre-cache app shell (wait for explicit skipWaiting from app) ───
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL))
  );
});

// ── Update prompt: app sends SKIP_WAITING when user confirms reload ──────────
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (e.data?.type === "SET_LANG") swLang = e.data.lang;
});

// ── Activate: remove old caches ─────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch strategy ───────────────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Navigation (HTML page): network-first, fallback to cached "/"
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((r) => {
          if (r.ok) caches.open(CACHE).then((c) => c.put(request, r.clone()));
          return r;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Next.js immutable chunks (content-hashed): cache-first, never stale
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  // Other /_next/ paths (dev-mode Turbopack chunks, HMR): never cache —
  // these change without URL changes and cause stale module errors if cached.
  if (url.pathname.startsWith("/_next/")) return;

  // Dynamic server config — must not be cached; skip so the browser fetches directly
  if (url.pathname === "/config.json") return;

  // CouchDB proxy and push API — never cache; PouchDB needs live responses
  if (url.pathname.startsWith("/db/") || url.pathname.startsWith("/push/")) return;

  // Other same-origin assets (icons, manifest): stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const fetchPromise = fetch(request).then((r) => {
        if (r.ok) cache.put(request, r.clone());
        return r;
      }).catch(() => cached);
      return cached ?? fetchPromise;
    })
  );
});

// ── Push notifications ───────────────────────────────────────────────────────
self.addEventListener("push", (e) => {
  const fallbackBody = swLang === "de" ? "Was hast du heute gelernt?" : "What did you learn today?";
  let data = { title: "gleaned", body: fallbackBody, url: "/" };
  try { data = { ...data, ...e.data.json() }; } catch {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = e.notification.data?.url || "/";
  e.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (new URL(client.url).pathname === target && "focus" in client)
            return client.focus();
        }
        return clients.openWindow(target);
      })
  );
});
