'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { createRateLimiter } = require('../lib/rate-limit.js');

test('allows up to max hits per window, then limits, then resets', () => {
  let time = 0;
  const limited = createRateLimiter({ windowMs: 1000, max: 3, now: () => time });
  assert.deepStrictEqual([1, 2, 3, 4].map(() => limited('a')), [false, false, false, true]);
  assert.strictEqual(limited('b'), false, 'keys are independent');
  time = 1000;
  assert.strictEqual(limited('a'), false, 'a new window starts');
});

test('the key table is capped so memory cannot grow without bound', () => {
  const limited = createRateLimiter({ windowMs: 60000, max: 1, maxKeys: 3, now: () => 0 });
  ['a', 'b', 'c', 'd', 'e'].forEach((key) => limited(key));
  assert.strictEqual(limited('a'), false, 'oldest keys were evicted, so "a" starts fresh');
});
