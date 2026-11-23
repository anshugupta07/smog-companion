import { GEOLOCATION_MAX_AGE_MS, GEOLOCATION_TIMEOUT_MS } from "../constants.js";
import { MESSAGES } from "../content/messages.js";
import { createRequestGuard } from "./request.js";

/** Coordinates are rounded to 0.01 degrees (about 1 km) before they leave the page. */
const COORDINATE_PRECISION = 100;
const GEOLOCATION_OPTIONS = Object.freeze({ timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: GEOLOCATION_MAX_AGE_MS });

/**
 * Rounds a coordinate to about 1 km so an exact location is never sent anywhere.
 * @param {number} degrees
 * @returns {number}
 */
export function roundCoordinate(degrees) {
  return Math.round(degrees * COORDINATE_PRECISION) / COORDINATE_PRECISION;
}

/**
 * Loads live AQI for a place and fills the planner's AQI field.
 * @param {AppDependencies} deps
 * @param {Place} place
 * @returns {Promise<Reading|null>} The reading, or null when it could not be loaded.
 */
export async function choosePlace(deps, place) {
  const { $, Api, Views, UI, state } = deps;
  const label = Views.placeLabel(place);
  const status = $("aqi-status");
  state.place = place;
  $("place", "input").value = label;
  $("place-results").replaceChildren();
  UI.setStatus(status, MESSAGES.loadingReading(label));
  try {
    const reading = await Api.fetchAqi(place.lat, place.lon);
    $("aqi", "input").value = String(reading.aqi);
    UI.setStatus(status, MESSAGES.liveReading({ label, reading }));
    return reading;
  } catch (error) {
    UI.setStatus(status, MESSAGES.readingFailed(errorMessage(error)), true);
    return null;
  }
}

/**
 * Text to show for an unknown thrown value.
 * @param {unknown} error
 * @returns {string}
 */
export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Searches for places by the typed name and lists them as choices.
 * @param {AppDependencies} deps
 * @param {() => () => boolean} startRequest
 * @param {(message: string, isError?: boolean) => void} status
 * @param {(place: Place) => Promise<Reading|null>} selectPlace
 * @returns {Promise<void>}
 */
async function findPlaces(deps, startRequest, status, selectPlace) {
  const { $, Api, Views } = deps;
  const list = $("place-results");
  const isCurrent = startRequest();
  list.replaceChildren();
  status(MESSAGES.searching);
  try {
    const found = await Api.geocode($("place", "input").value);
    if (!isCurrent()) {
      return;
    }
    if (!found.length) {
      status(MESSAGES.noPlaces, true);
      return;
    }
    list.replaceChildren(...found.map((place) => Views.placeOption(place, selectPlace)));
    status(MESSAGES.placesFound(found.length));
  } catch (error) {
    if (isCurrent()) {
      status(MESSAGES.searchFailed(errorMessage(error)), true);
    }
  }
}

/**
 * Wires the "Use my location" button.
 * @param {AppDependencies} deps
 * @param {(message: string, isError?: boolean) => void} status
 * @param {(place: Place) => Promise<Reading|null>} selectPlace
 * @returns {void}
 */
function initLocation({ $, window: windowObject }, status, selectPlace) {
  $("geo").addEventListener("click", () => {
    const geolocation = windowObject.navigator.geolocation;
    if (!geolocation) {
      status(MESSAGES.locationUnsupported, true);
      return;
    }
    status(MESSAGES.locationWaiting);
    geolocation.getCurrentPosition(
      ({ coords }) =>
        selectPlace({
          name: MESSAGES.yourLocation,
          region: "",
          country: "",
          lat: roundCoordinate(coords.latitude),
          lon: roundCoordinate(coords.longitude),
        }),
      () => status(MESSAGES.locationDenied, true),
      GEOLOCATION_OPTIONS,
    );
  });
}

/**
 * Initializes place search and geolocation.
 * @param {AppDependencies} deps
 * @returns {PlaceSearch}
 */
export function initPlaceSearch(deps) {
  const { $, UI } = deps;
  const startRequest = createRequestGuard();
  const status = (/** @type {string} */ message, isError = false) => UI.setStatus($("aqi-status"), message, isError);
  const selectPlace = (/** @type {Place} */ place) => choosePlace(deps, place);
  const find = () => findPlaces(deps, startRequest, status, selectPlace);
  $("find").addEventListener("click", find);
  $("place").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    find();
  });
  initLocation(deps, status, selectPlace);
  return { findPlaces: find, selectPlace };
}
