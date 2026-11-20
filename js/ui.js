/**
 * Smog Companion - tiny DOM helpers. Text is always set with textContent, never innerHTML.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SmogUI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Creates an element with optional safe text and class name.
   * @param {string} tag
   * @param {string|null} [text]
   * @param {string} [className]
   */
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null && text !== '') node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  /** Writes a status message and styles it as a hint or an error. */
  function setStatus(node, message, isError = false) {
    node.textContent = message;
    node.className = isError ? 'error' : 'hint';
  }

  /** Disables a button and exposes the busy state to assistive technology. */
  function setBusy(target, busy) {
    target.disabled = busy;
    if (busy) target.setAttribute('aria-busy', 'true');
    else target.removeAttribute('aria-busy');
  }

  /** Creates a button of type "button" with a click handler. */
  function button(text, onClick, className) {
    const node = el('button', text, className);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  return { el, setStatus, setBusy, button };
});
