import * as Core from "./app.js";
import * as Api from "./air-api.js";
import * as UI from "./ui.js";
import * as Views from "./views.js";
import { WORLD } from "./data.js";
import { initHaze } from "./features/haze.js";
import { initPlaceSearch } from "./features/place-search.js";
import { initWorldBoard } from "./features/world-board.js";
import { initHeroSearch } from "./features/hero-search.js";
import { initPlanner } from "./features/planner.js";
import { initAiRoutine } from "./features/ai-routine.js";

/** Creates an isolated application instance with injected dependencies.
 * @param {Record<string, unknown>} [options]
 * @returns {{state: {place: Place|null, plan: Plan|null}}}
 */
export function createApp(options = {}) {
  const getOption = (key, fallback) =>
    Object.prototype.hasOwnProperty.call(options, key)
      ? options[key]
      : fallback;
  const doc = getOption("document", globalThis.document);
  const windowObject = getOption("window", globalThis.window);
  const fetchImpl = getOption("fetchImpl", globalThis.fetch);
  const core = getOption("core", Core);
  const api = getOption("api", Api);
  const ui = getOption("ui", UI);
  const views = getOption("views", Views);
  const worldPlaces = getOption("worldPlaces", WORLD);
  const state = { place: null, plan: null };
  const deps = {
    document: doc,
    window: windowObject,
    fetchImpl,
    Core: core,
    Api: api,
    UI: ui,
    Views: views,
    worldPlaces,
    state,
  };
  deps.placeSearch = initPlaceSearch(deps);
  initHaze(deps);
  initWorldBoard(deps);
  initHeroSearch(deps);
  initPlanner(deps);
  initAiRoutine(deps);
  return { state };
}

if (typeof window !== "undefined") createApp();
