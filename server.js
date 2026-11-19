'use strict';
/**
 * Zero-dependency static server + AI proxy.
 *   npm start                      serves the site on http://localhost:3000
 *   AI_ENDPOINT=https://... AI_API_KEY=... AI_MODEL=... npm start    enables POST /api/routine
 * The AI key stays on the server and is never sent to the browser.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const S = require('./js/app.js');

const ROOT = __dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const PUBLIC_DIRS = new Set(['css', 'js']);
const MAX_BODY = 4096;
const RATE = { windowMs: 60000, max: 10 };
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self' https:; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'close' });

/** Maps a URL path to a file under ROOT, only for index.html, css/ and js/. Returns null if not allowed. */
function resolvePublicFile(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(ROOT + path.sep)) return null;
  const top = path.relative(ROOT, full).split(path.sep)[0];
  if (rel !== 'index.html' && !PUBLIC_DIRS.has(top)) return null;
  return full;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY) {
      reject(Object.assign(new Error('Body too large'), { status: 413 }));
      req.resume();
      return;
    }
    let size = 0, tooBig = false; const chunks = [];
    req.on('data', (c) => {
      if (tooBig) return;
      size += c.length;
      if (size > MAX_BODY) { tooBig = true; chunks.length = 0; reject(Object.assign(new Error('Body too large'), { status: 413 })); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function createApp({ env = process.env, ask = S.askAI, now = Date.now } = {}) {
  const hits = new Map();
  const limited = (ip) => {
    const t = now();
    for (const [key, entry] of hits) {
      if (t >= entry.reset) hits.delete(key);
    }
    const h = hits.get(ip);
    if (!h || t >= h.reset) { hits.set(ip, { count: 1, reset: t + RATE.windowMs }); return false; }
    h.count += 1; return h.count > RATE.max;
  };

  async function routine(req, res) {
    if (limited(req.socket.remoteAddress || 'unknown')) return sendJson(res, 429, { error: 'Too many requests. Try again in a minute.' });
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return sendJson(res, 415, { error: 'Send JSON.' });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e) { return sendJson(res, e.status || 400, { error: e.status === 413 ? 'Request too large.' : 'Invalid JSON.' }); }
    if (!body || typeof body.profile !== 'object' || body.profile === null) return sendJson(res, 400, { error: 'Missing profile.' });
    if (!env.AI_ENDPOINT || !env.AI_API_KEY) return sendJson(res, 503, { error: 'AI is not configured on this server.' });
    try {
      const prompt = S.buildPrompt(S.buildPlan(body.profile));
      const text = await ask({ endpoint: env.AI_ENDPOINT, apiKey: env.AI_API_KEY, model: env.AI_MODEL, prompt });
      return sendJson(res, 200, { text });
    } catch {
      return sendJson(res, 502, { error: 'AI service unavailable.' });
    }
  }

  return http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return send(res, 400, 'Bad request');
    }
    if (url.pathname === '/api/routine') {
      if (req.method !== 'POST') return send(res, 405, 'Method not allowed', { Allow: 'POST' });
      return routine(req, res);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    const file = resolvePublicFile(url.pathname);
    if (!file) return send(res, 404, 'Not found');
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, 'Not found');
      const type = TYPES[path.extname(file)] || 'application/octet-stream';
      send(res, 200, req.method === 'HEAD' ? '' : data, { 'Content-Type': type, 'Cache-Control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600' });
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log(`Smog Companion running at http://localhost:${port}`));
}

module.exports = { createApp, resolvePublicFile };
