// Unit tests for the small shared modules: errors, coordinates, element lookup, messages, constants.
import { test } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { ApiError, ValidationError } from "../js/errors.js";
import { isValidCoordinate } from "../js/coordinates.js";
import { createElementLookup } from "../js/dom.js";
import { MESSAGES } from "../js/content/messages.js";
import { AQI_MAX, AQI_MIN, BAND_LEVEL, MINUTE_MS, SECOND_MS, TEXT_LIMIT } from "../js/constants.js";
import { BANDS } from "../js/data.js";
import { geocode, fetchAqi } from "../js/air-api.js";

test("named errors carry a name, a message and an HTTP status", () => {
  const api = new ApiError("upstream failed");
  assert.strictEqual(api.name, "ApiError");
  assert.strictEqual(api.status, 502);
  assert.strictEqual(new ApiError("nope", 404).status, 404);
  assert.ok(api instanceof Error);
  const invalid = new ValidationError("bad input");
  assert.strictEqual(invalid.name, "ValidationError");
  assert.strictEqual(invalid.message, "bad input");
});

test("air-api throws the right named error for each failure", async () => {
  await assert.rejects(geocode("a"), ValidationError);
  const failing = async () => ({ ok: false, status: 503 });
  await assert.rejects(fetchAqi(1, 1, failing), (error) => error instanceof ApiError && error.status === 503);
  await assert.rejects(fetchAqi(999, 1), RangeError);
});

test("isValidCoordinate accepts only real numbers inside the valid ranges", () => {
  assert.ok(isValidCoordinate(0, 0));
  assert.ok(isValidCoordinate(-90, 180));
  for (const [lat, lon] of [
    [91, 0],
    [0, -181],
    [NaN, 0],
    ["1", 2],
    [null, undefined],
  ]) {
    assert.strictEqual(isValidCoordinate(lat, lon), false, `${lat},${lon}`);
  }
});

test("band levels match the band table and the AQI range is consistent", () => {
  assert.strictEqual(AQI_MIN, 0);
  assert.strictEqual(BANDS[BANDS.length - 1].max, AQI_MAX);
  BANDS.forEach((band, index) => assert.strictEqual(band.level, index));
  assert.strictEqual(BANDS[BAND_LEVEL.veryUnhealthy].name, "Very unhealthy");
  assert.strictEqual(MINUTE_MS, 60 * SECOND_MS);
  assert.ok(TEXT_LIMIT.name > 0);
});

test("element lookup returns the element and fails fast with a clear message", () => {
  const doc = new JSDOM('<input id="aqi"><p id="note"></p>').window.document;
  const $ = createElementLookup(doc);
  assert.strictEqual($("aqi", "input"), doc.getElementById("aqi"));
  assert.strictEqual($("note"), doc.getElementById("note"));
  assert.throws(() => $("missing"), /Missing element #missing in index.html/);
  assert.throws(() => $("note", "input"), /#note should be <input> but is <p>/);
});

test("messages build the exact wording the page shows", () => {
  assert.strictEqual(MESSAGES.placesFound(3), "3 places found. Choose yours.");
  assert.strictEqual(
    MESSAGES.planReady(8, 260, "Very unhealthy"),
    "Plan ready: 8 actions for AQI 260, Very unhealthy.",
  );
  assert.strictEqual(MESSAGES.useButtonLabel("Pune"), "Use Pune for my plan");
  assert.strictEqual(MESSAGES.impactChip("High"), "High impact");
  assert.match(MESSAGES.aiUnavailable("status 503"), /AI is not available here \(status 503\)/);
});

test("liveReading names the data source and omits missing particle data", () => {
  const model = { aqi: 90, pm25: 12, pm10: null, time: "10:00", source: "model", station: "" };
  assert.strictEqual(
    MESSAGES.liveReading({ label: "Pune", reading: model }),
    "Live US AQI 90 for Pune, PM2.5 12 µg/m³, updated 10:00. Model estimate: Open-Meteo.",
  );
  const station = { ...model, pm25: null, source: "station", station: "Karve Road" };
  assert.strictEqual(
    MESSAGES.liveReading({ label: "Pune", reading: station }),
    "Live US AQI 90 for Pune, updated 10:00. Nearest station: Karve Road.",
  );
  assert.match(
    MESSAGES.liveReading({ label: "x", reading: { ...station, station: "" } }),
    /Nearest station: AQI station/,
  );
});
