/**
 * Smog Companion - core logic.
 * Pure, side-effect-free functions: AQI parsing, input sanitising, profile
 * normalising, the ranked plan, the offline routine and the AI prompt.
 * No DOM, no network, no innerHTML, no eval, no secrets, so it runs in Node and the browser.
 */
import { AQI_MAX, AQI_MIN, BAND_LEVEL, DEFAULT_TYPICAL_AQI, TEXT_LIMIT } from "./constants.js";
import { EN_PROMPT, EN_ROUTINES } from "./content/en.js";
import { MESSAGES } from "./content/messages.js";
import { BANDS, ENUMS, IMPACT_WEIGHT, RULES } from "./data.js";

const PROMPT_ACTION_LIMIT = 6;
/** @type {readonly ("children" | "elderly" | "respiratory" | "pregnant")[]} */
const SENSITIVE_GROUPS = Object.freeze(["children", "elderly", "respiratory", "pregnant"]);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * True for empty, null, undefined and whitespace-only values.
 * @param {unknown} value
 * @returns {boolean}
 */
const isBlank = (value) =>
  value === "" || value === null || value === undefined || (typeof value === "string" && value.trim() === "");

/**
 * Returns the value when it is one of the allowed choices, otherwise the fallback.
 * @param {unknown} value
 * @param {readonly string[]} allowed
 * @param {string} fallback
 * @returns {string}
 */
const pick = (value, allowed, fallback) => (typeof value === "string" && allowed.includes(value) ? value : fallback);

/**
 * Parses an AQI value.
 * @param {unknown} value
 * @returns {number|null} A whole number clamped to 0-500, or null when the input is unusable.
 */
export function parseAqi(value) {
  if (isBlank(value)) {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return Math.min(AQI_MAX, Math.max(AQI_MIN, Math.round(number)));
}

/**
 * Finds the health band for an AQI.
 * @param {unknown} aqi
 * @returns {Band}
 * @throws {RangeError} When the AQI is not a usable number.
 */
export function aqiCategory(aqi) {
  const value = parseAqi(aqi);
  if (value === null) {
    throw new RangeError(`AQI must be a number between ${AQI_MIN} and ${AQI_MAX}`);
  }
  return /** @type {Band} */ (BANDS.find((band) => value <= band.max));
}

/**
 * Strips control characters and angle brackets, collapses whitespace and caps the length.
 * @param {unknown} input
 * @param {number} [max] Maximum length of the result.
 * @returns {string}
 */
export function sanitizeText(input, max = TEXT_LIMIT.name) {
  return (
    String(input ?? "")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001F\u007F<>]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
  );
}

/**
 * Whitelists every field so downstream code (and the AI prompt) only ever sees known values.
 * @param {unknown} raw
 * @returns {Profile}
 */
export function normalizeProfile(raw) {
  const input = isRecord(raw) ? raw : {};
  const aqi = parseAqi(input.aqi);
  return {
    cityName: sanitizeText(input.cityName, TEXT_LIMIT.placeName) || MESSAGES.defaultPlaceName,
    aqi: aqi ?? DEFAULT_TYPICAL_AQI,
    aqiIsLive: aqi !== null,
    children: input.children === true,
    elderly: input.elderly === true,
    respiratory: input.respiratory === true,
    pregnant: input.pregnant === true,
    commute: pick(input.commute, ENUMS.commute, "transit"),
    cooking: pick(input.cooking, ENUMS.cooking, "lpg"),
    heating: pick(input.heating, ENUMS.heating, "none"),
    purifier: pick(input.purifier, ENUMS.purifier, "no"),
  };
}

/**
 * Builds a ranked, explained action plan from a (possibly raw) profile.
 * @param {unknown} rawProfile
 * @returns {Plan}
 */
export function buildPlan(rawProfile) {
  const profile = normalizeProfile(rawProfile);
  const band = aqiCategory(profile.aqi);
  const actions = RULES.filter((rule) => rule.applies(profile, band))
    .map(({ applies, ...action }) => action)
    .sort((a, b) => IMPACT_WEIGHT[b.impact] - IMPACT_WEIGHT[a.impact]);
  const totalImpact = actions.reduce((sum, action) => sum + IMPACT_WEIGHT[action.impact], 0);
  return { profile, band, actions, totalImpact };
}

/**
 * Builds the LLM prompt from whitelisted profile fields only, so user text cannot inject instructions.
 * @param {Plan} plan
 * @returns {string}
 */
export function buildPrompt(plan) {
  const { profile, band } = plan;
  const groups = SENSITIVE_GROUPS.filter((group) => profile[group]).join(", ") || EN_PROMPT.noGroups;
  const actions = plan.actions
    .slice(0, PROMPT_ACTION_LIMIT)
    .map((action, index) => `${index + 1}. ${action.title} (${action.impact} impact)`)
    .join("\n");
  const data = [
    `city=${profile.cityName}`,
    `AQI=${profile.aqi} (${band.name})`,
    `sensitive groups=${groups}`,
    `commute=${profile.commute}`,
    `cooking=${profile.cooking}`,
    `heating=${profile.heating}`,
    `purifier=${profile.purifier}`,
  ].join("; ");
  return [
    EN_PROMPT.role,
    EN_PROMPT.style,
    EN_PROMPT.guard,
    `DATA: ${data}.`,
    `Planned actions:\n${actions}`,
    EN_PROMPT.task,
  ].join("\n");
}

/**
 * Keeps the text of every step whose condition holds, in order.
 * @param {[boolean, string][]} pairs
 * @returns {string[]}
 */
const stepsWhere = (pairs) => pairs.filter(([condition]) => condition).map(([, text]) => text);

/**
 * @param {(id: string) => boolean} has
 * @param {boolean} hasAirCleaner
 * @param {number} level
 * @returns {string[]}
 */
function morningSteps(has, hasAirCleaner, level) {
  return stepsWhere([
    [true, EN_ROUTINES.morningCheck],
    [hasAirCleaner, EN_ROUTINES.cleanAir],
    [has("cook-biomass"), EN_ROUTINES.biomassCook],
    [!has("cook-biomass") && has("cook-vent"), EN_ROUTINES.exhaustCook],
    [has("commute-car"), EN_ROUTINES.carpool],
    [has("commute-wfh") && level >= BAND_LEVEL.veryUnhealthy, EN_ROUTINES.workHome],
    [has("mask"), EN_ROUTINES.mask],
  ]);
}

/**
 * @param {(id: string) => boolean} has
 * @param {number} level
 * @returns {string[]}
 */
function middaySteps(has, level) {
  const items = stepsWhere([
    [has("ventilate"), EN_ROUTINES.ventilate],
    [has("timing"), EN_ROUTINES.timing],
    [level >= BAND_LEVEL.veryUnhealthy, EN_ROUTINES.skipErrands],
  ]);
  return items.length ? items : [EN_ROUTINES.normalMidday];
}

/**
 * @param {(id: string) => boolean} has
 * @param {boolean} hasAirCleaner
 * @returns {string[]}
 */
function eveningSteps(has, hasAirCleaner) {
  return stepsWhere([
    [has("sensitive"), EN_ROUTINES.sensitive],
    [has("heat-solid"), EN_ROUTINES.heatSolid],
    [true, EN_ROUTINES.cleanHome],
    [hasAirCleaner, EN_ROUTINES.bedroomCleaner],
  ]);
}

/**
 * Offline, rule-based daily routine. Works with no AI and no network.
 * @param {Plan} plan
 * @returns {RoutinePart[]}
 */
export function buildRoutine(plan) {
  const has = (/** @type {string} */ id) => plan.actions.some((action) => action.id === id);
  const level = plan.band.level;
  const hasAirCleaner = has("purifier-diy") || has("purifier-use");
  return [
    { when: "Morning", items: morningSteps(has, hasAirCleaner, level) },
    { when: "Midday", items: middaySteps(has, level) },
    { when: "Evening", items: eveningSteps(has, hasAirCleaner) },
  ];
}
