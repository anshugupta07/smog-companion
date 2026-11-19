'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createApp } = require('../server.js');

function start(opts) {
  return new Promise((resolve) => { const s = createApp(opts).listen(0, '127.0.0.1', () => resolve({ s, port: s.address().port })); });
}
function request(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = ''; res.on('data', (c) => { data += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}
const post = (port, obj, raw) => request(port, { method: 'POST', path: '/api/routine', headers: { 'Content-Type': 'application/json' }, body: raw || JSON.stringify(obj) });
const env = { AI_ENDPOINT: 'https://ai.test/v1', AI_API_KEY: 'secret-key', AI_MODEL: 'm' };

test('serves the site with security headers', async () => {
  const { s, port } = await start();
  const r = await request(port);
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.includes('Smog Companion'));
  assert.ok(r.headers['content-security-policy'].includes("script-src 'self'"));
  assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual((await request(port, { path: '/js/app.js' })).status, 200);
  s.close();
});

test('does not expose server files or allow path traversal', async () => {
  const { s, port } = await start();
  for (const p of ['/server.js', '/package.json', '/tests/tests.js', '/..%2fpackage.json', '/js/..%2f..%2fserver.js', '/%00', '/%E0%A4%A']) {
    assert.strictEqual((await request(port, { path: p })).status, 404, p);
  }
  assert.strictEqual((await request(port, { method: 'DELETE' })).status, 405);
  s.close();
});

test('POST /api/routine validates input', async () => {
  const { s, port } = await start({ env });
  assert.strictEqual((await post(port, null, '{bad')).status, 400);
  assert.strictEqual((await post(port, { nope: 1 })).status, 400);
  assert.strictEqual((await request(port, { method: 'POST', path: '/api/routine', headers: { 'Content-Type': 'text/plain' }, body: 'x' })).status, 415);
  assert.strictEqual((await post(port, { profile: { city: 'x'.repeat(9000) } })).status, 413);
  assert.strictEqual((await request(port, { path: '/api/routine' })).status, 405);
  s.close();
});

test('POST /api/routine rejects an oversized declared body before parsing', async () => {
  const { s, port } = await start({ env });
  const r = await request(port, {
    method: 'POST',
    path: '/api/routine',
    headers: { 'Content-Type': 'application/json', 'Content-Length': '4097' },
    body: '',
  });
  assert.strictEqual(r.status, 413);
  s.close();
});

test('POST /api/routine reports missing AI config without leaking anything', async () => {
  const { s, port } = await start({ env: {} });
  const r = await post(port, { profile: { aqi: 200 } });
  assert.strictEqual(r.status, 503);
  s.close();
});

test('POST /api/routine calls the AI on the server and never returns the key', async () => {
  let seen;
  const { s, port } = await start({ env, ask: async (o) => { seen = o; return 'Stay in.'; } });
  const r = await post(port, { profile: { aqi: '999', city: 'delhi', commute: 'drop table' } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(JSON.parse(r.body), { text: 'Stay in.' });
  assert.ok(!r.body.includes('secret-key'));
  assert.strictEqual(seen.apiKey, 'secret-key');
  assert.ok(seen.prompt.includes('AQI=500'));
  assert.ok(!seen.prompt.includes('drop table'));
  s.close();
});

test('AI failures return a generic 502', async () => {
  const { s, port } = await start({ env, ask: async () => { throw new Error('upstream said secret-key is bad'); } });
  const r = await post(port, { profile: {} });
  assert.strictEqual(r.status, 502);
  assert.ok(!r.body.includes('secret-key'));
  s.close();
});

test('rate limit returns 429 after 10 requests a minute', async () => {
  const { s, port } = await start({ env: {}, now: () => 1000 });
  let last;
  for (let i = 0; i < 11; i++) last = await post(port, { profile: {} });
  assert.strictEqual(last.status, 429);
  s.close();
});
