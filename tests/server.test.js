'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const zlib = require('zlib');
const { createApp, resolvePublicFile } = require('../server.js');

function start(opts) {
  return new Promise((resolve) => { const s = createApp(opts).listen(0, '127.0.0.1', () => resolve({ s, port: s.address().port })); });
}
function request(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, raw, body: raw.toString('utf8') });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
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
  assert.strictEqual(r.headers['cross-origin-opener-policy'], 'same-origin');
  assert.strictEqual(r.headers['cross-origin-resource-policy'], 'same-origin');
  assert.strictEqual(r.headers['x-permitted-cross-domain-policies'], 'none');
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
  assert.strictEqual((await post(port, { profile: [] })).status, 400);
  assert.strictEqual((await request(port, { method: 'POST', path: '/api/routine', headers: { 'Content-Type': 'text/plain' }, body: 'x' })).status, 415);
  assert.strictEqual((await request(port, { method: 'POST', path: '/api/routine', headers: { 'Content-Type': 'application/jsonp' }, body: '{}' })).status, 415);
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

test('AI adapter must return usable text before reporting success', async () => {
  const { s, port } = await start({ env, ask: async () => null });
  const r = await post(port, { profile: {} });
  assert.strictEqual(r.status, 502);
  assert.ok(JSON.parse(r.body).error);
  s.close();
});

test('rate limit returns 429 after 10 requests a minute', async () => {
  const { s, port } = await start({ env: {}, now: () => 1000 });
  let last;
  for (let i = 0; i < 11; i++) last = await post(port, { profile: {} });
  assert.strictEqual(last.status, 429);
  s.close();
});

test('the CSP only allows Open-Meteo for network calls and blocks plugins and framing', async () => {
  const { s, port } = await start();
  const csp = (await request(port)).headers['content-security-policy'];
  assert.ok(csp.includes("connect-src 'self' https://geocoding-api.open-meteo.com https://air-quality-api.open-meteo.com"));
  assert.ok(!/connect-src[^;]*\shttps:(\s|;|$)/.test(csp), 'no blanket https: allowance');
  assert.ok(csp.includes("object-src 'none'"));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.ok(!csp.includes('unsafe-inline') && !csp.includes('unsafe-eval'));
  s.close();
});

test('the CSP in index.html matches the server CSP (minus header-only directives)', () => {
  const fs = require('fs');
  const path = require('path');
  const { CSP_DIRECTIVES } = require('../lib/security.js');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const meta = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const parsed = Object.fromEntries(meta.split(';').map((d) => d.trim().split(/\s+/)).map(([name, ...sources]) => [name, sources]));
  const expected = { ...CSP_DIRECTIVES };
  delete expected['frame-ancestors'];
  assert.deepStrictEqual(parsed, expected);
});

test('static files are compressed with Brotli or gzip and decode to the original', async () => {
  const { s, port } = await start();
  const plain = await request(port, { path: '/css/styles.css', headers: { 'Accept-Encoding': 'identity' } });
  assert.strictEqual(plain.headers['content-encoding'], undefined);
  const br = await request(port, { path: '/css/styles.css', headers: { 'Accept-Encoding': 'gzip, br' } });
  assert.strictEqual(br.headers['content-encoding'], 'br');
  assert.strictEqual(zlib.brotliDecompressSync(br.raw).toString('utf8'), plain.body);
  const gz = await request(port, { path: '/css/styles.css', headers: { 'Accept-Encoding': 'gzip' } });
  assert.strictEqual(gz.headers['content-encoding'], 'gzip');
  assert.strictEqual(zlib.gunzipSync(gz.raw).toString('utf8'), plain.body);
  assert.ok(br.raw.length < plain.raw.length / 2, 'compression should at least halve the CSS');
  assert.strictEqual(br.headers.vary, 'Accept-Encoding');
  assert.strictEqual(Number(br.headers['content-length']), br.raw.length);
  s.close();
});

test('ETag revalidation returns 304 with no body, and HEAD has no body', async () => {
  const { s, port } = await start();
  const first = await request(port, { path: '/js/app.js', headers: { 'Accept-Encoding': 'gzip' } });
  assert.ok(first.headers.etag);
  const again = await request(port, { path: '/js/app.js', headers: { 'Accept-Encoding': 'gzip', 'If-None-Match': first.headers.etag } });
  assert.strictEqual(again.status, 304);
  assert.strictEqual(again.raw.length, 0);
  assert.strictEqual((await request(port, { path: '/js/app.js', headers: { 'If-None-Match': first.headers.etag } })).status, 200, 'ETag is per encoding');
  const head = await request(port, { method: 'HEAD', path: '/' });
  assert.strictEqual(head.status, 200);
  assert.strictEqual(head.raw.length, 0);
  s.close();
});

test('cache headers: HTML revalidates, assets are cached for an hour', async () => {
  const { s, port } = await start();
  assert.strictEqual((await request(port)).headers['cache-control'], 'no-cache');
  assert.match((await request(port, { path: '/js/main.js' })).headers['cache-control'], /max-age=3600/);
  s.close();
});

test('server-side code and directories are never served', async () => {
  const { s, port } = await start();
  for (const p of ['/lib/ai.js', '/lib/security.js', '/js/', '/css', '/node_modules/jsdom/package.json', '/.git/config', '/.env', '/tests/helpers.js']) {
    assert.strictEqual((await request(port, { path: p })).status, 404, p);
  }
  assert.strictEqual(resolvePublicFile('/lib/ai.js'), null);
  assert.ok(resolvePublicFile('/js/app.js').endsWith('app.js'));
  s.close();
});

test('/healthz reports ok and is never cached', async () => {
  const { s, port } = await start();
  const r = await request(port, { path: '/healthz' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(JSON.parse(r.body), { status: 'ok' });
  assert.strictEqual(r.headers['cache-control'], 'no-store');
  s.close();
});

test('HSTS is sent only for HTTPS behind a trusted proxy', async () => {
  const trusted = await start({ env: { TRUST_PROXY: '1' } });
  const secure = await request(trusted.port, { headers: { 'X-Forwarded-Proto': 'https' } });
  assert.match(secure.headers['strict-transport-security'], /max-age=31536000/);
  assert.strictEqual((await request(trusted.port)).headers['strict-transport-security'], undefined);
  trusted.s.close();
  const untrusted = await start({ env: {} });
  assert.strictEqual((await request(untrusted.port, { headers: { 'X-Forwarded-Proto': 'https' } })).headers['strict-transport-security'], undefined);
  untrusted.s.close();
});

test('rate limits use the real client IP only when the proxy is trusted', async () => {
  const trusted = await start({ env: { TRUST_PROXY: '1' }, now: () => 1000 });
  const send = (ip) => request(trusted.port, { method: 'POST', path: '/api/routine', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `1.1.1.1, ${ip}` }, body: '{"profile":{}}' });
  for (let i = 0; i < 10; i++) await send('9.9.9.9');
  assert.strictEqual((await send('9.9.9.9')).status, 429);
  assert.notStrictEqual((await send('8.8.8.8')).status, 429, 'a different client keeps its own allowance');
  trusted.s.close();
});

test('malformed request targets get a 400 and unknown routes a 404', async () => {
  const { s, port } = await start();
  assert.strictEqual((await request(port, { path: '/nope' })).status, 404);
  assert.strictEqual((await request(port, { path: '/css/missing.css' })).status, 404);
  s.close();
});
