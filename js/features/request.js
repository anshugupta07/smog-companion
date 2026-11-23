/**
 * Small helpers shared by the feature modules.
 */

/** Distance before the viewport at which lazy sections start loading. */
const NEAR_VIEWPORT_MARGIN = "300px";

/**
 * Creates a guard against out-of-order responses: call the returned function before awaiting,
 * then check the function it returns afterwards. Only the newest request stays "current".
 * @returns {() => () => boolean}
 */
export function createRequestGuard() {
  let latest = 0;
  return () => {
    latest += 1;
    const mine = latest;
    return () => mine === latest;
  };
}

/**
 * Runs a callback once a node is near the viewport (or at once where IntersectionObserver is missing).
 * @param {Window & typeof globalThis} windowObject
 * @param {Element} node
 * @param {() => void} callback
 * @returns {void}
 */
export function runWhenNearViewport(windowObject, node, callback) {
  if (!("IntersectionObserver" in windowObject)) {
    callback();
    return;
  }
  const observer = new windowObject.IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }
      observer.disconnect();
      callback();
    },
    { rootMargin: NEAR_VIEWPORT_MARGIN },
  );
  observer.observe(node);
}
