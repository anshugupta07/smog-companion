import { MESSAGES } from "../content/messages.js";
import { errorMessage } from "./place-search.js";
import { runWhenNearViewport } from "./request.js";

/**
 * Hides the rows that do not match the filter text.
 * @param {HTMLTableSectionElement} body
 * @param {string} filterText
 * @returns {void}
 */
export function filterRows(body, filterText) {
  const query = filterText.trim().toLowerCase();
  for (const row of Array.from(body.rows)) {
    row.hidden = query !== "" && !(row.dataset.k ?? "").includes(query);
  }
}

/**
 * Initializes the live world board: loads when near the viewport, refreshes on request, filters by name.
 * @param {AppDependencies} deps
 * @returns {void}
 */
export function initWorldBoard(deps) {
  const { $, window: windowObject, Api, Core, Views, UI, worldPlaces } = deps;
  const body = $("world-body", "tbody");
  const status = $("world-status");
  const refresh = $("refresh", "button");
  const filter = $("filter", "input");

  /** @param {Place} place */
  const usePlace = (place) => {
    deps.placeSearch?.selectPlace(place);
    $("planner").scrollIntoView();
    $("place").focus();
  };

  /**
   * @param {string} message
   * @param {boolean} [isError]
   * @returns {void}
   */
  const setStatus = (message, isError = false) => UI.setStatus(status, message, isError);

  /** Loads (or reloads) every world place and renders the sorted rows. */
  async function load() {
    UI.setBusy(refresh, true);
    setStatus(MESSAGES.worldLoading);
    try {
      const withReadings = (await Api.fetchAqiMany(worldPlaces)).filter(hasReading);
      withReadings.sort((a, b) => b.reading.aqi - a.reading.aqi);
      body.replaceChildren(
        ...withReadings.map((place) => Views.worldRow(place, Core.aqiCategory(place.reading.aqi), usePlace)),
      );
      filterRows(body, filter.value);
      setStatus(
        withReadings.length
          ? MESSAGES.worldUpdated(withReadings.length, new Date().toLocaleTimeString())
          : MESSAGES.worldEmpty,
      );
    } catch (error) {
      setStatus(MESSAGES.worldFailed(errorMessage(error)), true);
    } finally {
      UI.setBusy(refresh, false);
    }
  }

  filter.addEventListener("input", () => filterRows(body, filter.value));
  refresh.addEventListener("click", load);
  runWhenNearViewport(windowObject, $("world"), load);
}

/**
 * Narrows a place to one that has a reading.
 * @param {PlaceWithReading} place
 * @returns {place is PlaceWithReading & {reading: Reading}}
 */
function hasReading(place) {
  return place.reading !== null;
}
