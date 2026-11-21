/** Creates a request ordering guard.
 * @returns {() => () => boolean}
 */
export function createRequestGuard() {
  let latest = 0;
  return () => {
    const mine = ++latest;
    return () => mine === latest;
  };
}

/** Runs a callback when a node approaches the viewport.
 * @param {Window} windowObject
 * @param {HTMLElement} node
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
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      callback();
    },
    { rootMargin: "300px" },
  );
  observer.observe(node);
}
