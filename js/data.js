/**
 * Smog Companion - static data: AQI bands, option lists, advice rules and the world board places.
 * Pure data only (no logic beyond tiny predicates) so it is easy to review, translate and test.
 */
import { EN_BANDS, EN_RULES } from "./content/en.js";

/** Typical peak-winter AQI per city. Rough defaults used only when no live AQI is known. */
const CITIES = Object.freeze({
  delhi: { label: "Delhi NCR", aqi: 320 },
  ahmedabad: { label: "Ahmedabad", aqi: 180 },
  lahore: { label: "Lahore", aqi: 300 },
  kathmandu: { label: "Kathmandu", aqi: 190 },
  beijing: { label: "Beijing", aqi: 170 },
  other: { label: "Other city", aqi: 120 },
});

/** Allowed values for each profile choice. Anything else falls back to a safe default. */
const ENUMS = Object.freeze({
  commute: ["car", "twowheeler", "transit", "active", "wfh"],
  cooking: ["lpg", "electric", "biomass"],
  heating: ["none", "electric", "gas", "solid"],
  purifier: ["yes", "no"],
});

/** US-EPA style bands. Each band carries a text label so meaning never depends on colour alone. */
// US-EPA style bands. Each band always carries a text label (never colour alone).
const BANDS = Object.freeze([
  { max: 50, level: 0, ...EN_BANDS[0] },
  { max: 100, level: 1, ...EN_BANDS[1] },
  { max: 150, level: 2, ...EN_BANDS[2] },
  { max: 200, level: 3, ...EN_BANDS[3] },
  { max: 300, level: 4, ...EN_BANDS[4] },
  { max: 500, level: 5, ...EN_BANDS[5] },
]);

/** Numeric weight of each impact label, used to rank actions. */
const IMPACT_WEIGHT = Object.freeze({ High: 3, Medium: 2, Low: 1 });

const isSensitive = (profile) =>
  Boolean(
    profile.children ||
    profile.elderly ||
    profile.respiratory ||
    profile.pregnant,
  );

/**
 * Advice rules. `applies(profile, band)` decides whether a rule is shown.
 * Impact figures are approximate and labelled as estimates in the text.
 */
const RULES = [
  {
    id: "mask",
    area: "Outdoors",
    ...EN_RULES.mask,
    impact: "High",
    effort: "Low",
    applies: (p, b) => b.level >= 3 || (isSensitive(p) && b.level >= 2),
  },
  {
    id: "timing",
    area: "Outdoors",
    ...EN_RULES.timing,
    impact: "Medium",
    effort: "Low",
    applies: (p, b) => b.level >= 2,
  },
  {
    id: "sensitive",
    area: "Family health",
    ...EN_RULES.sensitive,
    impact: "High",
    effort: "Low",
    applies: (p, b) => isSensitive(p) && b.level >= 2,
  },
  {
    id: "purifier-diy",
    area: "Indoor air",
    ...EN_RULES["purifier-diy"],
    impact: "High",
    effort: "Medium",
    applies: (p, b) => p.purifier === "no" && b.level >= 2,
  },
  {
    id: "purifier-use",
    area: "Indoor air",
    ...EN_RULES["purifier-use"],
    impact: "Medium",
    effort: "Low",
    applies: (p, b) => p.purifier === "yes" && b.level >= 2,
  },
  {
    id: "ventilate",
    area: "Indoor air",
    ...EN_RULES.ventilate,
    impact: "Medium",
    effort: "Low",
    applies: (p, b) => b.level >= 2,
  },
  {
    id: "cook-biomass",
    area: "Cooking",
    ...EN_RULES["cook-biomass"],
    impact: "High",
    effort: "High",
    applies: (p) => p.cooking === "biomass",
  },
  {
    id: "cook-vent",
    area: "Cooking",
    ...EN_RULES["cook-vent"],
    impact: "Medium",
    effort: "Low",
    applies: (p) => p.cooking !== "biomass",
  },
  {
    id: "heat-solid",
    area: "Heating",
    ...EN_RULES["heat-solid"],
    impact: "High",
    effort: "Medium",
    applies: (p) => p.heating === "solid",
  },
  {
    id: "commute-car",
    area: "Getting around",
    ...EN_RULES["commute-car"],
    impact: "High",
    effort: "Medium",
    applies: (p) => p.commute === "car" || p.commute === "twowheeler",
  },
  {
    id: "commute-active",
    area: "Getting around",
    ...EN_RULES["commute-active"],
    impact: "Medium",
    effort: "Low",
    applies: (p, b) => p.commute === "active" && b.level >= 3,
  },
  {
    id: "commute-wfh",
    area: "Getting around",
    ...EN_RULES["commute-wfh"],
    impact: "Medium",
    effort: "Low",
    applies: (p, b) => p.commute === "wfh" || b.level >= 4,
  },
  {
    id: "clean-home",
    area: "Indoor air",
    ...EN_RULES["clean-home"],
    impact: "Low",
    effort: "Low",
    applies: () => true,
  },
  {
    id: "community",
    area: "Community",
    ...EN_RULES.community,
    impact: "Medium",
    effort: "Medium",
    applies: () => true,
  },
];
Object.freeze(RULES);

const worldPlace = (name, country, lat, lon) =>
  Object.freeze({ name, country, lat, lon });

/** Thirty major cities shown on the live world board. */
const WORLD = Object.freeze([
  worldPlace("Delhi", "India", 28.61, 77.21),
  worldPlace("Mumbai", "India", 19.08, 72.88),
  worldPlace("Ahmedabad", "India", 23.02, 72.57),
  worldPlace("Kolkata", "India", 22.57, 88.36),
  worldPlace("Lucknow", "India", 26.85, 80.95),
  worldPlace("Patna", "India", 25.59, 85.14),
  worldPlace("Chennai", "India", 13.08, 80.27),
  worldPlace("Bengaluru", "India", 12.97, 77.59),
  worldPlace("Lahore", "Pakistan", 31.55, 74.34),
  worldPlace("Karachi", "Pakistan", 24.86, 67.01),
  worldPlace("Dhaka", "Bangladesh", 23.81, 90.41),
  worldPlace("Kathmandu", "Nepal", 27.72, 85.32),
  worldPlace("Beijing", "China", 39.9, 116.4),
  worldPlace("Shanghai", "China", 31.23, 121.47),
  worldPlace("Seoul", "South Korea", 37.57, 126.98),
  worldPlace("Tokyo", "Japan", 35.68, 139.69),
  worldPlace("Bangkok", "Thailand", 13.76, 100.5),
  worldPlace("Jakarta", "Indonesia", -6.21, 106.85),
  worldPlace("Dubai", "UAE", 25.2, 55.27),
  worldPlace("Cairo", "Egypt", 30.04, 31.24),
  worldPlace("Lagos", "Nigeria", 6.52, 3.38),
  worldPlace("London", "United Kingdom", 51.51, -0.13),
  worldPlace("Paris", "France", 48.86, 2.35),
  worldPlace("Berlin", "Germany", 52.52, 13.41),
  worldPlace("Moscow", "Russia", 55.76, 37.62),
  worldPlace("New York", "USA", 40.71, -74.01),
  worldPlace("Los Angeles", "USA", 34.05, -118.24),
  worldPlace("Mexico City", "Mexico", 19.43, -99.13),
  worldPlace("Sao Paulo", "Brazil", -23.55, -46.63),
  worldPlace("Sydney", "Australia", -33.87, 151.21),
]);

export { CITIES, ENUMS, BANDS, IMPACT_WEIGHT, RULES, WORLD, isSensitive };
