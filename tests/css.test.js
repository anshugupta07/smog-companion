'use strict';
// Static checks on the stylesheet: responsive strategy, touch targets and user-preference support.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('layout is mobile-first with growing breakpoints', () => {
  const mins = [...css.matchAll(/@media \(min-width: ([\d.]+)rem\)/g)].map((m) => Number(m[1]));
  assert.deepStrictEqual(mins, [...mins].sort((a, b) => a - b), 'min-width queries should be in ascending order');
  assert.ok(mins.length >= 4, 'tablet, laptop and desktop breakpoints');
  assert.ok(css.includes('@media (max-width: 39.99rem)'), 'phone-only card layout for the world board');
});

test('touch targets are at least 44px and the page never scrolls sideways', () => {
  assert.match(css, /--tap: 2\.75rem/);
  assert.ok(css.includes('min-height: var(--tap)'));
  assert.ok(css.includes('overflow-x: clip'));
  assert.ok(css.includes('env(safe-area-inset-left)'));
  assert.ok(css.includes('text-size-adjust'));
});

test('user preferences are respected', () => {
  for (const query of ['prefers-reduced-motion: reduce', 'forced-colors: active', 'hover: hover', 'print']) {
    assert.ok(css.includes(`@media (${query})`) || css.includes(`@media ${query}`), query);
  }
  assert.ok(css.includes(':focus-visible'));
});

test('rendering cost is limited for below-the-fold sections', () => {
  assert.ok(css.includes('content-visibility: auto'));
});

test('no !important outside the hidden attribute fix and the motion/print preferences', () => {
  const uses = css.split('\n').filter((line) => line.includes('!important'));
  uses.forEach((line) => assert.ok(/\[hidden\]|animation: none|display: none/.test(line), line.trim()));
});

test('every class used in index.html has a style rule or is a documented hook', () => {
  const hooks = new Set(['results', 'row', 'wrap']);
  const used = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
  const missing = [...used].filter((name) => !hooks.has(name) && !css.includes(`.${name}`));
  assert.deepStrictEqual(missing, []);
});

test('the stylesheet has no leftover vendor hacks or dead overrides', () => {
  assert.ok(!css.includes('#planner label'), 'planner styles should not be patched by id overrides');
  assert.ok(!/\r/.test(css), 'LF line endings');
});
