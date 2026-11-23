/**
 * Smog Companion - shared constants. One home for numbers used by more than one module.
 */

/** Lowest and highest value on the US AQI scale. */
export const AQI_MIN = 0;
export const AQI_MAX = 500;

/** Index of each AQI health band, from cleanest to worst. Advice rules compare against these names. */
export const BAND_LEVEL = Object.freeze({
  good: 0,
  moderate: 1,
  sensitiveGroups: 2,
  unhealthy: 3,
  veryUnhealthy: 4,
  hazardous: 5,
});

/** AQI assumed when the person has not entered one and no live reading is known. */
export const DEFAULT_TYPICAL_AQI = 120;

/** Time units in milliseconds. */
export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;

/** HTTP status codes used by the server and recognised by the browser. */
export const HTTP_STATUS = Object.freeze({
  ok: 200,
  notModified: 304,
  badRequest: 400,
  notFound: 404,
  methodNotAllowed: 405,
  payloadTooLarge: 413,
  unsupportedMediaType: 415,
  tooManyRequests: 429,
  notImplemented: 501,
  badGateway: 502,
  unavailable: 503,
});

/** Timeouts and cache lifetimes, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 10 * SECOND_MS;
export const AI_TIMEOUT_MS = 30 * SECOND_MS;
export const CACHE_TTL_MS = 10 * MINUTE_MS;
export const GEOLOCATION_TIMEOUT_MS = 10 * SECOND_MS;
export const GEOLOCATION_MAX_AGE_MS = 10 * MINUTE_MS;

/** Maximum lengths for text that comes from outside (search results, user input, providers). */
export const TEXT_LIMIT = Object.freeze({
  query: 80,
  name: 60,
  time: 30,
  placeName: 40,
  station: 80,
  model: 80,
});
