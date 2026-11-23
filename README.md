# Smog Companion

A website for families facing winter smog. Search any place in the world, see its live air quality, and get a ranked plan of low-emission routines, indoor air fixes and greener alternatives, with the impact of each explained. A world board shows live AQI for 30 major cities. A rule-based daily routine works offline; an optional AI step improves it through a secure server-side proxy.

## Run

```
npm install
npm start            # http://localhost:3000
```

Optional AI (the key stays on the server, never in the browser):

```
AI_ENDPOINT=https://api.openai.com/v1/chat/completions AI_API_KEY=... AI_MODEL=gpt-4o-mini npm start
```

Optional nearest monitoring-station AQI:

```
WAQI_API_TOKEN=... npm start
```

The station provider is used through the server at `/api/aqi`; static hosts and servers
without this token fall back to Open-Meteo model data.
Without these variables the site still works fully; the "Improve this with AI" button explains that AI is not configured.
The front end is also static: host `index.html`, `css/` and `js/` on GitHub Pages or Netlify (live AQI works, the AI button needs the Node server).

| Variable                                | Purpose                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `PORT`                                  | Port to listen on (default 3000)                                                        |
| `AI_ENDPOINT`, `AI_API_KEY`, `AI_MODEL` | Enable `POST /api/routine` with any OpenAI-compatible API                               |
| `WAQI_API_TOKEN`                        | Enable nearest monitoring-station AQI through `/api/aqi`                                |
| `TRUST_PROXY=1`                         | Behind one reverse proxy: use the real client IP for rate limits and send HSTS on HTTPS |

`GET /healthz` returns `{"status":"ok"}` for uptime checks.

## Quality checks

```
npm run check          # eslint + type check (tsc) + Prettier + all tests
npm run format         # auto-format everything with Prettier
npm run test:coverage  # tests with a coverage report and thresholds (about 99% of lines)
```

- Unit tests: AQI bands, rules, sanitising, plan and routine (`core`, `data`), live-data layer with mocked network (`air-api`), AI adapter (`ai`), rate limiter, views
- Browser-level tests in jsdom: search flow, stale-response guard, geolocation, plan, XSS, AI success and failure, lazy world board, axe-core audit (`dom`)
- Server tests: path traversal, headers and CSP, Brotli/gzip, ETag/304, input validation, body limit, rate limit, key never leaked, real process start and SIGTERM shutdown (`server`, `start`)
- Stylesheet checks: mobile-first breakpoints, 44px touch targets, reduced motion, forced colours, print (`css`)
- GitHub Actions runs lint, tests on Node 20 and 22, a coverage gate and `npm audit` on every push

## Structure

```
index.html, css/styles.css     page and mobile-first styles
js/constants.js, js/errors.js  shared constants and named error classes
js/coordinates.js              coordinate validation (browser and server)
js/data.js, js/content/        advice rules and bands; all wording lives in content/ (en.js, messages.js)
js/app.js                      pure logic: parse, sanitise, plan, routine, AI prompt
js/air-api.js                  Open-Meteo and station readings with cache and request merging
js/dom.js, js/ui.js            typed element lookup and DOM helpers (text only, no innerHTML)
js/views.js                    view builders
js/features/                   one module per feature (haze, place search, world board, hero search, planner, AI)
js/main.js                     createApp(deps): builds the dependencies and starts every feature
server.js                      routing for the static server, AI proxy and station route
lib/                           security headers, rate limiter, static files, body reader, AI and station clients
types/globals.d.ts             shared types for the JSDoc annotations
tests/                         node:test suites
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together and [CONTRIBUTING.md](CONTRIBUTING.md) before changing code.

Browser and Node code use native ES modules and JSDoc types checked by `tsc` in strict mode, with no runtime bundler or build step. Browser integration tests run the real page in jsdom through the exported `createApp(deps)` factory.

## Performance

Scripts are deferred, static files are served with Brotli/gzip and ETags, the live world board loads only when it nears the viewport, repeated requests are cached for 10 minutes and duplicate in-flight requests are merged, and below-the-fold sections use `content-visibility`.

## Data

Live data comes from Open-Meteo (geocoding and air quality, no API key). AQI is the US AQI scale, modelled data that can differ from local monitoring stations. Check your national air quality service too.

## Security and privacy

Strict Content Security Policy (network calls limited to the two Open-Meteo hosts, no inline script or style), security headers including COOP/CORP/COEP and HSTS behind HTTPS, whitelisted and sanitised inputs, no innerHTML, only `index.html`, `css/` and `js/` are served, request size limit, bounded rate limiter, server timeouts and generic error messages. Location is used only when you press "Use my location" and is rounded to about 1 km first. The rounded coordinates go to Open-Meteo and to this site's own `/api/aqi` route, which forwards them to the station provider only if you configured `WAQI_API_TOKEN`. Nothing is stored.

## Accessibility

Skip link, landmarks, visible labels on every field, text labels alongside colour, a live status message when the plan is ready, focus moved to the plan, 44px touch targets, visible focus, reduced-motion and forced-colours support, and a no-JavaScript notice. Checked with axe-core in jsdom and in a real browser.

## Disclaimer

General guidance, not medical advice. Figures marked as estimates are approximate.
