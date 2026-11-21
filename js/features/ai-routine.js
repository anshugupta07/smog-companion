const AI_TIMEOUT_MS = 30000;

/** Initializes the optional AI routine request.
 * @param {AppDependencies} deps
 * @returns {void}
 */
export function initAiRoutine(deps) {
  const { document: doc, UI, state, fetchImpl } = deps;
  const output = doc.getElementById("ai-out");
  const ask = doc.getElementById("ask");
  ask.addEventListener("click", async () => {
    output.replaceChildren();
    if (!state.plan) {
      output.append(UI.el("p", "Build your plan first.", "error"));
      return;
    }
    UI.setBusy(ask, true);
    output.append(UI.el("p", "Writing your routine..."));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const response = await fetchImpl("/api/routine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: state.plan.profile }),
        credentials: "same-origin",
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.text !== "string") {
        throw new Error(data.error || `status ${response.status}`);
      }
      output.replaceChildren(
        UI.el("h3", "AI routine"),
        UI.el("pre", data.text),
      );
    } catch (error) {
      output.replaceChildren(
        UI.el(
          "p",
          `AI is not available here (${error.message}). The routine above still applies.`,
          "error",
        ),
      );
    } finally {
      clearTimeout(timer);
      UI.setBusy(ask, false);
    }
  });
}
