import { MESSAGES } from "../content/messages.js";
import { choosePlace, errorMessage } from "./place-search.js";
import { createRequestGuard } from "./request.js";

/**
 * Builds the small helpers that write into the hero's result area.
 * @param {AppDependencies} deps
 * @returns {{showQuick: (...nodes: Node[]) => void, showMessage: (message: string, isError?: boolean) => void}}
 */
function createQuickPanel({ $, UI }) {
  const quick = $("quick");
  /** @param {...Node} nodes */
  const showQuick = (...nodes) => {
    quick.replaceChildren(...nodes);
    quick.hidden = false;
  };
  /**
   * @param {string} message
   * @param {boolean} [isError]
   * @returns {void}
   */
  const showMessage = (message, isError = false) => showQuick(UI.el("p", message, isError ? "error" : undefined));
  return { showQuick, showMessage };
}

/**
 * Loads a chosen place and shows its live reading card.
 * @param {AppDependencies} deps
 * @param {ReturnType<typeof createQuickPanel>} panel
 * @param {Place} place
 * @returns {Promise<void>}
 */
async function showReading(deps, panel, place) {
  const { $, Core, Views } = deps;
  $("q-results").replaceChildren();
  panel.showMessage(MESSAGES.loadingReadingShort);
  const reading = await choosePlace(deps, place);
  if (!reading) {
    panel.showMessage(MESSAGES.readingFailedHero, true);
    return;
  }
  const band = Core.aqiCategory(reading.aqi);
  $("quick").style.setProperty("--c", Views.BAND_COLORS[band.level]);
  panel.showQuick(...Views.quickCard(place, reading, band));
}

/**
 * Looks up the typed name and lists the matching places.
 * @param {AppDependencies} deps
 * @param {ReturnType<typeof createQuickPanel>} panel
 * @param {() => () => boolean} startRequest
 * @returns {Promise<void>}
 */
async function search(deps, panel, startRequest) {
  const { $, Api, Views } = deps;
  const results = $("q-results");
  const isCurrent = startRequest();
  results.replaceChildren();
  panel.showMessage(MESSAGES.searching);
  try {
    const found = await Api.geocode($("q", "input").value);
    if (!isCurrent()) {
      return;
    }
    if (!found.length) {
      panel.showMessage(MESSAGES.noPlaces, true);
      return;
    }
    $("quick").hidden = true;
    results.replaceChildren(
      ...found.map((place) => Views.placeOption(place, (chosen) => showReading(deps, panel, chosen))),
    );
  } catch (error) {
    if (isCurrent()) {
      panel.showMessage(MESSAGES.searchFailed(errorMessage(error)), true);
    }
  }
}

/**
 * Initializes the hero search: find a place, then show its live reading card.
 * @param {AppDependencies} deps
 * @returns {void}
 */
export function initHeroSearch(deps) {
  const panel = createQuickPanel(deps);
  const startRequest = createRequestGuard();
  deps.$("hero-search").addEventListener("submit", (event) => {
    event.preventDefault();
    search(deps, panel, startRequest);
  });
}
