"use strict";
import { test, before, after } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";

let dom;
let Views;
let Core;
before(async () => {
  dom = new JSDOM("<!doctype html><body></body>");
  global.document = dom.window.document;
  Core = await import("../js/app.js");
  Views = await import("../js/views.js");
});
after(() => {
  delete global.document;
  dom.window.close();
});

const text = (node) => node.textContent;

test("placeLabel joins the parts that exist", () => {
  assert.strictEqual(
    Views.placeLabel({ name: "Pune", region: "Maharashtra", country: "India" }),
    "Pune, Maharashtra, India",
  );
  assert.strictEqual(
    Views.placeLabel({ name: "Your location", region: "", country: "" }),
    "Your location",
  );
});

test("placeOption renders a button that reports the chosen place", () => {
  const place = { name: "Pune", region: "", country: "India" };
  let chosen;
  const item = Views.placeOption(place, (p) => {
    chosen = p;
  });
  item.querySelector("button").click();
  assert.strictEqual(chosen, place);
  assert.strictEqual(item.querySelector("button").type, "button");
});

test("worldRow shows name, AQI, level text and an accessible Use button", () => {
  const place = {
    name: "Delhi",
    country: "India",
    reading: { aqi: 320, pm25: null },
  };
  let used;
  const row = Views.worldRow(place, Core.aqiCategory(320), (p) => {
    used = p;
  });
  assert.strictEqual(row.dataset.k, "delhi india");
  assert.match(text(row), /Delhi, India/);
  assert.match(text(row), /Hazardous/);
  assert.match(text(row), /n\/a/);
  const use = row.querySelector("button");
  assert.strictEqual(use.getAttribute("aria-label"), "Use Delhi for my plan");
  use.click();
  assert.strictEqual(used, place);
  assert.strictEqual(row.querySelector("th").scope, "row");
});

test("planView renders a summary and a ranked list of cards, using text only", () => {
  const plan = Core.buildPlan({
    aqi: 260,
    cityName: "<img src=x onerror=alert(1)>",
    children: true,
  });
  const [summary, section] = Views.planView(plan);
  assert.match(text(summary), /260/);
  assert.match(text(summary), /Very unhealthy/);
  const items = section.querySelectorAll("ol.plan-list > li");
  assert.strictEqual(items.length, plan.actions.length);
  assert.strictEqual(summary.querySelector("img"), null);
  const first = items[0];
  assert.strictEqual(
    first.querySelector("h4").textContent,
    plan.actions[0].title,
  );
  assert.match(first.querySelector(".chips").textContent, /High impact/);
  assert.match(
    first.querySelector(".chips").textContent,
    /(Low|Medium|High) effort/,
  );
  assert.match(
    first.querySelector(".action-steps").textContent,
    /^What to do: /,
  );
});

test("plan text from rules is never parsed as markup", () => {
  const [, section] = Views.planView({
    profile: { cityName: "x", aqi: 1, aqiIsLive: true },
    band: { level: 0, name: "Good", advice: "ok" },
    actions: [
      {
        id: "x",
        title: "<b>t</b>",
        why: "<i>w</i>",
        steps: "<u>s</u>",
        area: "<a>",
        impact: "Low",
        effort: "High",
      },
    ],
  });
  assert.strictEqual(section.querySelector("b, i, u, a"), null);
});

test("routineView returns a heading and list for each part of the day", () => {
  const nodes = Views.routineView([
    { when: "Morning", items: ["a", "b"] },
    { when: "Evening", items: ["c"] },
  ]);
  assert.deepStrictEqual(
    nodes.map((n) => n.tagName),
    ["H3", "UL", "H3", "UL"],
  );
  assert.strictEqual(nodes[1].children.length, 2);
});

test("quickCard ends with a link to the planner", () => {
  const nodes = Views.quickCard(
    { name: "Pune", region: "", country: "India" },
    { aqi: 90 },
    Core.aqiCategory(90),
  );
  const link = nodes[nodes.length - 1];
  assert.strictEqual(link.getAttribute("href"), "#planner");
  assert.strictEqual(nodes[1].className, "aqi");
});

test("every AQI band has a colour", () => {
  assert.strictEqual(Views.BAND_COLORS.length, Core.BANDS.length);
});
