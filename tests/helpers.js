'use strict';
// Shared test helpers (not a test file): mocked network responses and a jsdom page loader.
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const reading = { current: { us_aqi: 210, pm2_5: 120, pm10: 180, time: '2026-11-18T10:00' } };

/** Default fake network: one geocoding hit, a reading per requested place, AI not configured. */
function fakeFetch(url) {
  if (url.includes('geocoding-api')) {
    return json({ results: [{ name: 'Pune', admin1: 'Maharashtra', country: 'India', latitude: 18.52, longitude: 73.86 }] });
  }
  if (url.includes('air-quality-api')) {
    const count = url.match(/latitude=([^&]*)/)[1].split(',').length;
    if (count === 1) return json(reading);
    return json(Array.from({ length: count }, (_, i) => ({ current: { ...reading.current, us_aqi: 100 + i * 5 } })));
  }
  return json({ error: 'AI is not configured on this server.' }, false, 503);
}

const opened = [];
const closeAll = () => opened.splice(0).forEach((w) => w.close());

/**
 * Loads the real index.html with its real scripts in jsdom.
 * @param {{fetchImpl?:Function, geolocation?:object, settle?:number, setup?:(window:object) => void}} [options]
 */
async function loadPage({ fetchImpl = fakeFetch, geolocation, settle = 150, setup } = {}) {
  const dom = await JSDOM.fromFile(path.join(ROOT, 'index.html'), {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = async (url, opts) => fetchImpl(String(url), opts);
      window.Element.prototype.scrollIntoView = function scrollIntoView() {};
      if (geolocation) Object.defineProperty(window.navigator, 'geolocation', { value: geolocation });
      if (setup) setup(window);
    },
  });
  if (dom.window.document.readyState !== 'complete') await new Promise((resolve) => dom.window.addEventListener('load', resolve));
  await tick(settle);
  opened.push(dom.window);
  return dom.window;
}

const submit = (window, form) => form.dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true }));

module.exports = { ROOT, json, tick, reading, fakeFetch, loadPage, closeAll, submit };
