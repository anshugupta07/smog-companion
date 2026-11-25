/**
 * Smog Companion - server settings: limits, timeouts and defaults, named in one place.
 */
import { MINUTE_MS, SECOND_MS } from "../js/constants.js";

export const DEFAULT_PORT = 3000;
export const MAX_PORT = 65535;

/** Largest request body the server accepts, in bytes. */
export const MAX_BODY_BYTES = 4096;

/** Requests allowed per client within each window. */
export const RATE_LIMIT = Object.freeze({
  routine: Object.freeze({ windowMs: MINUTE_MS, max: 10 }),
  station: Object.freeze({ windowMs: MINUTE_MS, max: 30 }),
});

/** Node HTTP server timeouts, in milliseconds. */
export const SERVER_TIMEOUT_MS = Object.freeze({
  headers: 10 * SECOND_MS,
  request: 15 * SECOND_MS,
  keepAlive: 5 * SECOND_MS,
});

/** How long in-flight requests get to finish after SIGTERM before the process exits anyway. */
export const SHUTDOWN_GRACE_MS = 5 * SECOND_MS;

/** Timeouts for the upstream providers, in milliseconds. */
export const PROVIDER_TIMEOUT_MS = Object.freeze({
  ai: 20 * SECOND_MS,
  station: 10 * SECOND_MS,
});
