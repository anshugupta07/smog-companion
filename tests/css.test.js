// Static checks on the stylesheet: responsive strategy, touch targets and user-preference support.
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("layout is mobile-first with growing breakpoints", () => {
  const mins = [...css.matchAll(/@media \(min-width: ([\d.]+)rem\)/g)].map((m) => Number(m[1]));
  assert.deepStrictEqual(
    mins,
    [...mins].sort((a, b) => a - b),
    "min-width queries should be in ascending order",
  );
  assert.ok(mins.length >= 4, "tablet, laptop and desktop breakpoints");
  assert.ok(css.includes("@media (max-width: 39.99rem)"), "phone-only card layout for the world board");
});

test("touch targets are at least 44px and the page never scrolls sideways", () => {
  assert.match(css, /--tap: 2\.75rem/);
  assert.ok(css.includes("min-height: var(--tap)"));
  assert.ok(css.includes("overflow-x: clip"));
  assert.ok(css.includes("env(safe-area-inset-left)"));
  assert.ok(css.includes("text-size-adjust"));
});

test("user preferences are respected", () => {
  for (const query of ["prefers-reduced-motion: reduce", "forced-colors: active", "hover: hover", "print"]) {
    assert.ok(css.includes(`@media (${query})`) || css.includes(`@media ${query}`), query);
  }
  assert.ok(css.includes(":focus-visible"));
});

test("rendering cost is limited for below-the-fold sections", () => {
  assert.ok(css.includes("content-visibility: auto"));
});

test("no !important outside the hidden attribute fix and the motion/print preferences", () => {
  const uses = css.split("\n").filter((line) => line.includes("!important"));
  uses.forEach((line) =>
    assert.ok(/\[hidden\]|animation: none|transition: none|display: none/.test(line), line.trim()),
  );
});

test("every class used in index.html has a style rule or is a documented hook", () => {
  const hooks = new Set(["results", "row", "wrap"]);
  const used = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
  const missing = [...used].filter((name) => !hooks.has(name) && !css.includes(`.${name}`));
  assert.deepStrictEqual(missing, []);
});

test("the stylesheet has no leftover vendor hacks or dead overrides", () => {
  assert.ok(!css.includes("#planner label"), "planner styles should not be patched by id overrides");
  assert.ok(!/\r/.test(css), "LF line endings");
});

/** Relative luminance of a #rrggbb colour (WCAG 2.x). */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours. */
function contrast(foreground, background) {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

/** Reads a CSS custom property declared on :root. */
function token(name) {
  const match = css.match(new RegExp(`--${name}:\\s*#([0-9a-fA-F]{3,6})\\b`));
  assert.ok(match, `--${name} should be a hex colour`);
  const digits = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
  return `#${digits}`;
}

test("text colour tokens meet WCAG AAA contrast (7:1) on the surfaces they are used on", () => {
  const all = ["bg", "surface", "surface-soft", "brand-soft"];
  const plain = ["bg", "surface", "surface-soft"];
  const used = { ink: all, muted: all, danger: all, brand: all, "brand-2": plain };
  for (const [name, surfaces] of Object.entries(used)) {
    for (const surface of surfaces.map(token)) {
      const ratio = contrast(token(name), surface);
      assert.ok(ratio >= 7, `--${name} on ${surface} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("white text on buttons and chips that use the brand colour meets AAA", () => {
  assert.ok(contrast("#ffffff", token("brand")) >= 7);
});

test("white text on the darkest and lightest hero colours meets AAA", () => {
  for (const hex of ["#10261f", "#1a3b31", "#234a3e"]) {
    assert.ok(css.includes(hex), `${hex} should be part of the hero gradient`);
    assert.ok(contrast("#ffffff", hex) >= 7, hex);
  }
});
