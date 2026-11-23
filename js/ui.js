/**
 * Smog Companion - tiny DOM helpers. Text is always set with textContent, never innerHTML.
 */

/**
 * Creates an element with optional safe text and class name.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string|null} [text]
 * @param {string} [className]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null && text !== "") {
    node.textContent = text;
  }
  if (className) {
    node.className = className;
  }
  return node;
}

/**
 * Writes a status message and styles it as a hint or an error.
 * @param {HTMLElement} node
 * @param {string} message
 * @param {boolean} [isError]
 * @returns {void}
 */
export function setStatus(node, message, isError = false) {
  node.textContent = message;
  node.className = isError ? "error" : "hint";
}

/**
 * Disables a button and exposes the busy state to assistive technology.
 * @param {HTMLButtonElement} target
 * @param {boolean} busy
 * @returns {void}
 */
export function setBusy(target, busy) {
  target.disabled = busy;
  if (busy) {
    target.setAttribute("aria-busy", "true");
  } else {
    target.removeAttribute("aria-busy");
  }
}

/**
 * Creates a button of type "button" with a click handler.
 * @param {string} text
 * @param {() => unknown} onClick
 * @param {string} [className]
 * @returns {HTMLButtonElement}
 */
export function button(text, onClick, className) {
  const node = el("button", text, className);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}
