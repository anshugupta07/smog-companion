import { test } from "node:test";
import assert from "node:assert";
import * as Api from "../js/air-api.js";

const mock =
  (body, ok = true, status = 200) =>
  async (url) => ({
    ok,
    status,
    json: async () => (typeof body === "function" ? body(url) : body),
  });

test("geocode maps results, drops bad coordinates, sanitises text", async () => {
  const fetchImpl = mock({
    results: [
      {
        name: "Ahmedabad<b>",
        admin1: "Gujarat",
        country: "India",
        latitude: 23.02,
        longitude: 72.57,
      },
      { name: "Bad", latitude: 999, longitude: 0 },
    ],
  });
  const out = await Api.geocode("Ahmedabad", fetchImpl);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].region, "Gujarat");
  assert.ok(!out[0].name.includes("<"));
  assert.deepStrictEqual(await Api.geocode("zzzz", mock({})), []);
  await assert.rejects(Api.geocode("a", fetchImpl), /2 letters/);
});

test("geocode builds an encoded https URL", async () => {
  let seen;
  await Api.geocode("New Delhi & co", async (url) => {
    seen = url;
    return { ok: true, json: async () => ({}) };
  });
  assert.ok(seen.startsWith("https://geocoding-api.open-meteo.com/"));
  assert.ok(seen.includes("New%20Delhi%20%26%20co"));
});

test("fetchAqi parses a reading and validates coordinates", async () => {
  const reading = await Api.fetchAqi(
    23.02,
    72.57,
    mock({
      current: {
        us_aqi: 187.4,
        pm2_5: 98.2,
        pm10: 150,
        time: "2026-11-18T09:00",
      },
    }),
  );
  assert.strictEqual(reading.aqi, 187);
  assert.strictEqual(reading.pm25, 98.2);
  assert.strictEqual(reading.pm10, 150);
  assert.strictEqual(reading.source, "model");
  await assert.rejects(Api.fetchAqi(200, 0), RangeError);
  await assert.rejects(Api.fetchAqi(1, 1, mock({ current: {} })), /No air quality/);
  await assert.rejects(Api.fetchAqi(1, 1, mock({}, false, 500)), /500/);
});

test("fetchAqi prefers the server station provider when available", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  try {
    await withGlobalFetch(
      async (url) => {
        if (url.startsWith("/api/aqi")) {
          return okJson({
            reading: {
              aqi: 210,
              pm25: 99,
              pm10: 140,
              time: "2026-11-20T11:30",
              source: "station",
              station: "Pune Central",
            },
          });
        }
        throw new Error("Open-Meteo fallback should not be called");
      },
      async () => {
        const reading = await Api.fetchAqi(18.52, 73.85);
        assert.strictEqual(reading.source, "station");
        assert.strictEqual(reading.station, "Pune Central");
      },
    );
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});

test("fetchAqi reports missing particle readings as null", async () => {
  const reading = await Api.fetchAqi(1, 1, mock({ current: { us_aqi: 90, time: "t" } }));
  assert.strictEqual(reading.pm25, null);
  assert.strictEqual(reading.pm10, null);
});

test("fetchAqiMany returns one entry per place with null for missing data", async () => {
  const fetchImpl = mock([{ current: { us_aqi: 300, pm2_5: 200, time: "t" } }, { current: {} }]);
  const out = await Api.fetchAqiMany(
    [
      { name: "A", lat: 1, lon: 2 },
      { name: "B", lat: 3, lon: 4 },
      { name: "bad", lat: 99999, lon: 0 },
    ],
    fetchImpl,
  );
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].reading.aqi, 300);
  assert.strictEqual(out[1].reading, null);
  assert.deepStrictEqual(await Api.fetchAqiMany([{ lat: 999, lon: 999 }]), []);
});

test("fetchAqiMany accepts the single-object response shape", async () => {
  const out = await Api.fetchAqiMany([{ name: "A", lat: 1, lon: 2 }], mock({ current: { us_aqi: 55, time: "t" } }));
  assert.strictEqual(out[0].reading.aqi, 55);
});

test("validCoord accepts real coordinates only", () => {
  assert.ok(Api.validCoord(0, 0));
  assert.ok(Api.validCoord(-90, 180));
  for (const [lat, lon] of [
    [91, 0],
    [0, 181],
    [NaN, 0],
    ["1", 2],
    [null, null],
  ]) {
    assert.ok(!Api.validCoord(lat, lon), `${lat},${lon}`);
  }
});

async function withGlobalFetch(impl, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  Api.clearCache();
  try {
    await fn();
  } finally {
    globalThis.fetch = real;
    Api.clearCache();
  }
}
const okJson = (body) => ({ ok: true, json: async () => body });

test("real-fetch requests are cached, injected fetches are not", async () => {
  let calls = 0;
  await withGlobalFetch(
    async () => {
      calls++;
      return okJson({ current: { us_aqi: 55, time: "t" } });
    },
    async () => {
      await Api.fetchAqi(10, 10);
      await Api.fetchAqi(10, 10);
      assert.strictEqual(calls, 1);
      await Api.fetchAqi(10, 10, async () => {
        calls++;
        return okJson({ current: { us_aqi: 56, time: "t" } });
      });
      assert.strictEqual(calls, 2);
    },
  );
});

test("concurrent real-fetch requests share one in-flight request", async () => {
  let calls = 0;
  await withGlobalFetch(
    async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return okJson({ current: { us_aqi: 55, time: "t" } });
    },
    async () => {
      await Promise.all([Api.fetchAqi(11, 11), Api.fetchAqi(11, 11)]);
      assert.strictEqual(calls, 1);
    },
  );
});

test("failed requests are not cached and can be retried", async () => {
  let calls = 0;
  await withGlobalFetch(
    async () => {
      calls++;
      return calls === 1 ? { ok: false, status: 503 } : okJson({ current: { us_aqi: 70, time: "t" } });
    },
    async () => {
      await assert.rejects(Api.fetchAqi(12, 12), /503/);
      assert.strictEqual((await Api.fetchAqi(12, 12)).aqi, 70);
      assert.strictEqual(calls, 2);
    },
  );
});

test("slow requests are aborted by the timeout signal", async () => {
  await withGlobalFetch(
    (url, opts) =>
      new Promise((resolve, reject) => {
        opts.signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    async () => {
      const real = globalThis.setTimeout;
      globalThis.setTimeout = (fn) => real(fn, 5); // shrink the 10 s timeout for the test
      try {
        await assert.rejects(Api.fetchAqi(13, 13), /aborted/);
      } finally {
        globalThis.setTimeout = real;
      }
    },
  );
});

test("throws a clear error when fetch is unavailable", async () => {
  await withGlobalFetch(undefined, async () => {
    await assert.rejects(Api.fetchAqi(14, 14), /fetch is not available/);
  });
});

test("the station route is asked once, then skipped after the server says it has none", async () => {
  const urls = [];
  const original = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = {};
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).startsWith("/api/aqi")) {
      return { ok: false, status: 503, json: async () => ({}) };
    }
    return okJson({ current: { us_aqi: 70, time: "t" } });
  };
  try {
    Api.clearCache();
    await Api.fetchAqi(31, 31);
    await Api.fetchAqi(32, 32);
    assert.strictEqual(urls.filter((url) => url.startsWith("/api/aqi")).length, 1);
    Api.clearCache();
    await Api.fetchAqi(33, 33);
    assert.strictEqual(urls.filter((url) => url.startsWith("/api/aqi")).length, 2, "clearCache re-enables it");
  } finally {
    globalThis.fetch = original;
    globalThis.window = originalWindow;
    Api.clearCache();
  }
});
