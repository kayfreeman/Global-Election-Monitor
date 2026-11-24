// Shared client state, API helpers, SSE connection and UI primitives.

export const state = {
  meta: null, summary: {}, wire: [], posts: [], incidents: [], reports: [], velocity: {}, adapters: [],
  ledgerHead: { seq: 0, hash: '' }, live: { contests: [], irev: [] }, news: [], connected: false, latency: null, lastTick: null,
  country: lsGet('gp.country') || 'NGA',
  year: (() => { try { return JSON.parse(lsGet('gp.years') || '{}'); } catch { return {}; } })(), // per-country election year
};
const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit(kind, data) { for (const fn of subs) { try { fn(kind, data); } catch (e) { console.error(e); } } }

export function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
export function setCountry(c) { state.country = c; lsSet('gp.country', c); emit('country', c); }

// ---------- election year (per country) ----------
export const CUR_YEAR = new Date().getFullYear();
// the year you picked, otherwise the country's latest year with full official results (from the server)
export const yearFor = (c) => state.year[c] || state.meta?.defaultYears?.[c] || CUR_YEAR;
export function setYear(c, y) { state.year[c] = +y; lsSet('gp.years', JSON.stringify(state.year)); emit('year', { country: c, year: +y }); }
const yearsCache = {}; const archCache = new Map();
/** Years with results for a country: [{year, sources:[...]}], newest first. */
export function yearsFor(c) { return (yearsCache[c] ||= api.get(`/api/years?country=${c}`).catch(() => { delete yearsCache[c]; return [{ year: CUR_YEAR, sources: [] }]; })); }
/** All results for a country and year (declared, archive and live). Past years are cached for the session. */
export async function archiveFor(c, y) {
  const k = `${c}-${y}`; const hit = archCache.get(k);
  if (hit && (y < CUR_YEAR || Date.now() - hit.at < 60000)) return hit.data;
  const data = await api.get(`/api/archive/${c}/${y}`); archCache.set(k, { at: Date.now(), data }); return data;
}
/** Year dropdown; the shell turns a change into setYear(). */
export function yearSelect(c, years, cls = '', compact = false) {
  const cur = yearFor(c); const list = years.some((x) => x.year === cur) ? years : [{ year: cur, sources: [] }, ...years];
  return `<label class="${compact ? 'flex flex-col gap-1' : 'inline-flex items-center gap-1.5'} ${cls}"><span class="lbl">Election year</span><select data-year-select="${c}" class="text-[13px] font-mono py-1 ${compact ? 'w-full' : ''}" title="Years with results. P·S·H = President · Senate · House nationwide; LA only = Louisiana state races only">${list.map((x) => `<option value="${x.year}" ${x.year === cur ? 'selected' : ''}>${x.year}${x.label != null ? (x.label ? ` · ${compact ? x.short : x.label}` : '') : x.sources.length ? ` · ${compact ? x.sources.map((s) => s.slice(0, 4)).join('/') : x.sources.join(', ')}` : ''}</option>`).join('')}</select></label>`;
}

// ---------- API ----------
async function req(method, url, body) {
  const headers = { 'content-type': 'application/json' };
  const tok = lsGet('gp.adminToken'); if (tok) headers['x-admin-token'] = tok;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
export const api = { get: (u) => req('GET', u), post: (u, b) => req('POST', u, b || {}), put: (u, b) => req('PUT', u, b), del: (u) => req('DELETE', u) };

// ---------- SSE ----------
export function connect() {
  const es = new EventSource('/api/stream');
  es.addEventListener('hello', (e) => {
    const d = JSON.parse(e.data);
    state.connected = true; applySummary(d.summary);
    state.wire = d.wire; state.posts = d.posts; state.incidents = d.incidents; state.velocity = d.velocity;
    state.adapters = d.adapters; state.ledgerHead = d.ledgerHead; state.latency = Math.max(0, Date.now() - d.serverTs);
    if (d.live) state.live = d.live; if (d.news) state.news = d.news;
    emit('hello', d);
  });
  es.addEventListener('tick', (e) => {
    const d = JSON.parse(e.data);
    state.latency = Math.max(0, Date.now() - d.serverTs); state.lastTick = Date.now();
    if (d.mode && state.meta && d.mode !== state.meta.mode) { location.reload(); return; }
    applySummary(d.summary); state.velocity = d.velocity; state.ledgerHead = d.ledgerHead;
    if (d.wire.length) state.wire = d.wire.concat(state.wire).slice(0, 400);
    if (d.posts.length) state.posts = d.posts.concat(state.posts).slice(0, 600);
    for (const inc of d.incidents) {
      const i = state.incidents.findIndex((x) => x.id === inc.id);
      if (i >= 0) state.incidents[i] = inc; else state.incidents.unshift(inc);
    }
    emit('tick', d);
  });
  es.addEventListener('mode', () => { location.reload(); });
  es.addEventListener('live', (e) => {
    const d = JSON.parse(e.data); state.live = { contests: d.contests, irev: d.irev }; state.adapters = d.sources; emit('live', d);
  });
  es.addEventListener('news', (e) => {
    const items = JSON.parse(e.data); const seen = new Set(state.news.map((n) => n.url));
    state.news = items.filter((n) => !seen.has(n.url)).concat(state.news).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 600); emit('news', items);
  });
  es.addEventListener('report', (e) => {
    const r = JSON.parse(e.data); const i = state.reports.findIndex((x) => x.id === r.id);
    if (i >= 0) state.reports[i] = r; else state.reports.unshift(r);
    emit('report', r);
  });
  es.onerror = () => { state.connected = false; emit('conn', false); };
  es.onopen = () => { state.connected = true; emit('conn', true); };
}
function applySummary(arr) { for (const c of arr) state.summary[c.country] = c; }

// ---------- formatting ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => (n == null || isNaN(n) ? '—' : Math.round(n).toLocaleString('en-US'));
export const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : fmt(n));
export const pct = (x, d = 1) => (x == null || isNaN(x) ? '—' : (x * 100).toFixed(d) + '%');
export const hhmmss = (iso) => new Date(iso).toISOString().slice(11, 19);
export function ago(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? `${Math.floor(s)}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 172800 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
}
// Colours for parties that appear in real results but not in the core list
const EXTRA_PARTY = { GBR: { PC: '#15803d', DUP: '#b45309', SF: '#065f46', SDLP: '#65a30d', APNI: '#eab308', UUP: '#38bdf8', TUV: '#1e3a8a', OTH: '#94a3b8' }, CAN: { BQ: '#0ea5e9' }, NGA: { A: '#0891b2', APGA: '#d97706', SDP: '#ea580c', ADC: '#65a30d', YPP: '#db2777', AA: '#7c3aed', ADP: '#0d9488', AAC: '#be123c', ZLP: '#4d7c0f', APM: '#a16207', PRP: '#c026d3', APP: '#0369a1', CPC: '#0ea5e9', ACN: '#0f766e', ANPP: '#a16207', YP: '#e11d48', NRM: '#57534e', BP: '#78716c' } };
export function party(country, code) {
  const p = state.meta?.countries[country]?.parties.find((x) => x.code === code);
  if (p) return p; const x = EXTRA_PARTY[country]?.[code];
  return { code, name: code, color: x || '#94a3b8' };
}
export const def = (c) => state.meta.countries[c];
export const icon = (name, cls = '') => `<span class="msi ${cls}">${name}</span>`;

// ---------- chips & badges (Telemetry Civic) ----------
const CHIP = {
  green: 'bg-green-50 border-green-200 text-green-700', amber: 'bg-amber-50 border-amber-200 text-amber-700',
  red: 'bg-red-50 border-red-200 text-red-700', slate: 'bg-slate-100 border-slate-200 text-slate-600',
  blue: 'bg-sky-50 border-sky-200 text-sky-700', solidred: 'bg-red-600 border-red-600 text-white', purple: 'bg-violet-50 border-violet-200 text-violet-700',
};
export const chip = (text, tone = 'slate', extra = '') => `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono text-[10.5px] leading-4 font-semibold uppercase tracking-wider whitespace-nowrap ${CHIP[tone]} ${extra}">${text}</span>`;
export const STATUS = {
  awaiting: ['Awaiting', 'slate'], counting: ['Counting', 'amber'], complete: ['Complete', 'green'], flagged: ['Flagged', 'red'],
  pending: ['Pending', 'slate'], reported: ['Reported', 'green'], disputed: ['Held · review', 'red'],
  open: ['Open', 'red'], under_review: ['Under review', 'amber'], resolved: ['Resolved', 'green'],
  unverified: ['Unverified', 'amber'], live: ['Live', 'green'], test: ['Test data', 'amber'], error: ['Error', 'red'], blocked: ['No access', 'slate'], needs_key: ['Needs key', 'amber'], configured: ['Key set', 'blue'], idle: ['Idle', 'slate'], off: ['Off', 'slate'], verified: ['Verified', 'green'], rejected: ['Rejected', 'slate'], corroborated: ['Corroborated', 'blue'],
};
export const statusChip = (s) => chip((STATUS[s] || [s, 'slate'])[0], (STATUS[s] || [s, 'slate'])[1]);
export const simBadge = () => chip('SIMULATED', 'amber', 'title="Synthetic data from the local simulation engine — not real results"');
export const WIRE_TONE = { DECLARATION: 'green', STATISTICAL: 'blue', INCIDENT: 'red', RESOLUTION: 'green', CROWD: 'purple' };
export const SEV_TONE = { high: 'red', medium: 'amber', low: 'green' };

export function bar(value, color = '#0284c7', h = 'h-1.5') {
  return `<div class="w-full ${h} bg-slate-200 rounded-sm overflow-hidden"><div class="h-full rounded-sm transition-all duration-700" style="width:${Math.min(100, Math.max(0, value * 100)).toFixed(1)}%;background:${color}"></div></div>`;
}
export function stackBar(country, votes, h = 'h-2') {
  const tot = Object.values(votes || {}).reduce((a, b) => a + b, 0);
  if (!tot) return `<div class="w-full ${h} bg-slate-200 rounded-sm"></div>`;
  return `<div class="w-full ${h} flex rounded-sm overflow-hidden gap-px bg-white">${def(country).parties.map((p) => `<div title="${esc(p.name)} ${pct(votes[p.code] / tot)}" style="width:${(votes[p.code] / tot) * 100}%;background:${p.color}"></div>`).join('')}</div>`;
}
export function leaderLabel(country, b) {
  if (!b.leader) return '<span class="text-slate-400">no returns</span>';
  const p = party(country, b.leader);
  return `<span class="font-mono font-semibold" style="color:${p.color}">${esc(p.code)} +${(b.marginPct * 100).toFixed(1)}</span>`;
}

export function toast(msg, tone = 'slate') {
  const el = document.createElement('div');
  el.className = `fixed bottom-14 right-4 z-[100] card px-4 py-2 text-sm border-l-4 ${tone === 'red' ? 'border-l-red-600' : tone === 'green' ? 'border-l-green-600' : 'border-l-sky-600'}`;
  el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 3500);
}

// download helper for CSV/JSON built client-side
export function download(name, text, type = 'text/csv') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// throttle helper so heavy views re-render at most every `ms`
export function throttle(fn, ms) {
  let last = 0, t = null;
  return (...a) => { const now = Date.now(); const run = () => { last = Date.now(); t = null; fn(...a); };
    if (now - last >= ms) run(); else if (!t) t = setTimeout(run, ms - (now - last)); };
}

export const isLive = () => state.meta && state.meta.mode !== 'simulation';

// Keyless basemaps (tested Nov 2026). CARTO now requires an API key, so it is not listed.
export const BASEMAPS = {
  'esri-gray': { name: 'Esri Light Gray (default)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors', maxZoom: 16 },
  'esri-street': { name: 'Esri Streets', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri', maxZoom: 18 },
  osm: { name: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 },
  'osm-fr': { name: 'OpenStreetMap France', url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap France | &copy; OpenStreetMap contributors', maxZoom: 19 },
  none: { name: 'No basemap (boundaries only)', url: '', attribution: '' },
};
export function basemap() {
  const m = state.meta?.map || {};
  if (m.basemap === 'custom' && m.customUrl) return { name: 'Custom', url: m.customUrl, attribution: m.customAttribution || '', maxZoom: 19 };
  return BASEMAPS[m.basemap] || BASEMAPS['esri-gray'];
}
