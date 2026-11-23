/**
 * Smog Companion - coordinate validation shared by the browser and the server.
 */

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

/**
 * True when both values are finite numbers inside the valid latitude and longitude range.
 * @param {unknown} lat
 * @param {unknown} lon
 * @returns {boolean}
 */
export function isValidCoordinate(lat, lon) {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= MAX_LATITUDE &&
    Math.abs(lon) <= MAX_LONGITUDE
  );
}
