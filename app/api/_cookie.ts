// True when running in production OR when HTTPS=true is set explicitly.
// The explicit flag lets a reverse-proxy setup (e.g. Traefik terminating TLS
// in front of a dev/staging server) still get Secure cookies without setting
// NODE_ENV=production.
export const secureCookie =
  process.env.NODE_ENV === "production" || process.env.HTTPS === "true";
