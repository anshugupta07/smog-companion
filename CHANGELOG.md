# Changelog

## 2.2.0

### Quality

- Type checking is now real: `checkJs` was off, so `tsc` checked nothing. It is on in strict mode and passes with no
  `any`, using shared types in `types/globals.d.ts`.
- Added `js/dom.js` (typed, fail-fast element lookup) and removed about 60 scattered `getElementById` calls.
- Moved every status and error sentence to `js/content/messages.js` and the AI prompt wording to `content/en.js`.
- Added `js/constants.js` (AQI range, band levels, timeouts, HTTP statuses, text limits); removed duplicated constants
  and the magic numbers that the lint rule used to whitelist (`10`, `60`, `1000`).
- Moved named errors to `js/errors.js` so the browser uses them too (`ApiError`, `ValidationError`).
- Removed the unused city lookup (`CITIES`) and the dead 380-line `tests/tests.js`.
- Split `server.js` into `lib/body.js` and `lib/station.js`; coordinate validation is shared (`js/coordinates.js`).
- Simplified `createApp`, split long functions, enforced braces on every `if`/`for`.
- Added `.prettierrc.json` (120 columns) so formatting matches the contributing guide.

### Fixes

- Graceful shutdown: the force-exit timer was unreachable because `process.exit` ran first.
- The browser no longer calls `/api/aqi` for every reading once the server has said it has no station provider.
- README privacy section now describes the station route accurately.

### Tests

- 103 to 129 tests; coverage about 99% of lines and 94% of branches, with thresholds enforced in CI.

### Accessibility and quality gates (2.2.0)

- Text colours now meet WCAG AAA (7:1): darker `--muted`, `--brand`, `--brand-2`, `--danger`, placeholder and hero
  text; a test checks the tokens and a pixel-level audit of 854 rendered text lines found none below AAA.
- AQI numbers are `<strong>` instead of styled `<p>` (axe `p-as-heading`); the hero badges are a real list.
- ESLint now requires typed JSDoc (`@param`, `@returns`) on every function and applies the size, complexity and
  magic-number limits to the server code too (no exemptions except data and constants files).
- Server refactor: `createApp` is a small router over `createRoutineHandler` and `createStationHandler`; settings
  live in `lib/config.js`; `askAI`, the static handler and the station parser were split into short functions.
- Added `LICENSE`, `SECURITY.md` and a pull request template.
