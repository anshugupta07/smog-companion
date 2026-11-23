/**
 * Optional monitoring-station readings through the WAQI API. The token stays on the server.
 */
import { parseAqi, sanitizeText } from "../js/app.js";
import { HTTP_STATUS, TEXT_LIMIT } from "../js/constants.js";
import { isValidCoordinate } from "../js/coordinates.js";
import { ApiError } from "../js/errors.js";
import { PROVIDER_TIMEOUT_MS } from "./config.js";

const PROVIDER_URL = "https://api.waqi.info/feed";

/**
 * Reads one pollutant value from a provider payload.
 * @param {Record<string, any>} data
 * @param {string} pollutant
 * @returns {number|null}
 */
function particle(data, pollutant) {
  const value = Number(data.iaqi?.[pollutant]?.v);
  return Number.isFinite(value) ? value : null;
}

/**
 * Reads the measurement time (ISO string preferred) from a provider payload.
 * @param {Record<string, any>} data
 * @returns {string}
 */
function measurementTime(data) {
  return sanitizeText(data.time?.iso || data.time?.s, TEXT_LIMIT.time);
}

/**
 * The AQI of a successful provider payload, or null.
 * @param {Record<string, any>|null|undefined} body
 * @returns {number|null}
 */
function providerAqi(body) {
  return body?.status === "ok" && body.data ? parseAqi(body.data.aqi) : null;
}

/**
 * Converts a WAQI response into a Reading, or null when it holds no usable AQI.
 * @param {Record<string, any>|null|undefined} body
 * @returns {Reading|null}
 */
export function stationReading(body) {
  const aqi = providerAqi(body);
  if (aqi === null) {
    return null;
  }
  const data = /** @type {Record<string, any>} */ (body?.data);
  return {
    aqi,
    pm25: particle(data, "pm25"),
    pm10: particle(data, "pm10"),
    time: measurementTime(data),
    source: "station",
    station: sanitizeText(data.city?.name, TEXT_LIMIT.station),
  };
}

/**
 * Fetches the nearest station's reading.
 * @param {{lat: number, lon: number, token: string, fetchImpl?: typeof fetch}} options
 * @returns {Promise<Reading>}
 * @throws {ApiError} When the provider fails, times out or has no reading (status 502).
 */
export async function fetchStationReading({ lat, lon, token, fetchImpl = fetch }) {
  if (!isValidCoordinate(lat, lon)) {
    throw new ApiError("Invalid coordinates.", HTTP_STATUS.badRequest);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS.station);
  try {
    const url = `${PROVIDER_URL}/geo:${lat};${lon}/?token=${encodeURIComponent(token)}`;
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      throw new ApiError(`Provider returned ${response.status}`);
    }
    const reading = stationReading(await response.json());
    if (!reading) {
      throw new ApiError("No station reading");
    }
    return reading;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("Monitoring-station provider timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
