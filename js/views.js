/**
 * Smog Companion - view builders. Pure functions that turn data into DOM nodes.
 * They never read the page or touch the network, so they are easy to test in isolation.
 */
import * as UI from "./ui.js";

const { el, button } = UI;

/** One colour per AQI band level (index = band.level). Colour is never the only signal. */
const BAND_COLORS = Object.freeze([
  "#2e7d32",
  "#f9a825",
  "#ef6c00",
  "#c62828",
  "#7b1fa2",
  "#5d1a2b",
]);

const placeLabel = (place) =>
  [place.name, place.region, place.country].filter(Boolean).join(", ");

/** A list item holding a button that selects a geocoded place. */
function placeOption(place, onChoose) {
  const item = el("li");
  item.append(button(placeLabel(place), () => onChoose(place)));
  return item;
}

/** Large AQI card shown under the hero search. */
function quickCard(place, reading, band) {
  const link = el("a", "Build my plan for this place");
  link.href = "#planner";
  return [
    el("p", placeLabel(place)),
    el("p", String(reading.aqi), "aqi"),
    el("p", band.name),
    el("p", band.advice),
    link,
  ];
}

/** One row of the world board. */
function worldRow(place, band, onUse) {
  const dot = el("span", null, "dot");
  dot.style.setProperty("--c", BAND_COLORS[band.level]);
  const level = el("td");
  level.append(dot, document.createTextNode(band.name));

  const use = el("td");
  const useButton = button("Use", () => onUse(place));
  useButton.setAttribute("aria-label", `Use ${place.name} for my plan`);
  use.append(useButton);

  const name = el("th", `${place.name}, ${place.country}`);
  name.scope = "row";
  const row = el("tr");
  row.dataset.k = `${place.name} ${place.country}`.toLowerCase();
  const pm25 = place.reading.pm25 === null ? "n/a" : String(place.reading.pm25);
  row.append(
    name,
    el("td", String(place.reading.aqi), "n"),
    level,
    el("td", pm25),
    use,
  );
  return row;
}

/** Summary card: place, AQI number, band name and advice. */
function planSummary(plan) {
  const card = el("div", null, "band plan-summary");
  card.style.setProperty("--bandc", BAND_COLORS[plan.band.level]);
  const typical = plan.profile.aqiIsLive ? "" : " (typical winter level)";
  card.append(
    el("p", `${plan.profile.cityName}${typical}`),
    el("p", String(plan.profile.aqi), "aqi"),
    el("h3", plan.band.name),
    el("p", plan.band.advice),
  );
  return card;
}

/** One ranked action as a card: title, why it helps, area/impact/effort chips and the steps. */
function actionItem(action) {
  const chips = el("p", null, "chips");
  chips.append(
    el("span", action.area, "chip"),
    el(
      "span",
      `${action.impact} impact`,
      `chip chip-${action.impact.toLowerCase()}`,
    ),
    el("span", `${action.effort} effort`, "chip"),
  );
  const steps = el("p", null, "action-steps");
  steps.append(
    el("strong", "What to do: "),
    document.createTextNode(action.steps),
  );
  const item = el("li", null, "action");
  item.append(
    el("h4", action.title, "action-title"),
    el("p", action.why, "action-why"),
    chips,
    steps,
  );
  return item;
}

/** The complete plan: summary card plus the ranked list of actions. */
function planView(plan) {
  const list = el("ol", null, "plan-list");
  list.append(...plan.actions.map(actionItem));
  const section = el("div", null, "plan-actions");
  section.append(
    el("h3", `${plan.actions.length} actions, most impact first`),
    list,
  );
  return [planSummary(plan), section];
}

/** Headings and bullet lists for the morning, midday and evening routine. */
function routineView(routine) {
  return routine.flatMap((part) => {
    const list = el("ul");
    list.append(...part.items.map((text) => el("li", text)));
    return [el("h3", part.when), list];
  });
}

export {
  BAND_COLORS,
  placeLabel,
  placeOption,
  quickCard,
  worldRow,
  planView,
  routineView,
};
