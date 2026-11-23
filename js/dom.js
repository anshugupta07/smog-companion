/**
 * Smog Companion - typed access to elements that must exist in index.html.
 */

/**
 * Creates a lookup bound to one document. It fails fast with a clear message when an element
 * is missing (or is the wrong kind of element) instead of a confusing "null" error later.
 * @param {Document} doc
 * @returns {ElementLookup}
 */
export function createElementLookup(doc) {
  /**
   * @param {string} id
   * @param {string} [tag] Expected tag name in lower case, for example "input".
   * @returns {HTMLElement}
   */
  function lookup(id, tag) {
    const node = doc.getElementById(id);
    if (!node) {
      throw new Error(`Missing element #${id} in index.html`);
    }
    if (tag && node.localName !== tag) {
      throw new Error(`Element #${id} should be <${tag}> but is <${node.localName}>`);
    }
    return node;
  }
  return /** @type {ElementLookup} */ (lookup);
}
