# Contributing

Run `npm install`, `npm start`, and `npm run check` before submitting.

Use ESM imports, 120-character lines, named constants, and JSDoc for exported functions. Keep DOM wiring in feature modules and pure logic in `js/app.js`.

To add an advice rule: add English text to `js/content/en.js`, add the rule predicate to `js/data.js`, and add a core test in `tests/core.test.js` proving the rule is present under the intended profile.
