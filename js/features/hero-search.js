import { createRequestGuard } from "./request.js";
import { choosePlace } from "./place-search.js";

async function searchHero(deps, startRequest, showQuick, showReading) {
  const { document: doc, Api, Views } = deps;
  const results = doc.getElementById("q-results");
  const isCurrent = startRequest();
  results.replaceChildren();
  showQuick(deps.UI.el("p", "Searching..."));
  try {
    const found = await Api.geocode(doc.getElementById("q").value);
    if (!isCurrent()) return;
    if (!found.length) {
      showQuick(
        deps.UI.el(
          "p",
          "No places found. Try another spelling or a larger nearby city.",
          "error",
        ),
      );
      return;
    }
    doc.getElementById("quick").hidden = true;
    results.replaceChildren(
      ...found.map((place) => Views.placeOption(place, showReading)),
    );
  } catch (error) {
    if (isCurrent()) {
      showQuick(deps.UI.el("p", `Search failed: ${error.message}`, "error"));
    }
  }
}

/** Initializes hero place search and live reading cards.
 * @param {AppDependencies} deps
 * @returns {void}
 */
export function initHeroSearch(deps) {
  const { document: doc, Views, UI } = deps;
  const results = doc.getElementById("q-results");
  const quick = doc.getElementById("quick");
  const startRequest = createRequestGuard();
  const showQuick = (...nodes) => {
    quick.replaceChildren(...nodes);
    quick.hidden = false;
  };
  const showReading = async (place) => {
    results.replaceChildren();
    showQuick(UI.el("p", "Loading live air quality..."));
    const reading = await choosePlace(deps, place);
    if (!reading) {
      showQuick(
        UI.el(
          "p",
          "Could not load live air quality for this place. Try again or type your AQI in the planner.",
          "error",
        ),
      );
      return;
    }
    const band = deps.Core.aqiCategory(reading.aqi);
    quick.style.setProperty("--c", Views.BAND_COLORS[band.level]);
    showQuick(...Views.quickCard(place, reading, band));
  };
  doc
    .getElementById("hero-search")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      await searchHero(deps, startRequest, showQuick, showReading);
    });
}
