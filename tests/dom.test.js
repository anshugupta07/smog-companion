'use strict';
// Browser-level tests: loads the real page in jsdom with a mocked network, then drives the UI.
const { test, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { JSDOM } = require('jsdom');
const axe = require('axe-core');

const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const reading = { current: { us_aqi: 210, pm2_5: 120, pm10: 180, time: '2026-11-18T10:00' } };

function fakeFetch(url) {
  if (url.includes('geocoding-api')) return json({ results: [{ name: 'Pune', admin1: 'Maharashtra', country: 'India', latitude: 18.52, longitude: 73.86 }] });
  if (url.includes('air-quality-api')) {
    const n = url.match(/latitude=([^&]*)/)[1].split(',').length;
    return json(n > 1 ? Array.from({ length: n }, (_, i) => ({ current: { ...reading.current, us_aqi: 100 + i * 5 } })) : reading);
  }
  return json({ error: 'AI is not configured on this server.' }, false, 503);
}
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const opened = [];
after(() => opened.forEach((w) => w.close()));

async function load() {
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = async (u) => fakeFetch(String(u));
      w.Element.prototype.scrollIntoView = function () {};
      w.HTMLCanvasElement.prototype.getContext = () => null;
    },
  });
  if (dom.window.document.readyState !== 'complete') await new Promise((r) => dom.window.addEventListener('load', r));
  await tick(150);
  opened.push(dom.window);
  return dom;
}
const submit = (w, form) => form.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));

test('world board loads live rows, sorted highest first, and the filter hides rows', async () => {
  const { window: w } = await load(); const d = w.document;
  const rows = Array.from(d.querySelectorAll('#world-body tr'));
  assert.ok(rows.length >= 20);
  const aqis = rows.map((r) => Number(r.cells[1].textContent));
  assert.deepStrictEqual(aqis, [...aqis].sort((a, b) => b - a));
  d.getElementById('filter').value = 'india';
  d.getElementById('filter').dispatchEvent(new w.Event('input', { bubbles: true }));
  const visible = rows.filter((r) => !r.hidden);
  assert.ok(visible.length > 0 && visible.length < rows.length);
  visible.forEach((r) => assert.ok(/india/i.test(r.dataset.k)));
});

test('hero search finds a place, shows live AQI and fills the planner', async () => {
  const { window: w } = await load(); const d = w.document;
  d.getElementById('q').value = 'Pune';
  submit(w, d.getElementById('hero-search')); await tick();
  const btn = d.querySelector('#q-results button');
  assert.ok(btn && btn.textContent.includes('Pune, Maharashtra, India'));
  btn.click(); await tick();
  assert.ok(d.getElementById('quick').textContent.includes('210'));
  assert.ok(d.getElementById('quick').textContent.includes('Very unhealthy'));
  assert.strictEqual(d.getElementById('aqi').value, '210');
});

test('planner builds a ranked plan and an offline routine', async () => {
  const { window: w } = await load(); const d = w.document;
  d.getElementById('aqi').value = '260'; d.getElementById('children').checked = true;
  submit(w, d.getElementById('profile-form'));
  assert.ok(d.querySelectorAll('#plan article').length >= 5);
  assert.strictEqual(d.getElementById('ai-section').hidden, false);
  assert.deepStrictEqual(Array.from(d.querySelectorAll('#routine h3')).map((h) => h.textContent), ['Morning', 'Midday', 'Evening']);
});

test('planner rejects out-of-range AQI without rendering a plan', async () => {
  const { window: w } = await load(); const d = w.document;
  d.getElementById('aqi').value = '501';
  submit(w, d.getElementById('profile-form'));
  assert.ok(d.getElementById('aqi').validationMessage.includes('0 to 500'));
  assert.strictEqual(d.getElementById('ai-section').hidden, true);
});

test('AI button degrades gracefully when the server has no AI configured', async () => {
  const { window: w } = await load(); const d = w.document;
  submit(w, d.getElementById('profile-form'));
  d.getElementById('ask').click(); await tick();
  assert.ok(d.getElementById('ai-out').textContent.includes('AI is not available'));
  assert.strictEqual(d.getElementById('ask').disabled, false);
});

test('user text is never interpreted as HTML (XSS)', async () => {
  const { window: w } = await load(); const d = w.document;
  d.getElementById('place').value = '<img src=x onerror=alert(1)>';
  submit(w, d.getElementById('profile-form'));
  assert.strictEqual(d.querySelectorAll('#plan img, #quick img').length, 0);
  assert.ok(!d.getElementById('plan').innerHTML.includes('<img'));
});

test('page includes viewport and safe responsive script assets', async () => {
  const { window: w } = await load(); const d = w.document;
  assert.strictEqual(d.querySelector('meta[name="viewport"]').getAttribute('content'), 'width=device-width, initial-scale=1');
  assert.deepStrictEqual(
    Array.from(d.querySelectorAll('script[src]')).map((s) => s.getAttribute('src')),
    ['js/app.js', 'js/ui.js', 'js/main.js'],
  );
});

test('accessibility: no axe-core violations (page and built plan)', async () => {
  const { window: w } = await load(); const d = w.document;
  submit(w, d.getElementById('profile-form'));
  w.eval(axe.source);
  const res = await w.axe.run(d, { rules: { 'color-contrast': { enabled: false } } });
  const found = Array.from(res.violations).map((v) => `${v.id}: ${Array.from(v.nodes).map((n) => Array.from(n.target).join(' ')).join(', ')}`);
  assert.strictEqual(found.length, 0, found.join('\n'));
});
