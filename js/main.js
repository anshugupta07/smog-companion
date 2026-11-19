(function () {
  'use strict';
  const S = window.SmogAssistant;
  const UI = window.SmogUI;
  if (!S || !UI) return;
  const $ = (id) => document.getElementById(id);
  const COLORS = ['#2e7d32', '#f9a825', '#ef6c00', '#c62828', '#7b1fa2', '#5d1a2b'];
  let lastPlan = null;
  const el = UI.el;

  // Hero haze slider
  function updateHaze() {
    const v = S.parseAqi($('hazeRange').value) || 0;
    const band = S.aqiCategory(v);
    $('scene').style.setProperty('--haze', String(Math.min(0.92, 0.08 + (v / 500) * 0.85)));
    $('hazeVal').textContent = String(v);
    $('hazeName').textContent = band.name;
    $('hazeAdvice').textContent = band.advice;
  }
  $('hazeRange').addEventListener('input', updateHaze);
  updateHaze();

  // Place search, live AQI and world board
  let place = null;
  const label = (p) => [p.name, p.region, p.country].filter(Boolean).join(', ');
  const status = (msg, isErr) => UI.setStatus($('aqi-status'), msg, isErr);

  async function choosePlace(p) {
    place = p; $('place').value = label(p); $('place-results').replaceChildren();
    status(`Loading live air quality for ${label(p)}...`);
    try {
      const r = await S.fetchAqi(p.lat, p.lon);
      $('aqi').value = String(r.aqi);
      status(`Live US AQI ${r.aqi} for ${label(p)}${r.pm25 !== null ? `, PM2.5 ${r.pm25} µg/m³` : ''}, updated ${r.time}. Source: Open-Meteo.`);
      return r;
    } catch (err) { status(`Could not load live air quality (${err.message}) Type your AQI instead.`, true); return null; }
  }

  async function findPlaces() {
    const list = $('place-results'); list.replaceChildren();
    status('Searching...');
    try {
      const found = await S.geocode($('place').value);
      if (!found.length) { status('No places found. Try another spelling or a larger nearby city.', true); return; }
      found.forEach((p) => { const li = el('li'); const b = el('button', label(p)); b.type = 'button'; b.addEventListener('click', () => choosePlace(p)); li.append(b); list.append(li); });
      status(`${found.length} places found. Choose yours.`);
    } catch (err) { status(`Search failed: ${err.message}`, true); }
  }
  $('find').addEventListener('click', findPlaces);
  $('place').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); findPlaces(); } });
  $('geo').addEventListener('click', () => {
    if (!navigator.geolocation) { status('Your browser cannot share location. Search for a place instead.', true); return; }
    status('Waiting for your location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => choosePlace({ name: 'Your location', region: '', country: '', lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 }),
      () => status('Location was not shared. Search for a place instead.', true),
      { timeout: 10000, maximumAge: 600000 });
  });

  function applyFilter() {
    const q = $('filter').value.trim().toLowerCase();
    Array.from($('world-body').rows).forEach((tr) => { tr.hidden = q !== '' && !tr.dataset.k.includes(q); });
  }
  $('filter').addEventListener('input', applyFilter);

  async function loadWorld() {
    const body = $('world-body'), ws = $('world-status'), btn = $('refresh');
    UI.setBusy(btn, true);
    ws.textContent = 'Loading live data...';
    ws.className = 'hint';
    try {
      const rows = (await S.fetchAqiMany(S.WORLD)).filter((r) => r.reading).sort((x, y) => y.reading.aqi - x.reading.aqi);
      body.replaceChildren();
      rows.forEach((r) => {
        const band = S.aqiCategory(r.reading.aqi), tr = el('tr'), dot = el('span', null, 'dot');
        dot.style.setProperty('--c', COLORS[band.level]);
        const lv = el('td'); lv.append(dot, document.createTextNode(band.name));
        const use = el('td'), b = el('button', 'Use'); b.type = 'button'; b.setAttribute('aria-label', `Use ${r.name} for my plan`);
        b.addEventListener('click', () => { choosePlace(r); $('planner').scrollIntoView(); $('place').focus(); }); use.append(b);
        const th = el('th', `${r.name}, ${r.country}`); th.scope = 'row';
        tr.dataset.k = `${r.name} ${r.country}`.toLowerCase();
        tr.append(th, el('td', String(r.reading.aqi), 'n'), lv, el('td', r.reading.pm25 === null ? 'n/a' : String(r.reading.pm25)), use);
        body.append(tr);
      });
      applyFilter();
      ws.textContent = rows.length ? `${rows.length} places, updated ${new Date().toLocaleTimeString()}.` : 'No data returned.';
    } catch (err) { ws.textContent = `Could not load live data (${err.message})`; ws.className = 'error'; }
    finally { UI.setBusy(btn, false); }
  }
  $('refresh').addEventListener('click', loadWorld);
  loadWorld();

  // Hero search bar: find a place and show its live air quality at once
  const qList = $('q-results'), quick = $('quick');
  $('hero-search').addEventListener('submit', async (e) => {
    e.preventDefault(); qList.replaceChildren(); quick.hidden = true;
    quick.replaceChildren(el('p', 'Searching...')); quick.hidden = false;
    try {
      const found = await S.geocode($('q').value);
      if (!found.length) { quick.replaceChildren(el('p', 'No places found. Try another spelling or a larger nearby city.', 'error')); return; }
      quick.hidden = true;
      found.forEach((p) => {
        const li = el('li'), b = el('button', label(p)); b.type = 'button';
        b.addEventListener('click', async () => {
          qList.replaceChildren(); quick.replaceChildren(el('p', 'Loading live air quality...')); quick.hidden = false;
          const r = await choosePlace(p);
          if (!r) { quick.replaceChildren(el('p', 'Could not load live air quality for this place. Try again or type your AQI in the planner.', 'error')); return; }
          const band = S.aqiCategory(r.aqi), link = el('a', 'Build my plan for this place'); link.href = '#planner';
          quick.style.setProperty('--c', COLORS[band.level]);
          quick.replaceChildren(el('p', label(p)), el('p', String(r.aqi), 'aqi'), el('p', band.name), el('p', band.advice), link);
        });
        li.append(b); qList.append(li);
      });
    } catch (err) { quick.replaceChildren(el('p', `Search failed: ${err.message}`, 'error')); }
  });

  const readProfile = () => ({
    city: 'other', cityName: place ? label(place) : $('place').value, aqi: $('aqi').value,
    children: $('children').checked, elderly: $('elderly').checked, respiratory: $('respiratory').checked, pregnant: $('pregnant').checked,
    commute: $('commute').value, cooking: $('cooking').value, heating: $('heating').value, purifier: $('purifier').value,
  });

  function render(plan) {
    const root = $('plan');
    root.replaceChildren();
    const top = el('div', null, 'panel band');
    top.style.setProperty('--bandc', COLORS[plan.band.level]);
    top.append(el('p', `${plan.profile.cityName}${plan.profile.aqiIsLive ? '' : ' (typical winter level)'}`),
      el('p', String(plan.profile.aqi), 'aqi'), el('h3', plan.band.name), el('p', plan.band.advice));
    const list = el('div', null, 'panel');
    list.append(el('h3', `${plan.actions.length} actions, most impact first`));
    plan.actions.forEach((a) => {
      const item = el('article', null, 'action');
      const tags = el('p');
      [a.area, `${a.impact} impact`, `${a.effort} effort`].forEach((t) => tags.append(el('span', t, 'tag')));
      const why = el('p', null, 'why');
      why.append(el('strong', 'How this helps'), document.createTextNode(a.why));
      item.append(el('h3', a.title), tags, el('p', a.steps), why);
      list.append(item);
    });
    root.append(top, list);
    renderRoutine(plan);
    $('ai-section').hidden = false;
    $('plan-heading').focus();
  }

  $('profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('aqi');
    const raw = input.value.trim();
    const parsed = raw === '' ? null : S.parseAqi(raw);
    if (raw !== '' && (parsed === null || !Number.isFinite(Number(raw)) || Number(raw) < 0 || Number(raw) > 500)) {
      input.setCustomValidity('Enter an AQI from 0 to 500.');
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    lastPlan = S.buildPlan(readProfile());
    render(lastPlan);
  });

  function renderRoutine(plan) {
    const box = $('routine'); box.replaceChildren();
    S.buildRoutine(plan).forEach((part) => {
      box.append(el('h3', part.when));
      const ul = el('ul'); part.items.forEach((t) => ul.append(el('li', t))); box.append(ul);
    });
  }

  $('ask').addEventListener('click', async () => {
    const out = $('ai-out'), btn = $('ask');
    out.replaceChildren();
    if (!lastPlan) { out.append(el('p', 'Build your plan first.', 'error')); return; }
    UI.setBusy(btn, true);
    out.append(el('p', 'Writing your routine...'));
    try {
      const res = await fetch('/api/routine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: lastPlan.profile }), credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.text !== 'string') throw new Error(data.error || `status ${res.status}`);
      out.replaceChildren(el('h3', 'AI routine'), el('pre', data.text));
    } catch (err) {
      out.replaceChildren(el('p', `AI is not available here (${err.message}). The routine above still applies.`, 'error'));
    } finally {
      UI.setBusy(btn, false);
    }
  });
})();
