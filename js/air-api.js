/**
 * Smog Companion - live air quality from Open-Meteo (free, no API key).
 * Geocoding, current AQI for one or many places, and a small in-memory TTL cache that
 * also merges duplicate in-flight requests. Every function accepts an optional `fetchImpl`
 * so tests can mock the network; injected fetches are never cached.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./app.js'));
  else root.SmogAirApi = factory(root.SmogAssistant);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  const AQ_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
  const AQ_FIELDS = 'us_aqi,pm2_5,pm10';
  const MIN_QUERY_LENGTH = 2;
  const MAX_RESULTS = 6;
  const REQUEST_TIMEOUT_MS = 10000;
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const CACHE_MAX_ENTRIES = 100;

  const cache = new Map();
  const inFlight = new Map();

  const clearCache = () => cache.clear();
  const validCoord = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const finiteOrNull = (value) => (Number.isFinite(value) ? value : null);

  function resolveFetch(fetchImpl) {
    const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!doFetch) throw new Error('fetch is not available in this environment.');
    return doFetch;
  }

  async function getJsonUncached(url, fetchImpl, timeoutMs) {
    const doFetch = resolveFetch(fetchImpl);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await doFetch(url, { credentials: 'omit', signal: controller ? controller.signal : undefined });
      if (!res.ok) throw new Error(`Data service returned status ${res.status}.`);
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function remember(url, data) {
    cache.set(url, { at: Date.now(), data });
    if (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
  }

  /** GET JSON with a TTL cache and in-flight de-duplication (real fetch only). */
  async function getJson(url, fetchImpl, timeoutMs = REQUEST_TIMEOUT_MS) {
    if (fetchImpl) return getJsonUncached(url, fetchImpl, timeoutMs);

    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
    if (hit) cache.delete(url);
    if (inFlight.has(url)) return inFlight.get(url);

    const request = getJsonUncached(url, null, timeoutMs)
      .then((data) => { remember(url, data); return data; })
      .finally(() => inFlight.delete(url));
    inFlight.set(url, request);
    return request;
  }

  /**
   * Finds places worldwide by name.
   * @returns {Promise<{name:string, region:string, country:string, lat:number, lon:number}[]>}
   */
  async function geocode(query, fetchImpl) {
    const q = Core.sanitizeText(query, 80);
    if (q.length < MIN_QUERY_LENGTH) throw new Error(`Type at least ${MIN_QUERY_LENGTH} letters.`);
    const url = `${GEO_URL}?name=${encodeURIComponent(q)}&count=${MAX_RESULTS}&language=en&format=json`;
    const data = await getJson(url, fetchImpl);
    return (data.results || [])
      .filter((r) => validCoord(r.latitude, r.longitude))
      .map((r) => ({
        name: Core.sanitizeText(r.name, 60),
        region: Core.sanitizeText(r.admin1 || '', 60),
        country: Core.sanitizeText(r.country || '', 60),
        lat: r.latitude,
        lon: r.longitude,
      }));
  }

  function parseCurrent(current) {
    const aqi = Core.parseAqi(current && current.us_aqi);
    if (aqi === null) return null;
    return { aqi, pm25: finiteOrNull(current.pm2_5), pm10: finiteOrNull(current.pm10), time: Core.sanitizeText(current.time, 30) };
  }

  /** Current US AQI, PM2.5 and PM10 for one coordinate. */
  async function fetchAqi(lat, lon, fetchImpl) {
    if (!validCoord(lat, lon)) throw new RangeError('Invalid coordinates.');
    const data = await getJson(`${AQ_URL}?latitude=${lat}&longitude=${lon}&current=${AQ_FIELDS}&timezone=auto`, fetchImpl);
    const reading = parseCurrent(data.current);
    if (!reading) throw new Error('No air quality data for this place.');
    return reading;
  }

  /** One request for many places. Each result carries a `reading`, or null if unavailable. */
  async function fetchAqiMany(places, fetchImpl) {
    const list = places.filter((p) => validCoord(p.lat, p.lon));
    if (!list.length) return [];
    const lats = list.map((p) => p.lat).join(',');
    const lons = list.map((p) => p.lon).join(',');
    const data = await getJson(`${AQ_URL}?latitude=${lats}&longitude=${lons}&current=${AQ_FIELDS}&timezone=auto`, fetchImpl);
    const items = Array.isArray(data) ? data : [data];
    return list.map((place, i) => ({ ...place, reading: parseCurrent(items[i] && items[i].current) }));
  }

  return { validCoord, geocode, fetchAqi, fetchAqiMany, clearCache };
});
