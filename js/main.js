/**
 * Smog Companion - page wiring. Connects the DOM to the pure modules:
 * SmogAssistant (logic), SmogAirApi (live data), SmogViews (rendering) and SmogUI (helpers).
 */
(function () {
  'use strict';

  const Core = window.SmogAssistant;
  const Api = window.SmogAirApi;
  const UI = window.SmogUI;
  const Views = window.SmogViews;
  if (!Core || !Api || !UI || !Views) return;

  const $ = (id) => document.getElementById(id);
  const { el } = UI;
  const WORLD_PLACES = window.SmogData.WORLD;
  const AI_TIMEOUT_MS = 30000;
  const LOCATION_PRECISION = 100; // round to 0.01 degrees, about 1 km, for privacy

  /** Shared page state. Nothing here is ever stored or sent anywhere except Open-Meteo and /api/routine. */
  const state = { place: null, plan: null };

  /**
   * Guards against out-of-order responses: call `startRequest()` before awaiting,
   * then check the returned function afterwards. Only the newest request stays "current".
   */
  function createRequestGuard() {
    let latest = 0;
    return function startRequest() {
      const mine = ++latest;
      return () => mine === latest;
    };
  }

  const runWhenNearViewport = (node, callback) => {
    if (!('IntersectionObserver' in window)) {
      callback();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      callback();
    }, { rootMargin: '300px' });
    observer.observe(node);
  };

  // ---- Hero: haze slider --------------------------------------------------
  function initHaze() {
    const update = () => {
      const value = Core.parseAqi($('hazeRange').value) || 0;
      const band = Core.aqiCategory(value);
      $('scene').style.setProperty('--haze', String(Math.min(0.92, 0.08 + (value / 500) * 0.85)));
      $('hazeVal').textContent = String(value);
      $('hazeName').textContent = band.name;
      $('hazeAdvice').textContent = band.advice;
    };
    $('hazeRange').addEventListener('input', update);
    update();
  }

  // ---- Planner: place search and live AQI --------------------------------
  const plannerStatus = (message, isError) => UI.setStatus($('aqi-status'), message, isError);

  /** Loads live air quality for a place and fills the planner's AQI field. Resolves to the reading or null. */
  async function choosePlace(place) {
    state.place = place;
    $('place').value = Views.placeLabel(place);
    $('place-results').replaceChildren();
    plannerStatus(`Loading live air quality for ${Views.placeLabel(place)}...`);
    try {
      const reading = await Api.fetchAqi(place.lat, place.lon);
      $('aqi').value = String(reading.aqi);
      const pm = reading.pm25 !== null ? `, PM2.5 ${reading.pm25} µg/m³` : '';
      plannerStatus(`Live US AQI ${reading.aqi} for ${Views.placeLabel(place)}${pm}, updated ${reading.time}. Source: Open-Meteo.`);
      return reading;
    } catch (err) {
      plannerStatus(`Could not load live air quality (${err.message}) Type your AQI instead.`, true);
      return null;
    }
  }

  function initPlaceSearch() {
    const startRequest = createRequestGuard();

    async function findPlaces() {
      const list = $('place-results');
      const isCurrent = startRequest();
      list.replaceChildren();
      plannerStatus('Searching...');
      try {
        const found = await Api.geocode($('place').value);
        if (!isCurrent()) return;
        if (!found.length) {
          plannerStatus('No places found. Try another spelling or a larger nearby city.', true);
          return;
        }
        list.replaceChildren(...found.map((place) => Views.placeOption(place, choosePlace)));
        plannerStatus(`${found.length} places found. Choose yours.`);
      } catch (err) {
        if (isCurrent()) plannerStatus(`Search failed: ${err.message}`, true);
      }
    }

    $('find').addEventListener('click', findPlaces);
    $('place').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      findPlaces();
    });

    $('geo').addEventListener('click', () => {
      if (!navigator.geolocation) {
        plannerStatus('Your browser cannot share location. Search for a place instead.', true);
        return;
      }
      plannerStatus('Waiting for your location...');
      const round = (n) => Math.round(n * LOCATION_PRECISION) / LOCATION_PRECISION;
      navigator.geolocation.getCurrentPosition(
        (pos) => choosePlace({ name: 'Your location', region: '', country: '', lat: round(pos.coords.latitude), lon: round(pos.coords.longitude) }),
        () => plannerStatus('Location was not shared. Search for a place instead.', true),
        { timeout: 10000, maximumAge: 600000 },
      );
    });
  }

  // ---- World board ----------------------------------------------------------
  function initWorld() {
    const body = $('world-body');
    const status = $('world-status');
    const refresh = $('refresh');

    const applyFilter = () => {
      const query = $('filter').value.trim().toLowerCase();
      Array.from(body.rows).forEach((row) => { row.hidden = query !== '' && !row.dataset.k.includes(query); });
    };

    const usePlace = (place) => {
      choosePlace(place);
      $('planner').scrollIntoView();
      $('place').focus();
    };

    async function load() {
      UI.setBusy(refresh, true);
      status.textContent = 'Loading live data...';
      status.className = 'hint';
      try {
        const readings = (await Api.fetchAqiMany(WORLD_PLACES))
          .filter((place) => place.reading)
          .sort((a, b) => b.reading.aqi - a.reading.aqi);
        body.replaceChildren(...readings.map((place) => Views.worldRow(place, Core.aqiCategory(place.reading.aqi), usePlace)));
        applyFilter();
        status.textContent = readings.length ? `${readings.length} places, updated ${new Date().toLocaleTimeString()}.` : 'No data returned.';
      } catch (err) {
        status.textContent = `Could not load live data (${err.message})`;
        status.className = 'error';
      } finally {
        UI.setBusy(refresh, false);
      }
    }

    $('filter').addEventListener('input', applyFilter);
    refresh.addEventListener('click', load);
    runWhenNearViewport($('world'), load);
  }

  // ---- Hero search ------------------------------------------------------------
  function initHeroSearch() {
    const results = $('q-results');
    const quick = $('quick');
    const startRequest = createRequestGuard();
    const showQuick = (...nodes) => { quick.replaceChildren(...nodes); quick.hidden = false; };

    async function showReading(place) {
      results.replaceChildren();
      showQuick(el('p', 'Loading live air quality...'));
      const reading = await choosePlace(place);
      if (!reading) {
        showQuick(el('p', 'Could not load live air quality for this place. Try again or type your AQI in the planner.', 'error'));
        return;
      }
      const band = Core.aqiCategory(reading.aqi);
      quick.style.setProperty('--c', Views.BAND_COLORS[band.level]);
      showQuick(...Views.quickCard(place, reading, band));
    }

    $('hero-search').addEventListener('submit', async (event) => {
      event.preventDefault();
      const isCurrent = startRequest();
      results.replaceChildren();
      showQuick(el('p', 'Searching...'));
      try {
        const found = await Api.geocode($('q').value);
        if (!isCurrent()) return;
        if (!found.length) {
          showQuick(el('p', 'No places found. Try another spelling or a larger nearby city.', 'error'));
          return;
        }
        quick.hidden = true;
        results.replaceChildren(...found.map((place) => Views.placeOption(place, showReading)));
      } catch (err) {
        if (isCurrent()) showQuick(el('p', `Search failed: ${err.message}`, 'error'));
      }
    });
  }

  // ---- Planner: build the plan ---------------------------------------------------
  const readProfile = () => ({
    city: 'other',
    cityName: state.place ? Views.placeLabel(state.place) : $('place').value,
    aqi: $('aqi').value,
    children: $('children').checked,
    elderly: $('elderly').checked,
    respiratory: $('respiratory').checked,
    pregnant: $('pregnant').checked,
    commute: $('commute').value,
    cooking: $('cooking').value,
    heating: $('heating').value,
    purifier: $('purifier').value,
  });

  /** Returns an error message for an unusable AQI entry, or '' when it is empty or valid. */
  function aqiError(raw) {
    if (raw === '') return '';
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 500 ? '' : 'Enter an AQI from 0 to 500.';
  }

  function renderPlan(plan) {
    $('plan').replaceChildren(...Views.planView(plan));
    $('routine').replaceChildren(...Views.routineView(Core.buildRoutine(plan)));
    $('ai-section').hidden = false;
    $('plan-status').textContent = `Plan ready: ${plan.actions.length} actions for AQI ${plan.profile.aqi}, ${plan.band.name}.`;
    $('plan-heading').focus();
  }

  function initPlanner() {
    const aqiInput = $('aqi');
    aqiInput.addEventListener('input', () => aqiInput.setCustomValidity(''));
    $('profile-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const message = aqiError(aqiInput.value.trim());
      aqiInput.setCustomValidity(message);
      if (message) {
        aqiInput.reportValidity();
        return;
      }
      state.plan = Core.buildPlan(readProfile());
      renderPlan(state.plan);
    });
  }

  // ---- Optional AI routine (server-side proxy) ---------------------------------------
  function initAiRoutine() {
    const out = $('ai-out');
    const ask = $('ask');
    ask.addEventListener('click', async () => {
      out.replaceChildren();
      if (!state.plan) {
        out.append(el('p', 'Build your plan first.', 'error'));
        return;
      }
      UI.setBusy(ask, true);
      out.append(el('p', 'Writing your routine...'));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
      try {
        const res = await fetch('/api/routine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: state.plan.profile }),
          credentials: 'same-origin',
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || typeof data.text !== 'string') throw new Error(data.error || `status ${res.status}`);
        out.replaceChildren(el('h3', 'AI routine'), el('pre', data.text));
      } catch (err) {
        out.replaceChildren(el('p', `AI is not available here (${err.message}). The routine above still applies.`, 'error'));
      } finally {
        clearTimeout(timer);
        UI.setBusy(ask, false);
      }
    });
  }

  initHaze();
  initPlaceSearch();
  initWorld();
  initHeroSearch();
  initPlanner();
  initAiRoutine();
})();
