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

  function setDemoEvaluationScores(root) {
    const scores = Object.freeze({
      overall: 100,
      'code-quality': 100,
      security: 100,
      efficiency: 100,
      testing: 100,
      accessibility: 100,
      'problem-statement-alignment': 100,
    });

    Object.entries(scores).forEach(([category, score]) => {
      const value = root.querySelector(`[data-score="${category}"]`);
      if (value) value.textContent = String(score);
    });

    root.querySelectorAll('.evaluation-progress').forEach((bar) => {
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.setAttribute('aria-valuenow', '100');
      const fill = bar.querySelector('span');
      if (fill) fill.style.width = '100%';
    });
  }

  return { el, replaceWith, setStatus, setBusy, setDemoEvaluationScores };
});
