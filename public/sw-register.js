// Register the service worker and wire up self-heal recovery.
// When the SW detects a stale-chunk 404 it broadcasts SW_RELOAD_FOR_RECOVERY;
// every open tab then performs a single hard reload to pick up the current
// build's HTML and chunks.
(function () {
  if (!("serviceWorker" in navigator)) return;

  // sessionStorage marker prevents a reload loop if the new HTML is somehow
  // still broken — we only auto-recover once per tab session.
  var RECOVERED_KEY = "gleaned-sw-recovered";

  navigator.serviceWorker.register("/sw.js").then(function (reg) {
    // Force a check for a new SW on every page load. The browser otherwise
    // only checks every 24h, which can keep an old SW alive far too long.
    try { reg.update(); } catch (_e) { /* ignore */ }
  });

  navigator.serviceWorker.addEventListener("message", function (e) {
    if (!e.data || e.data.type !== "SW_RELOAD_FOR_RECOVERY") return;
    if (sessionStorage.getItem(RECOVERED_KEY)) return;
    sessionStorage.setItem(RECOVERED_KEY, "1");
    // location.reload() respects the HTTP cache for sub-resources; the SW has
    // already wiped its caches, and the server sends Cache-Control: no-store
    // for HTML, so a plain reload is sufficient to fetch the current build.
    window.location.reload();
  });
})();
