/**
 * Smog Companion - live air quality from Open-Meteo (free, no API key), with an optional
 * nearest-station reading from this site's own /api/aqi route when the server provides one.
 * Geocoding, current AQI for one or many places, and a small in-memory TTL cache that also merges
 * duplicate in-flight requests. Every function accepts an optional `fetchImpl` so tests can mock
 * the network; injected fetches are never cached.
 */
import { parseAqi, sanitizeText } from "./app.js";
import { CACHE_TTL_MS, HTTP_STATUS, REQUEST_TIMEOUT_MS, TEXT_LIMIT } from "./constants.js";
import { isValidCoordinate } from "./coordinates.js";
import { ApiError, ValidationError } from "./errors.js";

const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const STATION_ROUTE = "/api/aqi";
/** Statuses that mean "this server has no station provider", so asking again is pointless. */
/** @type {readonly number[]} */
const STATION_UNAVAILABLE_STATUSES = Object.freeze([
  HTTP_STATUS.notFound,
  HTTP_STATUS.methodNotAllowed,
  HTTP_STATUS.notImplemented,
  HTTP_STATUS.unavailable,
]);
const AQ_FIELDS = "us_aqi,pm2_5,pm10";
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 6;
const CACHE_MAX_ENTRIES = 100;

/**
 * @typedef {{us_aqi?: number, pm2_5?: number, pm10?: number, time?: string}} CurrentBlock
 * @typedef {{current?: CurrentBlock}} AirQualityResponse
 * @typedef {{name: string, admin1?: string, country?: string, latitude: number, longitude: number}} GeocodeHit
 * @typedef {{results?: GeocodeHit[]}} GeocodeResponse
 */

/** @type {Map<string, {at: number, data: unknown}>} */
const cache = new Map();
/** @type {Map<string, Promise<unknown>>} */
const inFlight = new Map();

/** Becomes false once the server has said it has no station provider, to avoid a failing request per reading. */
let stationRouteAvailable = true;

/** Forgets every cached response and re-enables the station route (used by tests). */
export function clearCache() {
  cache.clear();
  stationRouteAvailable = true;
}

/** True when both values are usable coordinates. */
export const validCoord = isValidCoordinate;

/**
 * @param {unknown} value
 * @returns {number|null}
 */
const finiteOrNull = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/**
 * @param {typeof fetch|null|undefined} fetchImpl
 * @returns {typeof fetch}
 */
function resolveFetch(fetchImpl) {
  const doFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!doFetch) {
    throw new ApiError("fetch is not available in this environment.");
  }
  return doFetch;
}

/**
 * GET JSON with a timeout.
 * @param {string} url
 * @param {typeof fetch|null|undefined} fetchImpl
 * @param {number} timeoutMs
 * @returns {Promise<unknown>}
 */
async function getJsonUncached(url, fetchImpl, timeoutMs) {
  const doFetch = resolveFetch(fetchImpl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(url, { credentials: "omit", signal: controller.signal });
    if (!response.ok) {
      throw new ApiError(`Data service returned status ${response.status}.`, response.status);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} url
 * @param {unknown} data
 * @returns {void}
 */
function remember(url, data) {
  cache.set(url, { at: Date.now(), data });
  if (cache.size > CACHE_MAX_ENTRIES) {
    cache.delete(/** @type {string} */ (cache.keys().next().value));
  }
}

/**
 * GET JSON with a TTL cache and in-flight de-duplication (real fetch only).
 * @param {string} url
 * @param {typeof fetch|null} [fetchImpl] An injected fetch bypasses the cache.
 * @returns {Promise<unknown>}
 */
async function getJson(url, fetchImpl = null) {
  if (fetchImpl) {
    return getJsonUncached(url, fetchImpl, REQUEST_TIMEOUT_MS);
  }
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.data;
  }
  if (hit) {
    cache.delete(url);
  }
  const pending = inFlight.get(url);
  if (pending) {
    return pending;
  }
  const request = getJsonUncached(url, null, REQUEST_TIMEOUT_MS)
    .then((data) => {
      remember(url, data);
      return data;
    })
    .finally(() => inFlight.delete(url));
  inFlight.set(url, request);
  return request;
}

/**
 * Finds places worldwide by name.
 * @param {string} query
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Place[]>}
 * @throws {ValidationError} When the query is too short.
 */
export async function geocode(query, fetchImpl) {
  const text = sanitizeText(query, TEXT_LIMIT.query);
  if (text.length < MIN_QUERY_LENGTH) {
    throw new ValidationError(`Type at least ${MIN_QUERY_LENGTH} letters.`);
  }
  const url = `${GEO_URL}?name=${encodeURIComponent(text)}&count=${MAX_RESULTS}&language=en&format=json`;
  const data = /** @type {GeocodeResponse} */ (await getJson(url, fetchImpl));
  return (data.results || [])
    .filter((hit) => isValidCoordinate(hit.latitude, hit.longitude))
    .map((hit) => ({
      name: sanitizeText(hit.name, TEXT_LIMIT.name),
      region: sanitizeText(hit.admin1 || "", TEXT_LIMIT.name),
      country: sanitizeText(hit.country || "", TEXT_LIMIT.name),
      lat: hit.latitude,
      lon: hit.longitude,
    }));
}

/**
 * Converts an Open-Meteo "current" block into a Reading, or null when it has no AQI.
 * @param {CurrentBlock|undefined} current
 * @returns {Reading|null}
 */
function parseCurrent(current) {
  const aqi = parseAqi(current?.us_aqi);
  if (aqi === null || !current) {
    return null;
  }
  return {
    aqi,
    pm25: finiteOrNull(current.pm2_5),
    pm10: finiteOrNull(current.pm10),
    time: sanitizeText(current.time, TEXT_LIMIT.time),
    source: "model",
    station: "",
  };
}

/**
 * Tries the site's own station route. Static hosts and servers without a provider simply return null.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<Reading|null>}
 */
async function fetchStationReading(lat, lon) {
  if (!stationRouteAvailable) {
    return null;
  }
  try {
    const data = /** @type {{reading?: Reading}} */ (await getJson(`${STATION_ROUTE}?lat=${lat}&lon=${lon}`));
    return data?.reading ?? null;
  } catch (error) {
    if (error instanceof ApiError && STATION_UNAVAILABLE_STATUSES.includes(error.status)) {
      stationRouteAvailable = false;
    }
    return null;
  }
}

/**
 * Current US AQI, PM2.5 and PM10 for one coordinate. Prefers a nearby station when the server has one.
 * @param {number} lat
 * @param {number} lon
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Reading>}
 * @throws {RangeError} For invalid coordinates.
 * @throws {ApiError} When no reading is available.
 */
export async function fetchAqi(lat, lon, fetchImpl) {
  if (!isValidCoordinate(lat, lon)) {
    throw new RangeError("Invalid coordinates.");
  }
  if (!fetchImpl && typeof window !== "undefined") {
    const station = await fetchStationReading(lat, lon);
    if (station) {
      return station;
    }
  }
  const url = `${AQ_URL}?latitude=${lat}&longitude=${lon}&current=${AQ_FIELDS}&timezone=auto`;
  const data = /** @type {AirQualityResponse} */ (await getJson(url, fetchImpl));
  const reading = parseCurrent(data.current);
  if (!reading) {
    throw new ApiError("No air quality data for this place.");
  }
  return reading;
}

/**
 * One request for many places. Each result carries a `reading`, or null if unavailable.
 * @param {readonly Place[]} places
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<PlaceWithReading[]>}
 */
export async function fetchAqiMany(places, fetchImpl) {
  const list = places.filter((place) => isValidCoordinate(place.lat, place.lon));
  if (!list.length) {
    return [];
  }
  const lats = list.map((place) => place.lat).join(",");
  const lons = list.map((place) => place.lon).join(",");
  const url = `${AQ_URL}?latitude=${lats}&longitude=${lons}&current=${AQ_FIELDS}&timezone=auto`;
  const data = /** @type {AirQualityResponse|AirQualityResponse[]} */ (await getJson(url, fetchImpl));
  const items = Array.isArray(data) ? data : [data];
  return list.map((place, index) => ({ ...place, reading: parseCurrent(items[index]?.current) }));
}
