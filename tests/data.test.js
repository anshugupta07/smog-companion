'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const Data = require('../js/data.js');
const Api = require('../js/air-api.js');

test('rules have unique ids and complete, valid fields', () => {
  const seen = new Set();
  for (const rule of Data.RULES) {
    assert.ok(!seen.has(rule.id), `duplicate id ${rule.id}`);
    seen.add(rule.id);
    assert.ok(rule.area.length > 3, `${rule.id}.area`);
    for (const field of ['title', 'steps', 'why']) assert.ok(rule[field] && rule[field].length > 10, `${rule.id}.${field}`);
    assert.ok(rule.impact in Data.IMPACT_WEIGHT, `${rule.id} impact`);
    assert.ok(rule.effort in Data.IMPACT_WEIGHT, `${rule.id} effort`);
    assert.strictEqual(typeof rule.applies, 'function');
  }
});

test('AQI bands are ordered, contiguous and end at 500', () => {
  Data.BANDS.forEach((band, i) => {
    assert.strictEqual(band.level, i);
    if (i > 0) assert.ok(band.max > Data.BANDS[i - 1].max);
  });
  assert.strictEqual(Data.BANDS[Data.BANDS.length - 1].max, 500);
});

test('static data is deeply protected from accidental edits', () => {
  [Data.CITIES, Data.ENUMS, Data.BANDS, Data.RULES, Data.WORLD, Data.IMPACT_WEIGHT].forEach((value) => assert.ok(Object.isFrozen(value)));
});

test('WORLD list has valid, unique places', () => {
  assert.ok(Data.WORLD.length >= 20);
  Data.WORLD.forEach((place) => assert.ok(Api.validCoord(place.lat, place.lon), place.name));
  assert.strictEqual(new Set(Data.WORLD.map((p) => p.name)).size, Data.WORLD.length);
});

test('isSensitive is true for any vulnerable group only', () => {
  assert.strictEqual(Data.isSensitive({}), false);
  assert.strictEqual(Data.isSensitive({ pregnant: true }), true);
});
