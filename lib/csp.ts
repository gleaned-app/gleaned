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
export function buildCsp(nonce: string, isDev: boolean): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ].join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}
