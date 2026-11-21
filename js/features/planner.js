const AQI_MAX = 500;

/** Validates a raw AQI input.
 * @param {string} raw
 * @returns {string}
 */
export function aqiError(raw) {
  if (raw === "") return "";
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 && number <= AQI_MAX
    ? ""
    : "Enter an AQI from 0 to 500.";
}

/** Initializes planner submission and plan rendering.
 * @param {AppDependencies} deps
 * @returns {void}
 */
export function initPlanner(deps) {
  const { document: doc, Core, Views, state } = deps;
  const readProfile = () => ({
    city: "other",
    cityName: state.place
      ? Views.placeLabel(state.place)
      : doc.getElementById("place").value,
    aqi: doc.getElementById("aqi").value,
    children: doc.getElementById("children").checked,
    elderly: doc.getElementById("elderly").checked,
    respiratory: doc.getElementById("respiratory").checked,
    pregnant: doc.getElementById("pregnant").checked,
    commute: doc.getElementById("commute").value,
    cooking: doc.getElementById("cooking").value,
    heating: doc.getElementById("heating").value,
    purifier: doc.getElementById("purifier").value,
  });
  const renderPlan = (plan) => {
    doc.getElementById("plan").replaceChildren(...Views.planView(plan));
    doc
      .getElementById("routine")
      .replaceChildren(...Views.routineView(Core.buildRoutine(plan)));
    doc.getElementById("ai-section").hidden = false;
    doc.getElementById("plan-status").textContent =
      `Plan ready: ${plan.actions.length} actions for AQI ${plan.profile.aqi}, ${plan.band.name}.`;
    doc.getElementById("plan-heading").focus();
  };
  const input = doc.getElementById("aqi");
  input.addEventListener("input", () => input.setCustomValidity(""));
  doc.getElementById("profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const message = aqiError(input.value.trim());
    input.setCustomValidity(message);
    if (message) {
      input.reportValidity();
      return;
    }
    state.plan = Core.buildPlan(readProfile());
    renderPlan(state.plan);
  });
}
