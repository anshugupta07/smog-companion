// Unit tests for the server helpers: request body reader and station provider client.
import { test } from "node:test";
import assert from "node:assert";
import { Readable } from "node:stream";
import { readBody } from "../lib/body.js";
import { fetchStationReading, stationReading } from "../lib/station.js";
import { chooseEncoding, isNotModified } from "../lib/static.js";
import { ApiError } from "../js/errors.js";

/** A minimal stand-in for an incoming request. */
const fakeRequest = (chunks, headers = {}) => Object.assign(Readable.from(chunks), { headers });

test("readBody joins the chunks into text", async () => {
  const req = fakeRequest([Buffer.from('{"a":'), Buffer.from("1}")]);
  assert.strictEqual(await readBody(req, 100), '{"a":1}');
});

test("readBody rejects a declared size over the limit before reading", async () => {
  const req = fakeRequest([Buffer.from("x")], { "content-length": "5000" });
  await assert.rejects(readBody(req, 100), (error) => error instanceof ApiError && error.status === 413);
});

test("readBody ignores malformed declared lengths and handles repeated length headers", async () => {
  const malformed = fakeRequest([Buffer.from("ok")], { "content-length": "not-a-number" });
  assert.strictEqual(await readBody(malformed, 100), "ok");
  const repeated = fakeRequest([Buffer.from("ok")], { "content-length": ["5000", "10"] });
  await assert.rejects(readBody(repeated, 100), (error) => error instanceof ApiError && error.status === 413);
});

test("readBody rejects a streamed body that grows past the limit", async () => {
  const req = fakeRequest([Buffer.alloc(80), Buffer.alloc(80)]);
  await assert.rejects(readBody(req, 100), (error) => error instanceof ApiError && error.status === 413);
});

test("readBody passes stream errors on", async () => {
  const req = fakeRequest([]);
  const result = readBody(req, 100);
  req.destroy(new Error("socket closed"));
  await assert.rejects(result, /socket closed/);
});

test("encoding and ETag helpers handle negotiation and weak tags", () => {
  assert.strictEqual(chooseEncoding("gzip;q=1, br;q=0"), "gzip");
  assert.strictEqual(chooseEncoding("br;q=0, gzip;q=0"), "identity");
  assert.strictEqual(isNotModified("*", '"abc"'), true);
  assert.strictEqual(isNotModified('W/"abc"', '"abc"'), true);
  assert.strictEqual(isNotModified('"def", "abc"', '"abc"'), true);
  assert.strictEqual(isNotModified('"def"', '"abc"'), false);
});

const providerBody = {
  status: "ok",
  data: {
    aqi: "187",
    iaqi: { pm25: { v: 98 } },
    time: { iso: "2026-11-20T10:00:00+05:30" },
    city: { name: "Karve Road <b>" },
  },
};

test("stationReading converts a provider payload and sanitises its text", () => {
  const reading = stationReading(providerBody);
  assert.strictEqual(reading.aqi, 187);
  assert.strictEqual(reading.pm25, 98);
  assert.strictEqual(reading.pm10, null);
  assert.strictEqual(reading.source, "station");
  assert.ok(!reading.station.includes("<"));
});

test("stationReading returns null for unusable payloads and clamps extreme values", () => {
  for (const body of [
    null,
    undefined,
    {},
    { status: "error" },
    { status: "ok" },
    { status: "ok", data: { aqi: "-" } },
  ]) {
    assert.strictEqual(stationReading(body), null);
  }
  assert.strictEqual(stationReading({ status: "ok", data: { aqi: 9000 } }).aqi, 500);
});

test("fetchStationReading calls the provider with an encoded token and returns the reading", async () => {
  let url;
  const fetchImpl = async (requested) => {
    url = requested;
    return { ok: true, status: 200, json: async () => providerBody };
  };
  const reading = await fetchStationReading({ lat: 18.52, lon: 73.86, token: "a b&c", fetchImpl });
  assert.strictEqual(reading.aqi, 187);
  assert.ok(url.includes("geo:18.52;73.86"));
  assert.ok(url.includes("token=a%20b%26c"));
});

test("fetchStationReading reports bad coordinates, provider errors and missing readings", async () => {
  const token = "t";
  await assert.rejects(fetchStationReading({ lat: 999, lon: 0, token }), (error) => error.status === 400);
  const failing = async () => ({ ok: false, status: 500 });
  await assert.rejects(fetchStationReading({ lat: 1, lon: 1, token, fetchImpl: failing }), /Provider returned 500/);
  const empty = async () => ({ ok: true, status: 200, json: async () => ({ status: "error" }) });
  await assert.rejects(fetchStationReading({ lat: 1, lon: 1, token, fetchImpl: empty }), /No station reading/);
});

test("fetchStationReading turns an aborted request into a timeout error", async () => {
  const aborted = async () => {
    throw Object.assign(new Error("aborted"), { name: "AbortError" });
  };
  await assert.rejects(fetchStationReading({ lat: 1, lon: 1, token: "t", fetchImpl: aborted }), /timed out/);
});
