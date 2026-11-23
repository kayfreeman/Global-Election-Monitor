// Electoral Map & Subdivisions — real interactive map (Leaflet + OpenStreetMap/
// keyless Esri/OSM basemap) with real administrative boundaries from geoBoundaries,
// served and cached by our server. Layers: party lead/margin, turnout,
// reporting, incidents, and (Nigeria) LIVE IReV upload progress.
import { state, api, esc, fmt, pct, chip, icon, def, bar, party, statusChip, simBadge, leaderLabel, setCountry, download, ago, isLive, basemap, yearFor, yearsFor, yearSelect, archiveFor } from '../core.js';
import { layout } from './tilemaps.js';

const SIM_LAYERS = [['lead', 'Party lead / margin'], ['turnout', 'Turnout %'], ['reporting', 'Reporting %'], ['incidents', 'Incident overlay'], ['irev', 'LIVE · IReV uploads']];
const LIVE_LAYERS = [['irev', 'LIVE · real results']];
const layers = () => (isLive() ? LIVE_LAYERS : SIM_LAYERS);
const mix = (a, b, t) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, '0')).join(''); };
export function norm(s) { // must match server/geo.js
  let x = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[’'`.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  if (/federal capital|^fct\b/.test(x)) return 'fct';
  x = x.replace(/^the /, '').replace(/ (state|region|province)$/, '');
  return ({ nassarawa: 'nasarawa', 'manawatu wanganui': 'manawatu whanganui', 'akwa lbom': 'akwa ibom' })[x] || x;
}

let leafletReady = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletReady) return leafletReady;
  leafletReady = new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = () => resolve(window.L); s.onerror = () => { leafletReady = null; reject(new Error('Map library could not load (no internet?)')); };
    document.head.appendChild(s);
  });
  return leafletReady;
}

export function mount(el, param) {
  let mapId = param || state.country; let data = null; let items = []; let layer = isLive() ? 'irev' : 'lead'; let liveByKey = new Map(); let sel = null; let insp = null; let disposed = false;
  let arch = null; let office = null; let offices = [];
  let L = null; let map = null; let gj = null; let geoKey = null; let geoInfo = null; let byKey = new Map(); let irev = null; let irevLgas = new Map();

  el.innerHTML = `<div class="flex flex-col min-h-full">
    <div class="bg-white border-b border-slate-200 px-4 py-3 space-y-2">
      <div class="flex flex-wrap items-center gap-2"><span class="lbl w-24">Jurisdiction:</span><span id="mp-jur" class="flex flex-wrap gap-1.5"></span><span class="flex-1"></span><span id="mp-crumbs" class="text-[13px] flex items-center gap-1.5 flex-wrap"></span></div>
      <div class="flex flex-wrap items-center gap-2"><span class="lbl w-24">Level:</span><span id="mp-level" class="flex flex-wrap gap-1.5"></span></div>
      <div class="flex flex-wrap items-center gap-2"><span class="lbl w-24">Layer:</span><span id="mp-layers" class="flex flex-wrap gap-1.5"></span></div>
      <div class="flex flex-wrap items-center gap-3"><span id="mp-year"></span><span id="mp-office" class="flex flex-wrap items-center gap-1.5"></span></div>
    </div>
    <div class="flex-1 grid grid-cols-12 gap-4 p-4">
      <section class="col-span-12 xl:col-span-8 card p-3 flex flex-col">
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <span id="mp-tag" class="font-mono text-[11px] px-2 py-1 rounded border border-slate-300"></span><span id="mp-mode"></span><span id="mp-sim"></span>
          <span class="flex-1"></span>
          <button data-fit class="text-[12px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">${icon('center_focus_strong', 'sm')} Reset view</button>
          <button data-csv class="text-[12px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">${icon('download', 'sm')} Export CSV</button>
          <button data-geojson class="text-[12px] px-2 py-1 rounded border border-sky-300 text-sky-800 bg-sky-50 hover:bg-sky-100">${icon('download', 'sm')} Export GeoJSON</button>
        </div>
        <div id="mp-note" class="text-[12px] mb-2"></div>
        <div class="relative flex-1 min-h-[560px] rounded border border-slate-200 overflow-hidden">
          <div id="mp-map" class="absolute inset-0"></div>
          <div id="mp-tiles" class="absolute inset-0 bg-white hidden items-center justify-center p-3"></div>
          <div id="mp-loading" class="absolute inset-0 bg-white/70 flex items-center justify-center text-sm text-slate-500 font-mono z-[500]">Loading map…</div>
        </div>
        <div id="mp-legend" class="flex flex-wrap items-center gap-4 text-[11.5px] font-mono text-slate-600 pt-2 mt-2"></div>
        <p id="mp-attrib" class="text-[11px] text-slate-400 mt-1"></p>
      </section>
      <aside id="mp-insp" class="col-span-12 xl:col-span-4 card p-4 flex flex-col"></aside>
    </div></div>`;
  const $ = (s) => el.querySelector(s);

  // ---------- which boundaries go with the current node ----------
  function geoFor(n) {
    const c = n.country;
    if (n.level === 0 && isLive() && c === 'GBR') return { adm: 'ADM2', parent: null, filter: null }; // by-elections are council-level
    if (n.level === 0) return { adm: 'ADM1', parent: null, filter: null };
    if (c === 'NGA' && n.level === 1) return { adm: 'ADM1', parent: null, filter: new Set(data.children.map((x) => norm(x.name))) }; // zone → its states
    if ((c === 'NGA' && n.level === 2) || (c !== 'NGA' && n.level === 1 && n.id !== 'NZL.maori')) return { adm: 'ADM2', parent: n.name, filter: null };
    return null; // deeper levels have no public boundaries
  }

  async function load() {
    try {
      const nga = mapId === 'NGA';
      data = await api.get(`/api/node/${encodeURIComponent(mapId)}${nga ? '?grand=1' : ''}`);
      items = nga ? data.grandchildren : data.children;
      byKey = new Map(items.map((t) => [norm(t.name), t]));
      if (data.node.country === 'NGA') await loadIrev();
      const cty = data.node.country;
      const yReq = yearFor(cty); arch = isLive() ? await archiveFor(cty, yReq).catch(() => null) : null;
      if (yearFor(cty) !== yReq) return; // a newer year was picked while loading
      const pool = arch ? arch.contests : state.live.contests.filter((x) => x.country === cty);
      const stateName = cty === 'NGA' && data.node.level === 2 ? data.node.name : null;
      const atLevel = pool.filter((ct) => !ct.level || (stateName ? ct.level === 'lga' && norm(ct.parent) === norm(stateName) : data.node.level <= 1 && ct.level === 'state'));
      offices = [...new Set(atLevel.map((ct) => ct.officeType).filter(Boolean))].sort();
      if (!offices.includes(office)) office = offices.includes('PRES') ? 'PRES' : offices[0] || null;
      liveByKey = new Map();
      for (const ct of atLevel) { if (office && ct.officeType && ct.officeType !== office) continue; const k = norm(ct.area); if (!liveByKey.has(k)) liveByKey.set(k, []); liveByKey.get(k).push(ct); }
      if (insp && insp.geoOnly) { /* live mode: keep the clicked boundary selected across refreshes */ }
      else {
        if (sel && !items.find((t) => t.id === sel)) sel = null;
        if (sel) insp = await api.get(`/api/node/${encodeURIComponent(sel)}`).catch(() => null); else insp = null;
      }
      if (disposed) return;
      const g = geoFor(data.node); const key = g ? `${data.node.country}-${g.adm}-${g.parent || ''}-${data.node.id}` : null;
      if (key !== geoKey) { geoKey = key; await drawGeo(g); } else restyle();
      renderChrome();
    } catch (e) { $('#mp-loading').textContent = e.message; }
  }

  async function loadIrev() {
    irev = null; irevLgas = new Map();
    const n = data.node; const stateName = n.country === 'NGA' && n.level === 2 ? n.name : null;
    const tracked = state.live.irev || [];
    if (stateName) {
      const t = tracked.find((x) => norm(x.state) === norm(stateName));
      if (t) { irev = await api.get(`/api/live/irev/${t.id}`).catch(() => null); if (irev) for (const l of irev.lgas) irevLgas.set(norm(l.name), l); }
    } else irev = { states: new Map(tracked.map((t) => [norm(t.state), t])) };
  }

  async function drawGeo(g) {
    $('#mp-loading').classList.remove('hidden'); $('#mp-loading').classList.add('flex'); $('#mp-loading').textContent = 'Loading boundaries…';
    if (!g) { showTiles(true); $('#mp-loading').classList.add('hidden'); $('#mp-loading').classList.remove('flex'); return; }
    try {
      L = await loadLeaflet();
      const fc = await api.get(`/api/geo/${data.node.country}/${g.adm}${g.parent ? `?parent=${encodeURIComponent(g.parent)}` : ''}`);
      if (disposed) return;
      if (g.filter) fc.features = fc.features.filter((f) => g.filter.has(f.properties.key));
      geoInfo = { adm: g.adm, attribution: fc.attribution, level: fc.level, count: fc.features.length, matched: fc.features.filter((f) => byKey.has(f.properties.key)).length, unmatched: items.filter((t) => !fc.features.some((f) => f.properties.key === norm(t.name))).map((t) => t.name), fc };
      showTiles(false);
      if (!map) {
        map = L.map($('#mp-map'), { doubleClickZoom: false, preferCanvas: true, zoomSnap: 0.25, attributionControl: true });
        const bm = basemap(); if (bm.url) L.tileLayer(bm.url, { maxZoom: bm.maxZoom || 18, subdomains: 'abc', attribution: bm.attribution }).addTo(map);
      }
      if (gj) gj.remove();
      gj = L.geoJSON(fc, {
        style: (f) => style(f),
        onEachFeature: (f, lyr) => {
          lyr.on({
            click: () => clickFeature(f), dblclick: () => drill(f),
            mouseover: (e) => { e.target.setStyle({ weight: 2.5, color: '#0284c7' }); hover(f); },
            mouseout: (e) => gj.resetStyle(e.target),
          });
          lyr.bindTooltip(() => tipText(f), { sticky: true, direction: 'top', opacity: 0.95 });
        },
      }).addTo(map);
      if (fc.features.length) map.fitBounds(gj.getBounds(), { padding: [12, 12] });
      setTimeout(() => map.invalidateSize(), 50);
    } catch (e) {
      showTiles(true, `Real map unavailable: ${e.message}. Showing tile layout instead.`);
    } finally { $('#mp-loading').classList.add('hidden'); $('#mp-loading').classList.remove('flex'); }
  }

  const itemFor = (f) => byKey.get(f.properties.key);
  // leading/elected candidate of the most significant, most recent live contest in an area
  function liveTop(cs) { const c = cs.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || (a.officeLevel || 999) - (b.officeLevel || 999))[0]; const tv = c.choices.reduce((a, x) => a + x.votes, 0); return tv ? (c.choices.find((x) => x.elected) || c.choices[0]) : null; }
  function fillFor(t, f) {
    if (layer === 'irev') {
      const cs = liveByKey.get(f.properties.key);
      if (cs || data.node.country !== 'NGA') { if (!cs) return '#e2e8f0'; const w = liveTop(cs); return w ? mix('#ffffff', party(data.node.country, w.partyCode).color, 0.8) : '#94a3b8'; }
      const lg = irevLgas.get(f.properties.key); const st = irev && irev.states ? irev.states.get(f.properties.key) : null;
      const p = lg ? (lg.total ? lg.uploaded / lg.total : null) : st ? st.pct : null;
      return p == null ? '#e2e8f0' : mix('#fee2e2', '#15803d', (p - 0.5) / 0.5);
    }
    if (!t) return '#e2e8f0';
    if (layer === 'lead') { if (!t.leader) return '#e2e8f0'; if (t.marginPct < 0.01) return '#fbbf24'; return mix('#ffffff', party(t.country, t.leader).color, 0.45 + Math.min(1, t.marginPct / 0.2) * 0.55); }
    if (layer === 'turnout') return t.reported ? mix('#e0f2fe', '#075985', (t.turnout - 0.15) / 0.8) : '#f1f5f9';
    if (layer === 'reporting') return t.pct ? mix('#dcfce7', '#15803d', t.pct) : '#f1f5f9';
    return t.disputed ? mix('#fee2e2', '#b91c1c', t.disputed / 3) : '#f1f5f9';
  }
  function style(f) {
    const t = itemFor(f); const selected = t && t.id === sel;
    return { fillColor: fillFor(t, f), fillOpacity: 0.78, color: selected ? '#0284c7' : t && t.status === 'flagged' && layer !== 'irev' ? '#ea580c' : '#ffffff', weight: selected ? 3 : t && t.status === 'flagged' ? 2 : 0.8 };
  }
  function restyle() { if (gj) gj.setStyle(style); }
  function tipText(f) {
    const t = itemFor(f); const lg = irevLgas.get(f.properties.key); const st = irev && irev.states ? irev.states.get(f.properties.key) : null;
    let s = `<b>${esc(f.properties.name)}</b>`;
    const cs = liveByKey.get(f.properties.key);
    if (layer === 'irev' && (data.node.country !== 'NGA' || cs)) s += cs ? `<br>${esc(cs[0].declared ? cs[0].electionTitle : `${cs.length} contest(s) · ${cs[0].title}`)}${liveTop(cs) ? `<br>${esc(liveTop(cs).name)} (${esc(liveTop(cs).party || '')})` : ' — no votes yet'}` : '<br>No live results here';
    else if (layer === 'irev') s += lg ? `<br>IReV: ${fmt(lg.uploaded)}/${fmt(lg.total)} PUs uploaded` : st ? `<br>IReV: ${pct(st.pct, 2)} uploaded — ${esc(st.name)}` : '<br>No tracked IReV election';
    else s += t ? `<br>${pct(t.pct)} reporting${t.leader ? ` · ${t.leader} +${(t.marginPct * 100).toFixed(1)}` : ''} <i>(simulated)</i>` : '<br><i>no data joined (synthetic sub-units)</i>';
    return s;
  }
  function hover(f) { /* tooltip handles hover; keep for future */ }
  async function clickFeature(f) {
    const t = itemFor(f);
    if (t && !isLive()) { sel = t.id; insp = await api.get(`/api/node/${encodeURIComponent(sel)}`); } else { sel = t ? t.id : null; insp = { geoOnly: f }; }
    restyle(); renderInsp();
  }
  function drill(f) { const t = itemFor(f); if (!t || t.leaf) return; if (isLive() && !(t.country === 'NGA' && t.level === 2)) return; location.hash = `#/map/${encodeURIComponent(t.id)}`; }

  // fallback tile cartogram for levels with no public boundaries
  function showTiles(on, msg) {
    $('#mp-tiles').classList.toggle('hidden', !on); $('#mp-tiles').classList.toggle('flex', on);
    if (!on) return;
    const n = data.node; const { pts, cols, rows } = layout(n.country, items, n.level === 0);
    const named = n.level !== 0; const tw = named ? 118 : 58, th = 58, g = 5;
    $('#mp-tiles').innerHTML = `<div class="w-full h-full flex flex-col"><div class="text-[12px] text-slate-500 mb-2">${esc(msg || `No public boundary data exists at ${n.childLevelName || 'this'} level — showing a tile layout.`)}</div>
      <svg viewBox="0 0 ${cols * (tw + g)} ${rows * (th + g)}" class="w-full flex-1">${pts.map(({ item: t, x, y }) => `<g class="tile ${t.id === sel ? 'sel' : ''}" data-tile="${esc(t.id)}" transform="translate(${x * (tw + g)},${y * (th + g)})"><rect width="${tw}" height="${th}" rx="4" fill="${fillFor(t, { properties: { key: norm(t.name) } })}" stroke="#fff"/><text x="${tw / 2}" y="${th / 2}" text-anchor="middle" font-size="11" font-weight="700" fill="#0f172a">${esc(named ? (t.name.length > 13 ? t.name.slice(0, 12) + '…' : t.name) : t.code)}</text><text x="${tw / 2}" y="${th / 2 + 14}" text-anchor="middle" font-size="9.5" fill="#334155">${pct(t.pct, 0)}</text></g>`).join('')}</svg></div>`;
  }

  // ---------- chrome: header, legend, inspector ----------
  function renderChrome() {
    const n = data.node; const c = n.country; const d = def(c);
    $('#mp-jur').innerHTML = state.meta.order.map((k) => `<button data-jur="${k}" class="text-[11.5px] font-mono px-2.5 py-1 rounded border ${k === c ? 'bg-sky-700 text-white border-sky-700' : 'border-slate-300 hover:bg-slate-50'}">${k} (${esc(def(k).authorityShort)})</button>`).join('');
    const lvl = items[0] ? items[0].levelName : '';
    $('#mp-level').innerHTML = d.levels.slice(1).map((l) => `<span class="text-[11.5px] font-mono uppercase px-2.5 py-1 rounded border ${l === lvl ? 'bg-sky-700 text-white border-sky-700' : 'border-slate-200 text-slate-400'}">${esc(l)}</span>`).join('');
    $('#mp-layers').innerHTML = layers().filter(([k]) => k !== 'irev' || c === 'NGA' || isLive()).map(([k, l]) => `<button data-layer="${k}" class="text-[11.5px] font-mono uppercase tracking-wide px-3 py-1 rounded border ${k === layer ? (k === 'irev' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-green-700 text-white border-green-700') : 'border-slate-300 hover:bg-slate-50'}">${l}</button>`).join('');
    if (isLive()) {
      yearsFor(c).then((ys) => { const b = $('#mp-year'); if (b && !b.contains(document.activeElement)) b.innerHTML = yearSelect(c, ys); });
      const ON = { PRES: 'Presidential', GOV: 'Governorship' };
      $('#mp-office').innerHTML = offices.length > 1 ? `<span class="lbl">Colour by:</span>${offices.map((o) => `<button data-office="${o}" class="text-[11.5px] font-mono uppercase px-2.5 py-1 rounded border ${o === office ? 'bg-sky-700 text-white border-sky-700' : 'border-slate-300 hover:bg-slate-50'}">${ON[o] || o}</button>`).join('')}` : '';
    } else { $('#mp-year').innerHTML = ''; $('#mp-office').innerHTML = ''; }
    $('#mp-crumbs').innerHTML = `${icon('public', 'sm text-sky-700')}` + data.ancestors.concat([{ id: n.id, name: n.name }]).map((a, i, arr) => i === arr.length - 1 ? `<b>${esc(a.name)}</b>` : `<a data-mapto="${esc(a.id)}" class="text-sky-700 cursor-pointer hover:underline">${esc(a.name)}</a><span class="text-slate-300">/</span>`).join('');
    $('#mp-tag').innerHTML = `● ${esc(n.id)} → ${esc((lvl || '').toUpperCase())}${geoInfo && geoKey ? ` · ${esc(geoInfo.level || geoInfo.adm)} BOUNDARIES` : ''}`;
    $('#mp-mode').innerHTML = chip(`Mode: ${(layers().find((x) => x[0] === layer) || layers()[0])[1]}`, layer === 'irev' ? 'green' : 'blue');
    $('#mp-sim').innerHTML = layer === 'irev' || isLive() ? chip('Real data', 'green') : simBadge();
    // join/notes
    let note = '';
    if (layer === 'irev' && c !== 'NGA') note = liveByKey.size ? `<span class="text-emerald-700">Live: areas with real results from ${esc((state.summary[c]?.live?.source) || 'live sources')} are coloured by the leading/elected party. ${[...liveByKey.keys()].filter((k) => !(geoInfo?.fc?.features || []).some((f) => f.properties.key === k)).length ? 'Some contests have no matching boundary at this level.' : ''}</span>` : `<span class="text-slate-500">No live results with a mappable area for ${esc(d.name)} right now. ${esc(state.summary[c]?.live?.detail || '')}</span>`;
    else if (layer === 'irev' && liveByKey.size) { const f0 = [...liveByKey.values()][0][0]; note = `<span class="text-emerald-700">${esc(f0.declared ? f0.electionTitle.replace(/ — .*$/, '') : 'Results')} — ${data.node.level === 2 ? 'LGAs' : 'states'} coloured by the declared winner (INEC declared results${f0.check === 'single-source' ? ', single source' : ''}).${irev && irev.states && irev.states.size ? ' IReV upload progress shows in the inspector.' : ''}</span>`; }
    else if (layer === 'irev') note = c !== 'NGA' ? '' : irev && irev.lgas ? `<span class="text-emerald-700">Live: LGA polygons coloured by share of polling-unit result sheets uploaded to IReV for <b>${esc(irev.name)}</b>.</span>` : irev && irev.states && irev.states.size ? `<span class="text-emerald-700">Live: states with a tracked IReV election are coloured by upload progress. Double-click one to see its LGAs.</span>` : '<span class="text-slate-500">No tracked IReV election in this area.</span>';
    else if (geoInfo && geoKey && geoInfo.matched < Math.min(items.length, geoInfo.count)) note = `<span class="text-amber-700">${icon('info', 'sm')} ${geoInfo.matched} of ${items.length} ${esc(lvl.toLowerCase())}s joined to real boundaries. Sub-units below state level are synthetic placeholders, so most real boundaries here show without data until real rosters are loaded${n.id === 'NGA.SW.LA' ? ' (Lagos LGAs are real and join)' : ''}.</span>`;
    $('#mp-note').innerHTML = note;
    $('#mp-attrib').innerHTML = geoInfo && geoKey ? `${esc(geoInfo.attribution)} · Basemap: ${esc(basemap().name)} · Scroll to zoom, drag to pan, click to inspect, double-click to drill in.` : '';
    $('#mp-legend').innerHTML = layer === 'lead'
      ? d.parties.slice(0, 6).map((p) => `<span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm" style="background:${p.color}"></span>${esc(p.code)}</span>`).join('') + `<span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-amber-400"></span>Toss-up (&lt;1 pt)</span><span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-slate-200"></span>No data</span><span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm border-2 border-orange-600"></span>Active flag</span>`
      : layer === 'turnout' ? `<span>Low</span><span class="w-40 h-3 rounded-sm" style="background:linear-gradient(90deg,#e0f2fe,#075985)"></span><span>High turnout</span>`
      : layer === 'reporting' ? `<span>0%</span><span class="w-40 h-3 rounded-sm" style="background:linear-gradient(90deg,#dcfce7,#15803d)"></span><span>100% reporting</span>`
      : layer === 'irev' ? `<span>≤50%</span><span class="w-40 h-3 rounded-sm" style="background:linear-gradient(90deg,#fee2e2,#15803d)"></span><span>100% of result sheets uploaded</span><span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-slate-200"></span>Not tracked</span>`
      : `<span>None</span><span class="w-40 h-3 rounded-sm" style="background:linear-gradient(90deg,#fee2e2,#b91c1c)"></span><span>Units held for review</span>`;
    renderInsp();
  }

  let lastInsp = '';
  function renderInsp() {
    // only touch the DOM when the content changed, so periodic refreshes keep the scroll position
    const real = $('#mp-insp'); const box = { set innerHTML(h) { if (h !== lastInsp || real.innerHTML === '') { real.innerHTML = h; lastInsp = h; } } };
    if (insp && insp.geoOnly) {
      const f = insp.geoOnly; const lg = irevLgas.get(f.properties.key); const cs = liveByKey.get(f.properties.key);
      if (cs && cs.length) {
        const stI = irev && irev.states ? irev.states.get(f.properties.key) : null;
        const irevBlock = lg ? `<div class="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-[12.5px]">${chip('IReV', 'green')} ${fmt(lg.uploaded)} of ${fmt(lg.total)} polling-unit result sheets uploaded</div>`
          : stI ? `<div class="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-[12.5px]">${chip('IReV', 'green')} ${esc(stI.name)}: ${pct(stI.pct, 1)} of result sheets uploaded (${fmt(stI.uploaded)}/${fmt(stI.expected)})</div>` : '';
        box.innerHTML = `<span class="lbl text-sky-700">Results · ${yearFor(data.node.country)}</span><h3 class="text-[22px] font-bold mt-1">${esc(f.properties.name)}</h3><div class="mt-1 flex flex-wrap gap-1.5">${chip('Real data', 'green')}${cs[0].declared ? chip('INEC declared', 'green') : ''}</div>${irevBlock}
          <div class="mt-3 space-y-3 overflow-y-auto scroll-thin max-h-[560px] pr-1">${cs.slice(0, 12).map((c) => { const tv = c.choices.reduce((a, x) => a + x.votes, 0); return `<div class="rounded border border-slate-200 p-2">
            <div class="text-[13px] font-semibold">${esc(c.title)}</div><div class="font-mono text-[10.5px] text-slate-500">${esc(c.date)}${c.reportingTotal ? ` · ${fmt(c.reportingDone)}/${fmt(c.reportingTotal)} ${esc(c.reportingLabel || '')}` : ''}${c.test ? ' · TEST' : ''}${tv ? ` · ${fmt(tv)} votes` : ''}</div>
            ${c.choices.slice(0, c.declared ? 6 : 4).map((x) => `<div class="flex items-center gap-2 text-[12.5px] mt-1"><span class="w-2 h-2 rounded-sm" style="background:${party(c.country, x.partyCode).color}"></span><span class="flex-1 truncate">${esc(x.name)} <span class="text-slate-500">${esc(x.party || '')}</span></span>${x.elected ? '<span class="text-green-700 font-mono text-[10.5px]">✓</span>' : ''}<span class="num">${fmt(x.votes)}</span><span class="num text-slate-500 w-11 text-right">${tv ? pct(x.votes / tv) : '—'}</span></div>`).join('')}</div>`; }).join('')}</div>
          ${cs[0].declared && data.node.country === 'NGA' && data.node.level <= 1 && arch && arch.contests.some((x) => x.level === 'lga' && norm(x.parent) === f.properties.key) ? `<p class="text-[12px] text-slate-500 mt-2">Double-click the state for results by LGA.</p>` : ''}
          ${cs[0].url ? `<a href="${esc(cs[0].url)}" target="_blank" rel="noopener" class="text-[11.5px] text-sky-700 mt-2">Source ↗</a>` : ''}
          <a href="#/live/${data.node.country}" class="mt-3 py-2 rounded bg-sky-700 text-white text-center text-[12.5px] font-semibold">OPEN IN RESULTS →</a>`;
        return;
      }
      box.innerHTML = `<span class="lbl text-sky-700">Boundary</span><h3 class="text-[22px] font-bold mt-1">${esc(f.properties.name)}</h3>
        ${lg ? `<div class="mt-2">${chip('IReV live', 'green')}</div><div class="mt-2 num text-[26px] font-semibold text-emerald-700">${lg.total ? pct(lg.uploaded / lg.total) : '…'}</div><div class="text-[12.5px] text-slate-600">${fmt(lg.uploaded)} of ${fmt(lg.total)} polling-unit result sheets uploaded · ${lg.crawled || 0}/${lg.wards.length} wards indexed</div>
          <a href="#/live/NGA" class="mt-3 py-2 rounded bg-sky-700 text-white text-center text-[12.5px] font-semibold">OPEN IN LIVE RESULTS →</a>`
        : isLive() ? `<p class="text-[13px] text-slate-600 mt-2">No live results reported for this area.</p>` : `<p class="text-[13px] text-slate-600 mt-2">Real boundary with no matching data unit. Sub-units at this level are synthetic placeholders until the real roster (e.g. INEC LGA list, US county FIPS) is loaded.</p>`}`;
      return;
    }
    if (!insp) { box.innerHTML = `<p class="text-sm text-slate-500">Click an area on the map to inspect it. ${isLive() ? 'Coloured areas have real results for the selected year. Double-click a Nigerian state to see its LGAs.' : 'Double-click to drill in.'}</p>${!isLive() && geoInfo && geoInfo.unmatched && geoInfo.unmatched.length && geoKey && data.node.level === 0 ? `<p class="text-[11.5px] text-amber-700 mt-3">No boundary for: ${esc(geoInfo.unmatched.join(', '))}</p>` : ''}`; return; }
    const n = insp.node; const c = n.country; const d = def(c);
    box.innerHTML = `<div class="flex items-center justify-between"><span class="lbl text-sky-700">Subdivision inspector</span><span class="font-mono text-[11px] text-slate-500">${esc(n.id)}</span></div>
      <h3 class="text-[22px] font-bold tracking-tight mt-1 leading-tight">${esc(n.name).toUpperCase()}</h3>
      <div class="flex flex-wrap gap-1.5 mt-2">${chip(`${pct(n.pct)} ${d.metricWord}`, 'green')}${chip(`${n.childCount} ${esc((n.childLevelName || '').toLowerCase())}s`, 'blue')}${statusChip(n.status)}${simBadge()}</div>
      <div class="grid grid-cols-3 gap-2 mt-3 p-2 rounded border border-slate-200 bg-slate-50">
        <div><div class="text-[11px] text-slate-500">Total votes</div><div class="num font-semibold">${fmt(n.cast)}</div></div>
        <div><div class="text-[11px] text-slate-500">Turnout</div><div class="num font-semibold text-sky-700">${n.reported ? pct(n.turnout) : '—'}</div></div>
        <div><div class="text-[11px] text-slate-500">Flags</div><div class="num font-semibold ${n.disputed ? 'text-red-600' : ''}">${n.disputed}</div></div></div>
      <div class="mt-2">${(() => { const t = n.valid; return t ? `<div class="flex h-2 rounded-sm overflow-hidden">${d.parties.map((p) => `<div style="width:${n.votes[p.code] / t * 100}%;background:${p.color}"></div>`).join('')}</div>` : ''; })()}</div>
      <div class="lbl mt-4 mb-1.5">${esc(n.childLevelName || '')}s</div>
      <div class="flex-1 overflow-y-auto scroll-thin space-y-1.5 max-h-[420px] pr-1">${insp.children.map((x) => `
        <div class="rounded border p-2 ${x.status === 'flagged' || x.status === 'disputed' ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}">
          <div class="flex items-center gap-2"><span class="font-semibold text-[13px] flex-1 truncate">${esc(x.name)}</span>${leaderLabel(c, x)}<a href="#/drilldown/${encodeURIComponent(x.id)}" class="text-sky-700 font-mono text-[11px]">Drill →</a></div>
          <div class="flex items-center gap-2 mt-1"><div class="flex-1">${bar(x.leaf ? (x.status === 'reported' ? 1 : 0) : x.pct, x.status === 'flagged' ? '#ea580c' : '#0284c7', 'h-1')}</div><span class="font-mono text-[10.5px] text-slate-500 w-10 text-right">${x.leaf ? statusChip(x.status) : pct(x.pct, 0)}</span></div></div>`).join('')}</div>
      <div class="flex gap-2 mt-3">
        ${n.leaf || !n.childCount ? '' : `<button data-mapto="${esc(n.id)}" class="flex-1 py-2 rounded border border-slate-300 text-[12.5px] font-semibold hover:bg-slate-50">${icon('zoom_in_map', 'sm')} Map inside</button>`}
        <a href="#/drilldown/${encodeURIComponent(n.id)}" class="flex-1 py-2 rounded bg-sky-700 text-white text-center text-[12.5px] font-semibold hover:bg-sky-800">OPEN IN DRILLDOWN →</a></div>`;
  }

  el.addEventListener('click', async (e) => {
    const j = e.target.closest('[data-jur]'); if (j) { setCountry(j.dataset.jur); location.hash = `#/map/${j.dataset.jur}`; return; }
    const of = e.target.closest('[data-office]'); if (of) { office = of.dataset.office; insp = null; sel = null; load(); return; }
    const l = e.target.closest('[data-layer]'); if (l) { layer = l.dataset.layer; restyle(); renderChrome(); if (!$('#mp-tiles').classList.contains('hidden')) showTiles(true); return; }
    const m = e.target.closest('[data-mapto]'); if (m) { location.hash = `#/map/${encodeURIComponent(m.dataset.mapto)}`; return; }
    const t = e.target.closest('[data-tile]'); if (t) { sel = t.dataset.tile; insp = await api.get(`/api/node/${encodeURIComponent(sel)}`); showTiles(true); renderInsp(); return; }
    if (e.target.closest('[data-fit]') && map && gj) { map.fitBounds(gj.getBounds(), { padding: [12, 12] }); return; }
    if (e.target.closest('[data-csv]')) {
      const d = def(data.node.country); const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      download(`${data.node.id}-map.csv`, [['id', 'name', 'level', 'pct', 'turnout', 'leader', 'marginPts', 'status', ...d.parties.map((p) => p.code)].join(',')].concat(items.map((x) => [x.id, x.name, x.levelName, (x.pct * 100).toFixed(1), (x.turnout * 100).toFixed(1), x.leader, (x.marginPct * 100).toFixed(2), x.status, ...d.parties.map((p) => x.votes[p.code])].map(q).join(','))).join('\n'));
    }
    if (e.target.closest('[data-geojson]') && geoInfo && geoInfo.fc) {
      const out = { ...geoInfo.fc, features: geoInfo.fc.features.map((f) => { const x = itemFor(f); return { ...f, properties: { ...f.properties, nodeId: x?.id || null, pct: x?.pct ?? null, leader: x?.leader ?? null, marginPct: x?.marginPct ?? null, simulated: !!x } }; }) };
      download(`${data.node.id}-boundaries.geojson`, JSON.stringify(out), 'application/geo+json');
    }
  });
  el.addEventListener('dblclick', (e) => { const t = e.target.closest('[data-tile]'); if (t) { const x = items.find((y) => y.id === t.dataset.tile); if (x && !x.leaf) location.hash = `#/map/${encodeURIComponent(x.id)}`; } });

  function setParam(p) { mapId = p || state.country; sel = null; insp = null; const c = mapId.split('.')[0]; if (c !== state.country && state.meta.countries[c]) setCountry(c); if (!isLive() && c !== 'NGA' && layer === 'irev') layer = 'lead'; load(); }
  setParam(param);
  const timer = setInterval(() => { if (!document.hidden && data) load(); }, 4000);
  return {
    setParam,
    update(kind) {
      if (kind === 'country' && data && data.node.country !== state.country) location.hash = `#/map/${state.country}`;
      if (kind === 'year' && data) { insp = null; sel = null; load(); }
    },
    unmount() { disposed = true; clearInterval(timer); if (map) { map.remove(); map = null; } },
  };
}
