"use strict";
import { test } from "node:test";
import assert from "node:assert";
import { validateEndpoint, askAI } from "../lib/ai.js";

test("validateEndpoint accepts only clean https URLs", () => {
  assert.ok(validateEndpoint("https://api.example.com/v1/chat"));
  for (const bad of [
    "http://api.example.com",
    "javascript:alert(1)",
    "https://user:pw@example.com",
    "not a url",
    "",
    undefined,
  ]) {
    assert.ok(!validateEndpoint(bad), String(bad));
  }
});

test("askAI returns text and sends auth header (mocked fetch)", async () => {
  let seen;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "  Stay inside.  " } }],
      }),
    };
  };
  const out = await askAI({
    endpoint: "https://x.test/v1",
    apiKey: "k",
    model: "m",
    prompt: "p",
    fetchImpl,
  });
  assert.strictEqual(out, "Stay inside.");
  assert.strictEqual(seen.opts.headers.Authorization, "Bearer k");
  assert.strictEqual(seen.opts.credentials, "omit");
  const body = JSON.parse(seen.opts.body);
  assert.strictEqual(body.model, "m");
  assert.strictEqual(body.max_tokens, 500);
});

test("askAI falls back to a default model and sanitises the model name", async () => {
  let body;
  const fetchImpl = async (url, opts) => {
    body = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    };
  };
  await askAI({
    endpoint: "https://x.test",
    apiKey: "k",
    prompt: "p",
    fetchImpl,
  });
  assert.strictEqual(body.model, "gpt-4o-mini");
  await askAI({
    endpoint: "https://x.test",
    apiKey: "k",
    model: "<x>",
    prompt: "p",
    fetchImpl,
  });
  assert.ok(!body.model.includes("<"));
});

test("askAI surfaces HTTP errors, empty answers and bad endpoints", async () => {
  const bad = async () => ({ ok: false, status: 429 });
  const empty = async () => ({ ok: true, json: async () => ({ choices: [] }) });
  await assert.rejects(
    askAI({
      endpoint: "https://x.test",
      apiKey: "k",
      prompt: "p",
      fetchImpl: bad,
    }),
    /429/,
  );
  await assert.rejects(
    askAI({
      endpoint: "https://x.test",
      apiKey: "k",
      prompt: "p",
      fetchImpl: empty,
    }),
    /empty/,
  );
  await assert.rejects(
    askAI({ endpoint: "http://x.test", apiKey: "k", prompt: "p" }),
    /https/,
  );
});

test("askAI aborts a request that takes too long", async () => {
  const hang = (url, opts) =>
    new Promise((resolve, reject) =>
      opts.signal.addEventListener("abort", () => reject(new Error("aborted"))),
    );
  await assert.rejects(
    askAI({
      endpoint: "https://x.test",
      apiKey: "k",
      prompt: "p",
      fetchImpl: hang,
      timeoutMs: 10,
    }),
    /aborted/,
  );
});
