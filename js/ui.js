(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SmogUI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null && text !== '') node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function replaceWith(parent, ...children) {
    parent.replaceChildren(...children);
  }

  function setStatus(node, message, isError = false) {
    node.textContent = message;
    node.className = isError ? 'error' : 'hint';
  }

  function setBusy(button, busy) {
    button.disabled = busy;
    if (busy) button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
  }

  return { el, replaceWith, setStatus, setBusy };
});
