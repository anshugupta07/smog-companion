/**
 * Server-side AI adapter for any OpenAI-compatible chat endpoint.
 * Lives outside the public folders on purpose: the API key and this code never reach the browser.
 */
import { sanitizeText } from "../js/app.js";
import { ApiError, ValidationError } from "./errors.js";

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_TOKENS = 500;
const DEFAULT_TIMEOUT_MS = 20000;

/** Accepts only plain https URLs without embedded credentials. */
function validateEndpoint(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}

/**
 * Sends one prompt and returns the model's text.
 * @param {{endpoint:string, apiKey:string, model?:string, prompt:string, fetchImpl?:Function, timeoutMs?:number}} options
 * @returns {Promise<string>}
 */
async function askAI({
  endpoint,
  apiKey,
  model,
  prompt,
  fetchImpl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!validateEndpoint(endpoint)) {
    throw new ValidationError("Endpoint must be a valid https:// URL.");
  }
  const doFetch = fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: sanitizeText(model, 80) || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
      credentials: "omit",
    });
    if (!res.ok) {
      throw new ApiError(
        `AI service returned status ${res.status}.`,
        res.status,
      );
    }
    const data = await res.json();
    const text =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new ApiError("AI service returned an empty answer.");
    }
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

export { validateEndpoint, askAI };
