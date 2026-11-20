'use strict';
// Browser-level tests: loads the real page in jsdom with a mocked network, then drives the UI.
const { test, after } = require('node:test');
const assert = require('node:assert');
const axe = require('axe-core');
const { json, tick, fakeFetch, loadPage, closeAll, submit } = require('./helpers.js');

after(closeAll);

const byId = (w, id) => w.document.getElementById(id);

test('world board loads live rows, sorted highest first, and the filter hides rows', async () => {
  const w = await loadPage();
  const rows = Array.from(w.document.querySelectorAll('#world-body tr'));
  assert.ok(rows.length >= 20);
  const aqis = rows.map((r) => Number(r.cells[1].textContent));
  assert.deepStrictEqual(aqis, [...aqis].sort((a, b) => b - a));
  byId(w, 'filter').value = 'india';
  byId(w, 'filter').dispatchEvent(new w.Event('input', { bubbles: true }));
  const visible = rows.filter((r) => !r.hidden);
  assert.ok(visible.length > 0 && visible.length < rows.length);
  visible.forEach((r) => assert.ok(/india/i.test(r.dataset.k)));
});

test('world board shows a clear error when live data fails, and refresh recovers', async () => {
  let fail = true;
  const w = await loadPage({ fetchImpl: (url, opts) => (fail ? json({}, false, 500) : fakeFetch(url, opts)) });
  assert.match(byId(w, 'world-status').textContent, /Could not load live data/);
  assert.strictEqual(byId(w, 'world-status').className, 'error');
  fail = false;
  byId(w, 'refresh').click();
  await tick();
  assert.ok(w.document.querySelectorAll('#world-body tr').length >= 20);
  assert.strictEqual(byId(w, 'refresh').disabled, false);
});

test('the world board waits until it is near the viewport before using the network', async () => {
  const urls = [];
  let reveal;
  const setup = (window) => {
    window.IntersectionObserver = class {
      constructor(callback) { this.callback = callback; reveal = () => callback([{ isIntersecting: true }]); }
      observe() {}
      disconnect() {}
    };
  };
  const w = await loadPage({ setup, fetchImpl: (url, opts) => { urls.push(url); return fakeFetch(url, opts); } });
  assert.ok(!urls.some((u) => u.includes('latitude=28.61,')), 'no world request before the section is visible');
  assert.strictEqual(w.document.querySelectorAll('#world-body tr').length, 0);
  reveal();
  await tick();
  assert.ok(w.document.querySelectorAll('#world-body tr').length >= 20);
});

test('"Use" on a world row fills the planner with that place', async () => {
  const w = await loadPage();
  w.document.querySelector('#world-body button').click();
  await tick();
  assert.ok(byId(w, 'place').value.length > 0);
  assert.ok(byId(w, 'aqi').value.length > 0);
});

test('hero search finds a place, shows live AQI and fills the planner', async () => {
  const w = await loadPage();
  byId(w, 'q').value = 'Pune';
  submit(w, byId(w, 'hero-search'));
  await tick();
  const btn = w.document.querySelector('#q-results button');
  assert.ok(btn && btn.textContent.includes('Pune, Maharashtra, India'));
  btn.click();
  await tick();
  assert.ok(byId(w, 'quick').textContent.includes('210'));
  assert.ok(byId(w, 'quick').textContent.includes('Very unhealthy'));
  assert.strictEqual(byId(w, 'aqi').value, '210');
});

test('hero search reports no results and search failures', async () => {
  const empty = await loadPage({ fetchImpl: (url, opts) => (url.includes('geocoding') ? json({}) : fakeFetch(url, opts)) });
  byId(empty, 'q').value = 'Nowhereville';
  submit(empty, byId(empty, 'hero-search'));
  await tick();
  assert.match(byId(empty, 'quick').textContent, /No places found/);

  const broken = await loadPage({ fetchImpl: (url, opts) => (url.includes('geocoding') ? json({}, false, 500) : fakeFetch(url, opts)) });
  byId(broken, 'q').value = 'Pune';
  submit(broken, byId(broken, 'hero-search'));
  await tick();
  assert.match(byId(broken, 'quick').textContent, /Search failed/);

  byId(broken, 'q').value = 'a';
  submit(broken, byId(broken, 'hero-search'));
  await tick();
  assert.match(byId(broken, 'quick').textContent, /at least 2 letters/);
});

test('a slow older search never overwrites a newer one', async () => {
  const slow = { resolve: null };
  const fetchImpl = (url, opts) => {
    if (url.includes('geocoding') && url.includes('slowtown')) {
      return new Promise((resolve) => { slow.resolve = () => resolve(json({ results: [{ name: 'Slowtown', country: 'X', latitude: 1, longitude: 1 }] })); });
    }
    return fakeFetch(url, opts);
  };
  const w = await loadPage({ fetchImpl });
  byId(w, 'q').value = 'slowtown';
  submit(w, byId(w, 'hero-search'));
  await tick(10);
  byId(w, 'q').value = 'Pune';
  submit(w, byId(w, 'hero-search'));
  await tick();
  slow.resolve();
  await tick();
  const labels = Array.from(w.document.querySelectorAll('#q-results button')).map((b) => b.textContent);
  assert.deepStrictEqual(labels, ['Pune, Maharashtra, India']);
});

test('planner place search works with the Enter key and picks a place', async () => {
  const w = await loadPage();
  byId(w, 'place').value = 'Pune';
  byId(w, 'place').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await tick();
  assert.match(byId(w, 'aqi-status').textContent, /1 places found/);
  w.document.querySelector('#place-results button').click();
  await tick();
  assert.strictEqual(byId(w, 'aqi').value, '210');
  assert.match(byId(w, 'aqi-status').textContent, /Live US AQI 210/);
});

test('"Use my location" rounds coordinates before they are sent anywhere', async () => {
  const urls = [];
  const geolocation = { getCurrentPosition: (ok) => ok({ coords: { latitude: 23.022505, longitude: 72.571365 } }) };
  const w = await loadPage({ geolocation, fetchImpl: (url, opts) => { urls.push(url); return fakeFetch(url, opts); } });
  byId(w, 'geo').click();
  await tick();
  const request = urls.find((u) => u.includes('latitude=23.02&longitude=72.57'));
  assert.ok(request, 'expected rounded coordinates in the request');
  assert.ok(!urls.some((u) => u.includes('23.022505')));
});

test('"Use my location" explains refusal and missing support', async () => {
  const denied = await loadPage({ geolocation: { getCurrentPosition: (ok, fail) => fail(new Error('denied')) } });
  byId(denied, 'geo').click();
  assert.match(byId(denied, 'aqi-status').textContent, /not shared/);
  const unsupported = await loadPage();
  Object.defineProperty(unsupported.navigator, 'geolocation', { value: undefined, configurable: true });
  byId(unsupported, 'geo').click();
  assert.match(byId(unsupported, 'aqi-status').textContent, /cannot share location/);
});

test('planner builds a ranked plan, an offline routine and announces it', async () => {
  const w = await loadPage();
  byId(w, 'aqi').value = '260';
  byId(w, 'children').checked = true;
  submit(w, byId(w, 'profile-form'));
  assert.ok(w.document.querySelectorAll('#plan .plan-list > li').length >= 5);
  assert.strictEqual(byId(w, 'ai-section').hidden, false);
  assert.deepStrictEqual(Array.from(w.document.querySelectorAll('#routine h3')).map((h) => h.textContent), ['Morning', 'Midday', 'Evening']);
  assert.match(byId(w, 'plan-status').textContent, /Plan ready: \d+ actions for AQI 260, Very unhealthy/);
  assert.strictEqual(w.document.activeElement, byId(w, 'plan-heading'));
});

test('planner uses a typical winter level when no AQI is entered', async () => {
  const w = await loadPage();
  submit(w, byId(w, 'profile-form'));
  assert.match(w.document.querySelector('.plan-summary').textContent, /typical winter level/);
});

test('planner rejects out-of-range AQI without rendering a plan, then recovers', async () => {
  const w = await loadPage();
  const aqi = byId(w, 'aqi');
  aqi.value = '501';
  submit(w, byId(w, 'profile-form'));
  assert.ok(aqi.validationMessage.includes('0 to 500'));
  assert.strictEqual(byId(w, 'ai-section').hidden, true);
  aqi.value = '200';
  aqi.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.strictEqual(aqi.validationMessage, '');
  submit(w, byId(w, 'profile-form'));
  assert.strictEqual(byId(w, 'ai-section').hidden, false);
});

test('lifestyle choices have visible labels and start on safe defaults', async () => {
  const w = await loadPage();
  for (const id of ['commute', 'cooking', 'heating', 'purifier']) {
    const label = w.document.querySelector(`label[for="${id}"]`);
    assert.ok(label && label.textContent.trim().length > 3, `${id} label`);
    assert.ok(!label.classList.contains('sr'), `${id} label must be visible`);
    assert.ok(byId(w, id).selectedOptions[0].value, `${id} has a real default`);
  }
});

test('AI button degrades gracefully when the server has no AI configured', async () => {
  const w = await loadPage();
  submit(w, byId(w, 'profile-form'));
  byId(w, 'ask').click();
  await tick();
  assert.ok(byId(w, 'ai-out').textContent.includes('AI is not available'));
  assert.strictEqual(byId(w, 'ask').disabled, false);
});

test('AI button shows the routine when the server answers, as plain text', async () => {
  const fetchImpl = (url, opts) => (url === '/api/routine' ? json({ text: 'Morning: <b>stay in</b>' }) : fakeFetch(url, opts));
  const w = await loadPage({ fetchImpl });
  submit(w, byId(w, 'profile-form'));
  byId(w, 'ask').click();
  await tick();
  const pre = w.document.querySelector('#ai-out pre');
  assert.strictEqual(pre.textContent, 'Morning: <b>stay in</b>');
  assert.strictEqual(pre.querySelector('b'), null);
});

test('AI button asks for a plan first', async () => {
  const w = await loadPage();
  byId(w, 'ai-section').hidden = false;
  byId(w, 'ask').click();
  await tick(10);
  assert.match(byId(w, 'ai-out').textContent, /Build your plan first/);
});

test('user text is never interpreted as HTML (XSS)', async () => {
  const w = await loadPage();
  byId(w, 'place').value = '<img src=x onerror=alert(1)>';
  submit(w, byId(w, 'profile-form'));
  assert.strictEqual(w.document.querySelectorAll('#plan img, #quick img').length, 0);
  assert.ok(!byId(w, 'plan').innerHTML.includes('<img'));
});

test('page uses safe, deferred script assets in dependency order', async () => {
  const w = await loadPage();
  assert.strictEqual(w.document.querySelector('meta[name="viewport"]').getAttribute('content'), 'width=device-width, initial-scale=1');
  const scripts = Array.from(w.document.querySelectorAll('script[src]'));
  assert.deepStrictEqual(scripts.map((s) => s.getAttribute('src')), ['js/data.js', 'js/app.js', 'js/air-api.js', 'js/ui.js', 'js/views.js', 'js/main.js']);
  scripts.forEach((s) => assert.ok(s.defer, `${s.src} should be deferred`));
  assert.strictEqual(w.document.querySelectorAll('script:not([src])').length, 0, 'no inline scripts');
});

test('haze slider updates the reading and advice', async () => {
  const w = await loadPage();
  const range = byId(w, 'hazeRange');
  range.value = '320';
  range.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.strictEqual(byId(w, 'hazeName').textContent, 'Hazardous');
  assert.strictEqual(byId(w, 'hazeVal').textContent, '320');
});

test('AI evaluation dashboard is not included in the website', async () => {
  const w = await loadPage();
  assert.strictEqual(w.document.querySelector('#evaluation'), null);
  assert.strictEqual(w.document.querySelector('[data-score]'), null);
  assert.strictEqual(w.document.body.textContent.includes('AI Evaluation Score'), false);
});

test('accessibility: no axe-core violations (page and built plan)', async () => {
  const w = await loadPage();
  submit(w, byId(w, 'profile-form'));
  w.eval(axe.source);
  const res = await w.axe.run(w.document, { rules: { 'color-contrast': { enabled: false } } });
  const found = Array.from(res.violations).map((v) => `${v.id}: ${Array.from(v.nodes).map((n) => Array.from(n.target).join(' ')).join(', ')}`);
  assert.strictEqual(found.length, 0, found.join('\n'));
});
