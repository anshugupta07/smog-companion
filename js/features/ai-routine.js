import { AI_TIMEOUT_MS } from "../constants.js";
import { MESSAGES } from "../content/messages.js";
import { ApiError } from "../errors.js";
import { errorMessage } from "./place-search.js";

const AI_ROUTE = "/api/routine";

/**
 * Asks the server-side proxy for an AI-written routine.
 * @param {typeof fetch} fetchImpl
 * @param {Profile} profile
 * @returns {Promise<string>}
 * @throws {ApiError} When the server says no or answers with something unexpected.
 */
export async function requestRoutine(fetchImpl, profile) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await fetchImpl(AI_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
      credentials: "same-origin",
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.text !== "string") {
      throw new ApiError(data.error || `status ${response.status}`, response.status);
    }
    return data.text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Initializes the optional AI routine button.
 * @param {AppDependencies} deps
 * @returns {void}
 */
export function initAiRoutine({ $, UI, state, fetchImpl }) {
  const output = $("ai-out");
  const ask = $("ask", "button");
  ask.addEventListener("click", async () => {
    output.replaceChildren();
    if (!state.plan) {
      output.append(UI.el("p", MESSAGES.buildPlanFirst, "error"));
      return;
    }
    UI.setBusy(ask, true);
    output.append(UI.el("p", MESSAGES.aiWriting));
    try {
      const text = await requestRoutine(fetchImpl, state.plan.profile);
      output.replaceChildren(UI.el("h3", MESSAGES.aiTitle), UI.el("pre", text));
    } catch (error) {
      output.replaceChildren(UI.el("p", MESSAGES.aiUnavailable(errorMessage(error)), "error"));
    } finally {
      UI.setBusy(ask, false);
    }
  });
}
