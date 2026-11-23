import { AQI_MAX } from "../constants.js";

/** Haze overlay opacity range for the hero illustration. */
const HAZE = Object.freeze({ min: 0.08, max: 0.92, scale: 0.85 });

/**
 * Converts an AQI to the opacity of the haze overlay.
 * @param {number} aqi
 * @returns {number} A value between 0.08 and 0.92.
 */
export function hazeOpacity(aqi) {
  return Math.min(HAZE.max, HAZE.min + (aqi / AQI_MAX) * HAZE.scale);
}

/**
 * Initializes the haze preview slider.
 * @param {AppDependencies} deps
 * @returns {void}
 */
export function initHaze({ $, Core }) {
  const range = $("hazeRange", "input");
  const update = () => {
    const value = Core.parseAqi(range.value) || 0;
    const band = Core.aqiCategory(value);
    $("scene").style.setProperty("--haze", String(hazeOpacity(value)));
    $("hazeVal").textContent = String(value);
    $("hazeName").textContent = band.name;
    $("hazeAdvice").textContent = band.advice;
  };
  range.addEventListener("input", update);
  update();
}
