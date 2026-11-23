# Contributing

## Setup

```
npm install
npm start          # http://localhost:3000
npm run check      # run this before every commit
```

`npm run check` runs ESLint, the TypeScript check (`tsc`, strict, over JSDoc), Prettier and all tests.
`npm run format` fixes formatting. `npm run test:coverage` enforces the coverage thresholds used in CI.

## Code style

- Native ES modules, double quotes, 120-character lines (Prettier decides; do not hand-format).
- Every exported function has JSDoc with `@param` and `@returns`. Types such as `Profile`, `Plan`, `Place` and
  `Reading` live in `types/globals.d.ts`. Do not use `any`.
- No magic numbers: name them in `js/constants.js`. Keep functions short (limit 50 lines, complexity 8).
- All user-visible wording goes in `js/content/` (advice in `en.js`, statuses and errors in `messages.js`).
- Build DOM with `ui.el` and `textContent`. Never use `innerHTML`.
- Throw `ApiError` or `ValidationError` from `js/errors.js` instead of bare `Error` for expected failures.
- Keep DOM wiring in `js/features/`, pure logic in `js/app.js`, and secrets only in `server.js` and `lib/`.

## Add an advice rule

1. Add the wording to `EN_RULES` in `js/content/en.js` (`title`, `steps`, `why`).
2. Add the rule to `RULES` in `js/data.js` with `id`, `area`, `impact`, `effort` and an `applies(profile, band)`
   predicate. Use the names in `BAND_LEVEL`, not numbers.
3. Add a test in `tests/core.test.js` proving the rule appears for the intended profile and not for others.
   `tests/data.test.js` already checks that ids are unique and every field is filled in.
4. If the routine should mention it, add a sentence to `EN_ROUTINES` and a line in `buildRoutine` (`js/app.js`).

## Add a page feature

1. Create `js/features/<name>.js` exporting `init<Name>(deps)`; read elements with `deps.$("id", "input")`.
2. Call it from `createApp` in `js/main.js`.
3. Test pure helpers directly (`tests/features.test.js`) and the behaviour in the page (`tests/dom.test.js`).

## Pull requests

Keep changes small, explain why in the description, and add a line to `CHANGELOG.md`.
