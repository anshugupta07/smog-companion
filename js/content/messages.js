/**
 * Smog Companion - every message the interface writes while it works (statuses, errors, labels).
 * Kept apart from logic so wording can be reviewed or translated in one place.
 * Advice text lives next to this file in en.js.
 */
export const MESSAGES = Object.freeze({
  searching: "Searching...",
  noPlaces: "No places found. Try another spelling or a larger nearby city.",
  /**
   * @param {number} count
   * @returns {string}
   */
  placesFound: (count) => `${count} places found. Choose yours.`,
  /**
   * @param {string} reason
   * @returns {string}
   */
  searchFailed: (reason) => `Search failed: ${reason}`,
  /**
   * @param {string} label
   * @returns {string}
   */
  loadingReading: (label) => `Loading live air quality for ${label}...`,
  loadingReadingShort: "Loading live air quality...",
  /**
   * @param {{label: string, reading: Reading}} details
   * @returns {string}
   */
  liveReading: ({ label, reading }) => {
    const particles = reading.pm25 === null ? "" : `, PM2.5 ${reading.pm25} µg/m³`;
    const source =
      reading.source === "station"
        ? `Nearest station: ${reading.station || "AQI station"}`
        : "Model estimate: Open-Meteo";
    return `Live US AQI ${reading.aqi} for ${label}${particles}, updated ${reading.time}. ${source}.`;
  },
  /**
   * @param {string} reason
   * @returns {string}
   */
  readingFailed: (reason) => `Could not load live air quality (${reason}) Type your AQI instead.`,
  readingFailedHero: "Could not load live air quality for this place. Try again or type your AQI in the planner.",
  locationUnsupported: "Your browser cannot share location. Search for a place instead.",
  locationWaiting: "Waiting for your location...",
  locationDenied: "Location was not shared. Search for a place instead.",
  yourLocation: "Your location",
  worldLoading: "Loading live data...",
  worldEmpty: "No data returned.",
  /**
   * @param {number} count
   * @param {string} time
   * @returns {string}
   */
  worldUpdated: (count, time) => `${count} places, updated ${time}.`,
  /**
   * @param {string} reason
   * @returns {string}
   */
  worldFailed: (reason) => `Could not load live data (${reason})`,
  aqiRange: "Enter an AQI from 0 to 500.",
  /**
   * @param {number} count
   * @param {number} aqi
   * @param {string} band
   * @returns {string}
   */
  planReady: (count, aqi, band) => `Plan ready: ${count} actions for AQI ${aqi}, ${band}.`,
  buildPlanFirst: "Build your plan first.",
  aiWriting: "Writing your routine...",
  aiTitle: "AI routine",
  /**
   * @param {string} reason
   * @returns {string}
   */
  aiUnavailable: (reason) => `AI is not available here (${reason}). The routine above still applies.`,
  quickCardLink: "Build my plan for this place",
  useButton: "Use",
  /**
   * @param {string} name
   * @returns {string}
   */
  useButtonLabel: (name) => `Use ${name} for my plan`,
  typicalLevel: " (typical winter level)",
  whatToDo: "What to do: ",
  /**
   * @param {number} count
   * @returns {string}
   */
  actionsHeading: (count) => `${count} actions, most impact first`,
  /**
   * @param {string} level
   * @returns {string}
   */
  impactChip: (level) => `${level} impact`,
  /**
   * @param {string} level
   * @returns {string}
   */
  effortChip: (level) => `${level} effort`,
  notAvailable: "n/a",
  defaultPlaceName: "Your area",
});
