import { AQI_MAX, AQI_MIN } from "../constants.js";
import { MESSAGES } from "../content/messages.js";

/**
 * Validates a raw AQI entry from the form.
 * @param {string} raw
 * @returns {string} An error message, or "" when the entry is empty or valid.
 */
export function aqiError(raw) {
  if (raw === "") {
    return "";
  }
  const number = Number(raw);
  return Number.isFinite(number) && number >= AQI_MIN && number <= AQI_MAX ? "" : MESSAGES.aqiRange;
}

/**
 * Reads the planner form into a raw (not yet whitelisted) profile.
 * @param {AppDependencies} deps
 * @returns {Record<string, unknown>}
 */
function readProfile({ $, Views, state }) {
  return {
    cityName: state.place ? Views.placeLabel(state.place) : $("place", "input").value,
    aqi: $("aqi", "input").value,
    children: $("children", "input").checked,
    elderly: $("elderly", "input").checked,
    respiratory: $("respiratory", "input").checked,
    pregnant: $("pregnant", "input").checked,
    commute: $("commute", "select").value,
    cooking: $("cooking", "select").value,
    heating: $("heating", "select").value,
    purifier: $("purifier", "select").value,
  };
}

/**
 * Shows the plan, the offline routine and a screen-reader announcement, then moves focus to the plan.
 * @param {AppDependencies} deps
 * @param {Plan} plan
 * @returns {void}
 */
function renderPlan({ $, Core, Views }, plan) {
  $("plan").replaceChildren(...Views.planView(plan));
  $("routine").replaceChildren(...Views.routineView(Core.buildRoutine(plan)));
  $("ai-section").hidden = false;
  $("plan-status").textContent = MESSAGES.planReady(plan.actions.length, plan.profile.aqi, plan.band.name);
  $("plan-heading").focus();
}

/**
 * Initializes planner submission and plan rendering.
 * @param {AppDependencies} deps
 * @returns {void}
 */
export function initPlanner(deps) {
  const { $, Core, state } = deps;
  const aqiInput = $("aqi", "input");
  aqiInput.addEventListener("input", () => aqiInput.setCustomValidity(""));
  $("profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const message = aqiError(aqiInput.value.trim());
    aqiInput.setCustomValidity(message);
    if (message) {
      aqiInput.reportValidity();
      return;
    }
    state.plan = Core.buildPlan(readProfile(deps));
    renderPlan(deps, state.plan);
  });
}
