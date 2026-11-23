/**
 * Security headers shared by every response. The CSP is the single source of truth:
 * a test checks that the <meta> CSP in index.html allows the same sources, so static
 * hosting (where this server is absent) stays equally strict.
 */
const OPEN_METEO_HOSTS = ["https://geocoding-api.open-meteo.com", "https://air-quality-api.open-meteo.com"];

const CSP_DIRECTIVES = Object.freeze({
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'"],
  "img-src": ["'self'", "data:"],
  "connect-src": ["'self'", ...OPEN_METEO_HOSTS],
  "object-src": ["'none'"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
  "frame-ancestors": ["'none'"], // ignored in <meta>, so only set as a header
});

const CONTENT_SECURITY_POLICY = Object.entries(CSP_DIRECTIVES)
  .map(([name, sources]) => `${name} ${sources.join(" ")}`)
  .join("; ");

const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "X-DNS-Prefetch-Control": "off",
  "X-Permitted-Cross-Domain-Policies": "none",
  "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=(), usb=()",
});

const HSTS = "max-age=31536000; includeSubDomains";

export { CSP_DIRECTIVES, CONTENT_SECURITY_POLICY, SECURITY_HEADERS, HSTS };
