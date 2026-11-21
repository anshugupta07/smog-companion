import { createRequestGuard } from "./request.js";

const LOCATION_PRECISION = 100;

/** Loads live AQI for a place.
 * @param {AppDependencies} deps
 * @param {Place} place
 * @returns {Promise<Reading|null>}
 */
export async function choosePlace(deps, place) {
  const { document: doc, Api, Views, UI, state } = deps;
  state.place = place;
  doc.getElementById("place").value = Views.placeLabel(place);
  doc.getElementById("place-results").replaceChildren();
  UI.setStatus(
    doc.getElementById("aqi-status"),
    `Loading live air quality for ${Views.placeLabel(place)}...`,
  );
  try {
    const reading = await Api.fetchAqi(place.lat, place.lon);
    doc.getElementById("aqi").value = String(reading.aqi);
    const pm = reading.pm25 !== null ? `, PM2.5 ${reading.pm25} µg/m³` : "";
    const source =
      reading.source === "station"
        ? `Nearest station: ${reading.station || "AQI station"}`
        : "Model estimate: Open-Meteo";
    UI.setStatus(
      doc.getElementById("aqi-status"),
      `Live US AQI ${reading.aqi} for ${Views.placeLabel(place)}${pm}, updated ${reading.time}. ${source}.`,
    );
    return reading;
  } catch (error) {
    UI.setStatus(
      doc.getElementById("aqi-status"),
      `Could not load live air quality (${error.message}) Type your AQI instead.`,
      true,
    );
    return null;
  }
}

async function findPlaces(deps, startRequest, status, selectPlace) {
  const { document: doc, Api, Views } = deps;
  const list = doc.getElementById("place-results");
  const isCurrent = startRequest();
  list.replaceChildren();
  status("Searching...");
  try {
    const found = await Api.geocode(doc.getElementById("place").value);
    if (!isCurrent()) return;
    if (!found.length) {
      status(
        "No places found. Try another spelling or a larger nearby city.",
        true,
      );
      return;
    }
    list.replaceChildren(
      ...found.map((place) => Views.placeOption(place, selectPlace)),
    );
    status(`${found.length} places found. Choose yours.`);
  } catch (error) {
    if (isCurrent()) status(`Search failed: ${error.message}`, true);
  }
}

function initLocation(deps, status, selectPlace) {
  const { document: doc, window: windowObject } = deps;
  doc.getElementById("geo").addEventListener("click", () => {
    if (!windowObject.navigator.geolocation) {
      status(
        "Your browser cannot share location. Search for a place instead.",
        true,
      );
      return;
    }
    status("Waiting for your location...");
    windowObject.navigator.geolocation.getCurrentPosition(
      (position) =>
        selectPlace({
          name: "Your location",
          region: "",
          country: "",
          lat:
            Math.round(position.coords.latitude * LOCATION_PRECISION) /
            LOCATION_PRECISION,
          lon:
            Math.round(position.coords.longitude * LOCATION_PRECISION) /
            LOCATION_PRECISION,
        }),
      () =>
        status("Location was not shared. Search for a place instead.", true),
      { timeout: 10000, maximumAge: 600000 },
    );
  });
}

/** Initializes place search and geolocation.
 * @param {AppDependencies} deps
 * @returns {{findPlaces: () => Promise<void>, selectPlace: (place: Place) => Promise<Reading|null>}}
 */
export function initPlaceSearch(deps) {
  const { document: doc, UI } = deps;
  const startRequest = createRequestGuard();
  const status = (message, isError) =>
    UI.setStatus(doc.getElementById("aqi-status"), message, isError);
  const selectPlace = (place) => choosePlace(deps, place);
  const find = () => findPlaces(deps, startRequest, status, selectPlace);
  doc.getElementById("find").addEventListener("click", find);
  doc.getElementById("place").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    find();
  });
  initLocation(deps, status, selectPlace);
  return { findPlaces: find, selectPlace };
}
