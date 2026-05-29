// Bump this on every deploy. Each new version triggers a full cache wipe in
// the activate handler below, eliminating any chance that old content-hashed
// chunks linger after a deployment.
const CACHE = "gleaned-v8";

let swLang = "en";

// Only static, content-stable assets here. The HTML page ("/") is intentionally
// NEVER cached during install — caches.addAll() goes through the browser's HTTP
// cache and would happily store a stale heuristically-cached HTML, which then
// references content-hashed chunk URLs that no longer exist on the server →
// 404 → blank page. The navigation handler below uses cache: "no-store" and
// does not write the response back to the cache, so the HTML is always fresh.
const APP_SHELL = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/icon-apple.png",
];

// ── Install: pre-cache static assets (icons, manifest — not the HTML page) ──
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

// ── Self-heal: when a deployed HTML references chunks that no longer exist on
// the server (mismatched build, partial deploy, browser-cached HTML, etc.) the
// resulting 404 leaves the page blank. Detect that case here and tell every
// open client to wipe its caches and reload exactly once.
let healing = false;
async function selfHeal() {
  if (healing) return;
  healing = true;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) c.postMessage({ type: "SW_RELOAD_FOR_RECOVERY" });
  } finally {
    // Allow another heal attempt later if things are still broken after reload.
    setTimeout(() => { healing = false; }, 30_000);
  }
}

// ── Fetch strategy ───────────────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Navigation (HTML page): network-only with cache: "no-store" so the browser's
  // HTTP cache can't return a heuristically-cached old HTML. We deliberately do
  // NOT write the response into the SW cache — caching HTML across deploys is
  // exactly how stale chunk references end up haunting users for hours.
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request, { cache: "no-store" }).catch(() => {
        // Last-resort offline page: a bare 503. We avoid serving stale HTML on
        // purpose; the user can hit reload once they're back online.
        return new Response(
          "<!doctype html><meta charset=utf-8><title>Offline</title>" +
          "<p style=font:16px/1.5 system-ui;padding:2rem>" +
          "Offline — please reconnect and reload.</p>",
          { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Next.js immutable chunks (content-hashed): cache-first. If the network
  // returns 404, the chunk is permanently gone — trigger a self-heal so every
  // open tab wipes caches and reloads. Without this the page stays blank
  // forever even after the deploy completes.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok) {
          cache.put(request, res.clone());
        } else if (res.status === 404) {
          // Stale HTML is referencing a chunk that no longer exists. Heal.
          selfHeal();
        }
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

  // Push API — never cache
  if (url.pathname.startsWith("/api/push/")) return;

  // Other same-origin assets (icons, manifest): stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const fetchPromise = fetch(request).then((r) => {
        if (r.ok) cache.put(request, r.clone());
        return r;
      }).catch(() => cached ?? new Response("", { status: 503 }));
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
