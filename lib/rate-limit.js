/**
 * Fixed-window rate limiter held in memory.
 * The key table is capped, so a flood of distinct keys cannot grow memory without bound.
 * @param {{windowMs?:number, max?:number, maxKeys?:number, now?:() => number}} [options]
 * @returns {(key:string) => boolean} true when the key is over its limit
 */
function createRateLimiter({
  windowMs = 60000,
  max = 10,
  maxKeys = 5000,
  now = Date.now,
} = {}) {
  const hits = new Map();

  function dropExpired(time) {
    for (const [key, entry] of hits) {
      if (time >= entry.reset) hits.delete(key);
    }
  }

  return function isLimited(key) {
    const time = now();
    dropExpired(time);
    const entry = hits.get(key);
    if (!entry) {
      if (hits.size >= maxKeys) hits.delete(hits.keys().next().value);
      hits.set(key, { count: 1, reset: time + windowMs });
      return false;
    }
    entry.count += 1;
    return entry.count > max;
  };
}

export { createRateLimiter };
