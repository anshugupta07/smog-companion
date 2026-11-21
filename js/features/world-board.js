import { runWhenNearViewport } from "./request.js";

/** Initializes the live world board.
 * @param {AppDependencies} deps
 * @returns {void}
 */
export function initWorldBoard(deps) {
  const { document: doc, window: windowObject, Api, Core, Views, UI } = deps;
  const body = doc.getElementById("world-body");
  const status = doc.getElementById("world-status");
  const refresh = doc.getElementById("refresh");
  const applyFilter = () => {
    const query = doc.getElementById("filter").value.trim().toLowerCase();
    Array.from(body.rows).forEach((row) => {
      row.hidden = query !== "" && !row.dataset.k.includes(query);
    });
  };
  const usePlace = (place) => {
    deps.placeSearch.selectPlace(place);
    doc.getElementById("planner").scrollIntoView();
    doc.getElementById("place").focus();
  };
  const load = async () => {
    UI.setBusy(refresh, true);
    status.textContent = "Loading live data...";
    status.className = "hint";
    try {
      const readings = (await Api.fetchAqiMany(deps.worldPlaces))
        .filter((place) => place.reading)
        .sort((a, b) => b.reading.aqi - a.reading.aqi);
      body.replaceChildren(
        ...readings.map((place) =>
          Views.worldRow(place, Core.aqiCategory(place.reading.aqi), usePlace),
        ),
      );
      applyFilter();
      status.textContent = readings.length
        ? `${readings.length} places, updated ${new Date().toLocaleTimeString()}.`
        : "No data returned.";
    } catch (error) {
      status.textContent = `Could not load live data (${error.message})`;
      status.className = "error";
    } finally {
      UI.setBusy(refresh, false);
    }
  };
  doc.getElementById("filter").addEventListener("input", applyFilter);
  refresh.addEventListener("click", load);
  runWhenNearViewport(windowObject, doc.getElementById("world"), load);
}
