'use strict';
/**
 * Zero-dependency static server + AI proxy.
 *   npm start                                                         serves the site on http://localhost:3000
 *   AI_ENDPOINT=https://... AI_API_KEY=... AI_MODEL=... npm start     enables POST /api/routine
 * The AI key stays on the server and is never sent to the browser.
 * Set TRUST_PROXY=1 when running behind one reverse proxy (real client IP for rate limits, HSTS).
 */
const http = require('http');
const Core = require('./js/app.js');
const { askAI } = require('./lib/ai.js');
const { send, sendJson, isJsonRequest } = require('./lib/http.js');
const { createRateLimiter } = require('./lib/rate-limit.js');
const { createStaticHandler, resolvePublicFile } = require('./lib/static.js');
const { HSTS } = require('./lib/security.js');

const MAX_BODY = 4096;
const RATE = { windowMs: 60000, max: 10 };
const TIMEOUTS = { headersMs: 10000, requestMs: 15000, keepAliveMs: 5000 };

const tooLarge = () => Object.assign(new Error('Body too large'), { status: 413 });

/** Reads a request body as text, rejecting early once it exceeds MAX_BODY bytes. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY) {
      reject(tooLarge());
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        chunks.length = 0;
        settle(reject, tooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => settle(resolve, Buffer.concat(chunks).toString('utf8')));
    req.on('error', (error) => settle(reject, error));
  });
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Parses and validates the JSON body of POST /api/routine.
 * @returns {Promise<{profile?:object, status?:number, error?:string}>}
 */
async function readProfile(req) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (error) {
    return error.status === 413 ? { status: 413, error: 'Request too large.' } : { status: 400, error: 'Invalid JSON.' };
  }
  if (!body || !isPlainObject(body.profile)) return { status: 400, error: 'Missing profile.' };
  return { profile: body.profile };
}

/** Creates the HTTP server. Options are injectable so tests can fake the environment, AI and clock. */
function createApp({ env = process.env, ask = askAI, now = Date.now } = {}) {
  const isLimited = createRateLimiter({ ...RATE, now });
  const serveStatic = createStaticHandler();
  const trustProxy = env.TRUST_PROXY === '1';

  const clientKey = (req) => {
    const forwarded = trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() : '';
    return forwarded || req.socket.remoteAddress || 'unknown';
  };
  const isHttps = (req) => Boolean(req.socket.encrypted) || (trustProxy && req.headers['x-forwarded-proto'] === 'https');

  async function routine(req, res) {
    if (isLimited(clientKey(req))) return sendJson(res, 429, { error: 'Too many requests. Try again in a minute.' });
    if (!isJsonRequest(req)) return sendJson(res, 415, { error: 'Send JSON.' });

    const parsed = await readProfile(req);
    if (parsed.error) return sendJson(res, parsed.status, { error: parsed.error });
    if (!env.AI_ENDPOINT || !env.AI_API_KEY) return sendJson(res, 503, { error: 'AI is not configured on this server.' });

    try {
      const prompt = Core.buildPrompt(Core.buildPlan(parsed.profile));
      const text = await ask({ endpoint: env.AI_ENDPOINT, apiKey: env.AI_API_KEY, model: env.AI_MODEL, prompt });
      if (typeof text !== 'string' || !text.trim()) throw new Error('AI service returned an empty answer.');
      return sendJson(res, 200, { text });
    } catch {
      return sendJson(res, 502, { error: 'AI service unavailable.' });
    }
  }

  return http.createServer((req, res) => {
    if (isHttps(req)) res.setHeader('Strict-Transport-Security', HSTS);
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return send(res, 400, 'Bad request');
    }
    if (url.pathname === '/healthz') return sendJson(res, 200, { status: 'ok' });
    if (url.pathname === '/api/routine') {
      if (req.method !== 'POST') return send(res, 405, 'Method not allowed', { Allow: 'POST' });
      return routine(req, res);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    return serveStatic(req, res, url.pathname);
  });
}

function start() {
  const port = Number(process.env.PORT) || 3000;
  const server = createApp();
  server.headersTimeout = TIMEOUTS.headersMs;
  server.requestTimeout = TIMEOUTS.requestMs;
  server.keepAliveTimeout = TIMEOUTS.keepAliveMs;
  server.on('error', (error) => {
    const reason = error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Set PORT to use a different port.` : `Server failed to start: ${error.message}`;
    console.error(reason);
    process.exitCode = 1;
  });
  server.listen(port, () => console.log(`Smog Companion running at http://localhost:${port}`));

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) start();

module.exports = { createApp, resolvePublicFile };
