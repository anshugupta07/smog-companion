/**
 * Zero-dependency static server + AI proxy.
 *   npm start                                                         serves the site on http://localhost:3000
 *   AI_ENDPOINT=https://... AI_API_KEY=... AI_MODEL=... npm start     enables POST /api/routine
 *   WAQI_API_TOKEN=... npm start                                      enables GET /api/aqi (nearest station)
 * Keys stay on the server and are never sent to the browser.
 * Set TRUST_PROXY=1 when running behind one reverse proxy (real client IP for rate limits, HSTS).
 */
import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildPlan, buildPrompt } from "./js/app.js";
import { HTTP_STATUS as HTTP } from "./js/constants.js";
import { isValidCoordinate } from "./js/coordinates.js";
import { ApiError } from "./js/errors.js";
import { askAI } from "./lib/ai.js";
import { readBody } from "./lib/body.js";
import { DEFAULT_PORT, MAX_BODY_BYTES, RATE_LIMIT, SERVER_TIMEOUT_MS, SHUTDOWN_GRACE_MS } from "./lib/config.js";
import { isJsonRequest, send, sendJson } from "./lib/http.js";
import { createRateLimiter } from "./lib/rate-limit.js";
import { HSTS } from "./lib/security.js";
import { createStaticHandler, resolvePublicFile } from "./lib/static.js";
import { fetchStationReading } from "./lib/station.js";

/**
 * @typedef {import("node:http").IncomingMessage} Request
 * @typedef {import("node:http").ServerResponse} Response
 * @typedef {{
 *   env: Record<string, string|undefined>,
 *   clientKey: (req: Request) => string,
 *   isHttps: (req: Request) => boolean,
 *   isRoutineLimited: (key: string) => boolean,
 *   isStationLimited: (key: string) => boolean,
 * }} ServerContext
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Parses and validates the JSON body of POST /api/routine.
 * @param {Request} req
 * @returns {Promise<{profile: Record<string, unknown>}|{status: number, error: string}>}
 */
async function readProfile(req) {
  let body;
  try {
    body = JSON.parse(await readBody(req, MAX_BODY_BYTES));
  } catch (error) {
    const tooLarge = error instanceof ApiError && error.status === HTTP.payloadTooLarge;
    return tooLarge
      ? { status: HTTP.payloadTooLarge, error: "Request too large." }
      : { status: HTTP.badRequest, error: "Invalid JSON." };
  }
  if (!isPlainObject(body) || !isPlainObject(body.profile)) {
    return { status: HTTP.badRequest, error: "Missing profile." };
  }
  return { profile: body.profile };
}

/**
 * Reasons to refuse a routine request before reading its body, or null to carry on.
 * @param {ServerContext} ctx
 * @param {Request} req
 * @returns {{status: number, error: string}|null}
 */
function routineRejection(ctx, req) {
  if (ctx.isRoutineLimited(ctx.clientKey(req))) {
    return { status: HTTP.tooManyRequests, error: "Too many requests. Try again in a minute." };
  }
  if (!isJsonRequest(req)) {
    return { status: HTTP.unsupportedMediaType, error: "Send JSON." };
  }
  return null;
}

/**
 * Creates the POST /api/routine handler: AI-written routine for a whitelisted profile.
 * @param {ServerContext} ctx
 * @param {typeof askAI} ask
 * @returns {(req: Request, res: Response) => Promise<void>}
 */
function createRoutineHandler(ctx, ask) {
  return async (req, res) => {
    const rejection = routineRejection(ctx, req);
    const parsed = rejection ?? (await readProfile(req));
    if ("error" in parsed) {
      return sendJson(res, parsed.status, { error: parsed.error });
    }
    const { AI_ENDPOINT: endpoint, AI_API_KEY: apiKey, AI_MODEL: model } = ctx.env;
    if (!endpoint || !apiKey) {
      return sendJson(res, HTTP.unavailable, { error: "AI is not configured on this server." });
    }
    try {
      const prompt = buildPrompt(buildPlan(parsed.profile));
      const text = await ask({ endpoint, apiKey, model, prompt });
      if (typeof text !== "string" || !text.trim()) {
        throw new ApiError("AI service returned an empty answer.");
      }
      return sendJson(res, HTTP.ok, { text });
    } catch {
      return sendJson(res, HTTP.badGateway, { error: "AI service unavailable." });
    }
  };
}

/**
 * Message for a failed station lookup, without leaking provider details.
 * @param {unknown} error
 * @returns {string}
 */
function stationFailureMessage(error) {
  const timedOut = error instanceof ApiError && error.message.includes("timed out");
  return timedOut ? "Monitoring-station provider timed out." : "Monitoring-station provider unavailable.";
}

/**
 * Creates the GET /api/aqi handler: nearest monitoring-station reading.
 * @param {ServerContext} ctx
 * @param {typeof fetch} providerFetch
 * @returns {(req: Request, res: Response, url: URL) => Promise<void>}
 */
function createStationHandler(ctx, providerFetch) {
  return async (req, res, url) => {
    if (ctx.isStationLimited(ctx.clientKey(req))) {
      return sendJson(res, HTTP.tooManyRequests, { error: "Too many AQI requests. Try again in a minute." });
    }
    const token = ctx.env.WAQI_API_TOKEN;
    if (!token) {
      return sendJson(res, HTTP.unavailable, { error: "Monitoring-station provider is not configured." });
    }
    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    if (!isValidCoordinate(lat, lon)) {
      return sendJson(res, HTTP.badRequest, { error: "Valid latitude and longitude are required." });
    }
    try {
      const reading = await fetchStationReading({ lat, lon, token, fetchImpl: providerFetch });
      return sendJson(res, HTTP.ok, { reading });
    } catch (error) {
      return sendJson(res, HTTP.badGateway, { error: stationFailureMessage(error) });
    }
  };
}

/**
 * Builds the per-server helpers that need configuration: client identity, HTTPS detection, rate limiters.
 * @param {Record<string, string|undefined>} env
 * @param {() => number} now
 * @returns {ServerContext}
 */
function createContext(env, now) {
  const trustProxy = env.TRUST_PROXY === "1";
  return {
    env,
    isRoutineLimited: createRateLimiter({ ...RATE_LIMIT.routine, now }),
    isStationLimited: createRateLimiter({ ...RATE_LIMIT.station, now }),
    clientKey(req) {
      const forwarded = trustProxy
        ? String(req.headers["x-forwarded-for"] || "")
            .split(",")
            .pop()
            ?.trim()
        : "";
      return forwarded || req.socket.remoteAddress || "unknown";
    },
    isHttps(req) {
      return "encrypted" in req.socket || (trustProxy && req.headers["x-forwarded-proto"] === "https");
    },
  };
}

/**
 * Sends 405 with the methods the route does allow.
 * @param {Response} res
 * @param {string[]} methods
 * @returns {void}
 */
function methodNotAllowed(res, methods) {
  send(res, HTTP.methodNotAllowed, "Method not allowed", { Allow: methods.join(", ") });
}

/**
 * Creates the HTTP server. Options are injectable so tests can fake the environment, AI, clock and providers.
 * @param {{env?: Record<string, string|undefined>, ask?: typeof askAI, now?: () => number, providerFetch?: typeof fetch}} [options]
 * @returns {import("node:http").Server}
 */
function createApp({ env = process.env, ask = askAI, now = Date.now, providerFetch = fetch } = {}) {
  const ctx = createContext(env, now);
  const serveStatic = createStaticHandler();
  /** @type {Record<string, {methods: string[], run: (req: Request, res: Response, url: URL) => unknown}>} */
  const routes = {
    "/healthz": { methods: ["GET", "HEAD"], run: (_req, res) => sendJson(res, HTTP.ok, { status: "ok" }) },
    "/api/routine": { methods: ["POST"], run: createRoutineHandler(ctx, ask) },
    "/api/aqi": { methods: ["GET"], run: createStationHandler(ctx, providerFetch) },
  };

  return http.createServer((req, res) => {
    if (ctx.isHttps(req)) {
      res.setHeader("Strict-Transport-Security", HSTS);
    }
    let url;
    try {
      url = new URL(req.url ?? "/", "http://localhost");
    } catch {
      return send(res, HTTP.badRequest, "Bad request");
    }
    const route = routes[url.pathname] ?? { methods: ["GET", "HEAD"], run: () => serveStatic(req, res, url.pathname) };
    if (!route.methods.includes(req.method ?? "")) {
      return methodNotAllowed(res, route.methods);
    }
    return route.run(req, res, url);
  });
}

/** Starts the server on PORT and shuts it down gracefully on SIGTERM or SIGINT. */
function start() {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const server = createApp();
  server.headersTimeout = SERVER_TIMEOUT_MS.headers;
  server.requestTimeout = SERVER_TIMEOUT_MS.request;
  server.keepAliveTimeout = SERVER_TIMEOUT_MS.keepAlive;
  server.on("error", (/** @type {NodeJS.ErrnoException} */ error) => {
    const reason =
      error.code === "EADDRINUSE"
        ? `Port ${port} is already in use. Set PORT to use a different port.`
        : `Server failed to start: ${error.message}`;
    console.error(reason);
    process.exitCode = 1;
  });
  server.listen(port, () => console.log(`Smog Companion running at http://localhost:${port}`));

  // Stop accepting connections, let in-flight requests finish, and force-exit only after a grace period.
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start();
}

export { createApp, resolvePublicFile };
