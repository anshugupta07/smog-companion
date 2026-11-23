/**
 * Smog Companion - page entry point. Builds the dependency set and starts each feature.
 * Everything a feature touches (document, window, fetch, modules) is passed in, so tests can
 * run the whole page against a fake DOM and a fake network.
 */
import * as Core from "./app.js";
import * as Api from "./air-api.js";
import * as UI from "./ui.js";
import * as Views from "./views.js";
import { WORLD } from "./data.js";
import { createElementLookup } from "./dom.js";
import { initHaze } from "./features/haze.js";
import { initPlaceSearch } from "./features/place-search.js";
import { initWorldBoard } from "./features/world-board.js";
import { initHeroSearch } from "./features/hero-search.js";
import { initPlanner } from "./features/planner.js";
import { initAiRoutine } from "./features/ai-routine.js";

/**
 * The real browser dependencies, used for anything the caller does not replace.
 * @returns {Omit<AppDependencies, "$" | "state" | "placeSearch">}
 */
function defaultDependencies() {
  return {
    document: globalThis.document,
    window: globalThis.window,
    fetchImpl: (...args) => globalThis.fetch(...args),
    Core,
    Api,
    UI,
    Views,
    worldPlaces: WORLD,
  };
}

/**
 * Creates an isolated application instance.
 * @param {Partial<AppDependencies>} [options] Any dependency can be replaced, for example in tests.
 * @returns {{state: AppState}} The live page state.
 */
export function createApp(options = {}) {
  const provided = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
  const base = { ...defaultDependencies(), ...provided };
  /** @type {AppDependencies} */
  const deps = { ...base, $: createElementLookup(base.document), state: { place: null, plan: null } };
  deps.placeSearch = initPlaceSearch(deps);
  initHaze(deps);
  initWorldBoard(deps);
  initHeroSearch(deps);
  initPlanner(deps);
  initAiRoutine(deps);
  return { state: deps.state };
}

if (typeof window !== "undefined") {
  createApp();
}
