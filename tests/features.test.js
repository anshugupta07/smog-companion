// Unit tests for the pure helpers exported by the feature modules.
import { test } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { hazeOpacity } from "../js/features/haze.js";
import { aqiError } from "../js/features/planner.js";
import { errorMessage, roundCoordinate } from "../js/features/place-search.js";
import { filterRows } from "../js/features/world-board.js";
import { requestRoutine } from "../js/features/ai-routine.js";
import { createRequestGuard, runWhenNearViewport } from "../js/features/request.js";
import { ApiError } from "../js/errors.js";

test("hazeOpacity grows with the AQI and stays inside its range", () => {
  assert.strictEqual(hazeOpacity(0), 0.08);
  assert.ok(hazeOpacity(250) > hazeOpacity(100));
  assert.strictEqual(hazeOpacity(500), 0.92);
  assert.strictEqual(hazeOpacity(5000), 0.92);
});

test("aqiError accepts empty and in-range values and explains everything else", () => {
  for (const ok of ["", "0", "250", "500", "12.5"]) {
    assert.strictEqual(aqiError(ok), "", ok);
  }
  for (const bad of ["-1", "501", "abc", "Infinity"]) {
    assert.strictEqual(aqiError(bad), "Enter an AQI from 0 to 500.", bad);
  }
});

test("roundCoordinate keeps about 1 km of precision", () => {
  assert.strictEqual(roundCoordinate(23.022505), 23.02);
  assert.strictEqual(roundCoordinate(72.5714), 72.57);
  assert.strictEqual(roundCoordinate(-0.004), -0);
});

test("errorMessage reads Error objects and stringifies anything else", () => {
  assert.strictEqual(errorMessage(new Error("boom")), "boom");
  assert.strictEqual(errorMessage("plain"), "plain");
});

test("filterRows hides rows that do not match, case-insensitively, and shows all for an empty filter", () => {
  const dom = new JSDOM(
    '<table><tbody id="b"><tr data-k="delhi india"></tr><tr data-k="lahore pakistan"></tr><tr></tr></tbody></table>',
  );
  const body = dom.window.document.getElementById("b");
  filterRows(body, "  INDIA ");
  assert.deepStrictEqual(
    Array.from(body.rows).map((row) => row.hidden),
    [false, true, true],
  );
  filterRows(body, "");
  assert.deepStrictEqual(
    Array.from(body.rows).map((row) => row.hidden),
    [false, false, false],
  );
});

test("requestRoutine returns the text and posts only the profile as JSON", async () => {
  let seen;
  const fetchImpl = async (url, options) => {
    seen = { url, options };
    return { ok: true, status: 200, json: async () => ({ text: "Stay in." }) };
  };
  assert.strictEqual(await requestRoutine(fetchImpl, { aqi: 200 }), "Stay in.");
  assert.strictEqual(seen.url, "/api/routine");
  assert.strictEqual(seen.options.method, "POST");
  assert.deepStrictEqual(JSON.parse(seen.options.body), { profile: { aqi: 200 } });
});

test("requestRoutine throws ApiError with the server's message or the status", async () => {
  const withError = async () => ({ ok: false, status: 503, json: async () => ({ error: "AI is not configured." }) });
  await assert.rejects(
    requestRoutine(withError, {}),
    (error) => error instanceof ApiError && /not configured/.test(error.message),
  );
  const noBody = async () => ({ ok: false, status: 500, json: async () => Promise.reject(new Error("no json")) });
  await assert.rejects(requestRoutine(noBody, {}), /status 500/);
  const wrongShape = async () => ({ ok: true, status: 200, json: async () => ({ text: 5 }) });
  await assert.rejects(requestRoutine(wrongShape, {}), /status 200/);
});

test("the request guard only treats the newest request as current", () => {
  const start = createRequestGuard();
  const first = start();
  assert.strictEqual(first(), true);
  const second = start();
  assert.strictEqual(first(), false);
  assert.strictEqual(second(), true);
});

test("runWhenNearViewport runs at once without IntersectionObserver and waits when it exists", () => {
  let calls = 0;
  runWhenNearViewport({}, {}, () => calls++);
  assert.strictEqual(calls, 1);

  let notify;
  let disconnected = false;
  const windowObject = {
    IntersectionObserver: class {
      constructor(callback) {
        notify = callback;
      }
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
  };
  runWhenNearViewport(windowObject, {}, () => calls++);
  assert.strictEqual(calls, 1, "waits until visible");
  notify([{ isIntersecting: false }]);
  assert.strictEqual(calls, 1);
  notify([{ isIntersecting: true }]);
  assert.strictEqual(calls, 2);
  assert.ok(disconnected);
});
