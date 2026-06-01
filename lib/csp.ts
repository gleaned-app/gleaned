// Builds the Content-Security-Policy header value for a given nonce.
//
// script-src uses 'strict-dynamic' so only nonce-granted scripts (and
// scripts they load dynamically) are allowed — host-based allowlists are
// ignored, which blocks the vast majority of XSS injection vectors.
//
// style-src must include 'unsafe-inline' because React's style={{}} prop
// emits style="" attributes on DOM nodes; nonces only work on <style> blocks,
// not on per-element style attributes.
//
// media-src / img-src include data: because attachment blobs are stored as
// data: URIs. img-src also includes blob: for the export flow
// (URL.createObjectURL in SettingsModal).
//
// Dev-mode differences:
//   - upgrade-insecure-requests is omitted: the dev server runs on plain HTTP,
//     and Safari (unlike Chrome) applies this directive literally even on HTTP
//     pages, causing it to upgrade http://localhost resource loads to https://
//     which fails with a connection error → blank page.
//   - connect-src includes ws: and wss: explicitly: Safari has a bug where
//     connect-src 'self' does not automatically cover WebSocket origins, so
//     Turbopack's HMR WebSocket gets blocked.
export function buildCsp(nonce: string, isDev: boolean): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ].join(" ");

  const connectSrc = isDev ? "'self' ws: wss:" : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    ...(!isDev ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
