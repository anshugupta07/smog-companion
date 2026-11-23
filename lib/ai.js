/**
 * Server-side AI adapter for any OpenAI-compatible chat endpoint.
 * Lives outside the public folders on purpose: the API key and this code never reach the browser.
 */
import { sanitizeText } from "../js/app.js";
import { TEXT_LIMIT } from "../js/constants.js";
import { ApiError, ValidationError } from "../js/errors.js";
import { PROVIDER_TIMEOUT_MS } from "./config.js";

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_TOKENS = 500;

/**
 * Accepts only plain https URLs without embedded credentials.
 * @param {unknown} url
 * @returns {boolean}
 */
function validateEndpoint(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

/**
 * Builds the chat-completion request body.
 * @param {string|undefined} model
 * @param {string} prompt
 * @returns {string}
 */
function requestBody(model, prompt) {
  return JSON.stringify({
    model: sanitizeText(model, TEXT_LIMIT.model) || DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });
}

/**
 * Pulls the answer text out of a chat-completion response.
 * @param {{choices?: {message?: {content?: unknown}}[]}|null|undefined} data
 * @returns {string}
 * @throws {ApiError} When the answer is missing or empty.
 */
function extractText(data) {
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new ApiError("AI service returned an empty answer.");
  }
  return text.trim();
}

/**
 * Sends one prompt and returns the model's text.
 * @param {{endpoint:string, apiKey:string, model?:string, prompt:string, fetchImpl?:typeof fetch, timeoutMs?:number}} options
 * @returns {Promise<string>}
 * @throws {ValidationError} When the endpoint is not a safe https URL.
 * @throws {ApiError} When the provider fails or answers with nothing.
 */
async function askAI({ endpoint, apiKey, model, prompt, fetchImpl, timeoutMs = PROVIDER_TIMEOUT_MS.ai }) {
  if (!validateEndpoint(endpoint)) {
    throw new ValidationError("Endpoint must be a valid https:// URL.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (fetchImpl || fetch)(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: requestBody(model, prompt),
      signal: controller.signal,
      credentials: "omit",
    });
    if (!response.ok) {
      throw new ApiError(`AI service returned status ${response.status}.`, response.status);
    }
    return extractText(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

export { validateEndpoint, askAI };
