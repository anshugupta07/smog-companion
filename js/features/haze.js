const MAX_HAZE = 0.92;
const BASE_HAZE = 0.08;
const AQI_MAX = 500;
const HAZE_SCALE = 0.85;

/** Initializes the haze preview slider.
 * @param {AppDependencies} deps
 * @returns {void}
 */
export function initHaze(deps) {
  const { document: doc, Core } = deps;
  const update = () => {
    const value = Core.parseAqi(doc.getElementById("hazeRange").value) || 0;
    const band = Core.aqiCategory(value);
    doc
      .getElementById("scene")
      .style.setProperty(
        "--haze",
        String(Math.min(MAX_HAZE, BASE_HAZE + (value / AQI_MAX) * HAZE_SCALE)),
      );
    doc.getElementById("hazeVal").textContent = String(value);
    doc.getElementById("hazeName").textContent = band.name;
    doc.getElementById("hazeAdvice").textContent = band.advice;
  };
  doc.getElementById("hazeRange").addEventListener("input", update);
  update();
}
