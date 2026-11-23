# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately through the repository's
"Report a vulnerability" option (GitHub Security Advisories) or by contacting the maintainers directly.
Include what you found, how to reproduce it and the impact. We aim to reply within 7 days.

## What the project already does

- Strict Content Security Policy (no inline script or style; network calls limited to the two Open-Meteo hosts),
  plus COOP, CORP, COEP, `X-Content-Type-Options`, `Referrer-Policy` and HSTS behind HTTPS.
- Every input is whitelisted and sanitised; the page builds DOM with `textContent` and never uses `innerHTML`.
- Only `index.html`, `css/` and `js/` are served; the `lib/` code and all keys stay on the server.
- Request body size limit, bounded in-memory rate limiter and server timeouts.
- Location is rounded to about 1 km before it leaves the page; nothing is stored.
- CI runs lint, type check, tests with a coverage gate and `npm audit`; Dependabot keeps dependencies current.

## Supported versions

Only the latest release receives security fixes.
