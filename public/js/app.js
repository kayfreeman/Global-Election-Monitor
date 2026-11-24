// App shell: header, country ticker, navigation, jurisdiction sidebar,
// sources-health footer and the hash router that mounts each view.
import { state, api, connect, subscribe, setCountry, setYear, yearFor, yearsFor, yearSelect, esc, pct, chip, icon, def, bar, toast, lsGet, lsSet, leaderLabel, throttle, isLive, party } from './core.js';

// Navigation, grouped by purpose. Short labels so everything fits; below ~1200px
// only icons show (plus the active tab's label) and each tab has a tooltip.
const NAV_GROUPS = [
  ['Results', [['command', 'Overview', 'dashboard', 'Global Command Center — every election at a glance'], ['live', 'Live Results', 'sensors', 'Real results from official portals'], ['map', 'Map', 'map', 'Electoral map and subdivisions'], ['drilldown', 'Drilldown', 'account_tree', 'Regional drilldown: state → district → unit']]],
  ['Media', [['news', 'News', 'newspaper', 'Election news feeds'], ['wall', 'Streams', 'videocam', 'Multi-camera live stream wall'], ['signals', 'Signals', 'forum', 'Social and crowd signals']]],
  ['Integrity', [['ledger', 'Ledger', 'gavel', 'Tamper-evident audit ledger']]],
];
const ROUTES = NAV_GROUPS.flatMap(([, r]) => r).concat([['settings', 'Settings', 'settings', 'Settings & integrations']]);
const CLOCKS = [['UTC', 'UTC'], ['WDC', 'America/New_York'], ['LON', 'Europe/London'], ['ABJ', 'Africa/Lagos'], ['MEL', 'Australia/Melbourne'], ['WLG', 'Pacific/Auckland']];
const ADAPTER_TONE = { live: 'text-green-600', test: 'text-amber-600', ready: 'text-sky-600', configured: 'text-sky-600', needs_key: 'text-amber-600', blocked: 'text-slate-400', error: 'text-red-600', idle: 'text-slate-400', off: 'text-slate-400' };
const ADAPTER_LABEL = { live: 'LIVE', test: 'TEST DATA', ready: 'READY', configured: 'KEY SET', needs_key: 'NEEDS KEY', blocked: 'NO ACCESS', error: 'ERROR', idle: 'IDLE', off: 'OFF' };

let current = null; // { name, view }

function shell() {
  document.getElementById('app').innerHTML = `
  <div class="h-screen flex flex-col overflow-hidden">
    <header class="shrink-0 bg-white border-b border-slate-200 z-40">
      <div class="h-12 px-3 flex items-center gap-4 border-b border-slate-100">
        <a href="#/command" class="flex items-center gap-2 shrink-0">
          <img src="/favicon.svg" class="w-7 h-7" alt="" />
          <div class="leading-tight"><div class="font-bold tracking-tight text-[15px]">GLOBAL ELECTORAL PULSE</div><div class="font-mono text-[9.5px] tracking-widest text-slate-500">INTELLIGENCE NETWORK // G5 FEEDS</div></div>
        </a>
        <div id="clocks" class="hidden lg:flex items-center gap-3 font-mono text-[11px] text-slate-500"></div>
        <div class="flex-1"></div>
        <div id="conn" class="flex items-center gap-2"></div>
      </div>
      <div id="ticker" class="h-8 px-3 flex items-center gap-5 overflow-x-auto scroll-thin text-[11px] font-mono whitespace-nowrap"></div>
      <nav class="h-11 px-3 flex items-center border-t border-slate-100" id="nav"></nav>
      <div id="banner"></div>
    </header>
    <div class="flex-1 flex min-h-0">
      <aside id="side" class="hidden md:flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white overflow-y-auto scroll-thin"></aside>
      <main id="view" class="flex-1 min-w-0 overflow-y-auto scroll-thin"></main>
    </div>
    <footer id="foot" class="shrink-0 h-9 bg-white border-t border-slate-200 px-3 flex items-center gap-4 text-[10.5px] font-mono overflow-x-auto scroll-thin whitespace-nowrap"></footer>
  </div>`;
  const tab = ([k, label, ic, tip]) => `<a href="#/${k}" data-nav="${k}" title="${tip}" aria-label="${label}">${icon(ic, 'sm')}<span class="nav-lbl">${label}</span></a>`;
  document.getElementById('nav').innerHTML =
    `<div id="navtabs" class="flex-1 min-w-0 flex items-center gap-0.5 overflow-x-auto no-scrollbar">` +
    NAV_GROUPS.map(([g, r], i) => `${i ? '<span class="shrink-0 w-px h-5 bg-slate-200 mx-1.5"></span>' : ''}<span class="lbl shrink-0 mr-1 hidden 2xl:inline text-[9.5px]">${g}</span>${r.map(tab).join('')}`).join('') +
    `</div><div class="shrink-0 flex items-center gap-2 pl-2 ml-1 border-l border-slate-200"><span id="modechip"></span>${tab(ROUTES[ROUTES.length - 1])}</div>`;
}

function renderBanner() {
  const b = document.getElementById('banner'); if (!state.meta) return;
  b.innerHTML = isLive()
    ? `<div class="bg-emerald-50 border-t border-emerald-200 text-emerald-800 text-[11px] font-mono px-3 py-1 flex items-center gap-2"><span class="pulse"></span> <b>LIVE MODE</b> — every tab shows real data from public sources only (INEC IReV, Louisiana SoS, Democracy Club, VEC, news feeds). Simulation is off. <a href="#/settings" class="underline ml-auto">Settings</a></div>`
    : `<div class="bg-amber-50 border-t border-amber-200 text-amber-800 text-[11px] font-mono px-3 py-1 flex items-center gap-2">${icon('science', 'sm')} <b>SIMULATION MODE</b> — results, incidents and social posts are synthetic demo data. Live Results and News are still real. <a href="#/settings" class="underline ml-auto">Switch to live in Settings</a></div>`;
  const mc = document.getElementById('modechip'); if (mc) mc.innerHTML = isLive() ? chip('Live', 'green') : chip('Simulation', 'amber');
}

function renderClocks() {
  const now = new Date();
  document.getElementById('clocks').innerHTML = CLOCKS.map(([k, tz], i) =>
    `<span class="${i === 0 ? 'text-sky-700 font-semibold' : ''}">${k} <span class="text-slate-800">${now.toLocaleTimeString('en-GB', { timeZone: tz, hour12: false })}</span></span>`).join('');
}

function renderConn() {
  const el = document.getElementById('conn');
  const ok = state.connected && state.lastTick && Date.now() - state.lastTick < 10000 || (state.connected && !state.lastTick);
  el.innerHTML = `
    <span class="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded border font-mono text-[11px] ${ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}">
      <span class="pulse"></span>${ok ? 'STREAM CONNECTED' : 'RECONNECTING…'}</span>
    <span class="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 font-mono text-[11px] text-slate-600" title="Server→browser event latency">${icon('speed', 'sm')}${state.latency ?? '—'}ms</span>`;
}

function renderTicker() {
  const el = document.getElementById('ticker'); if (!state.meta) return;
  el.innerHTML = state.meta.order.map((c) => {
    const s = state.summary[c]; const d = def(c); if (!s) return '';
    if (isLive()) {
      const L = s.live || {}; const col = L.status === 'live' ? '#16a34a' : L.status === 'test' ? '#d97706' : L.status === 'error' ? '#dc2626' : '#94a3b8';
      return `<button data-country="${c}" class="shrink-0 inline-flex items-center gap-2 hover:opacity-80 ${c === state.country ? 'underline decoration-sky-500 underline-offset-4' : ''}" title="${esc(L.detail || '')}">
        <b class="text-slate-900">${c}</b><span class="text-slate-500">${esc(L.source || d.authorityShort)}</span>
        ${L.count ? `<span class="w-16 inline-block">${bar(L.pct || 0, col, 'h-1')}</span><span style="color:${col}" class="font-semibold">${pct(L.pct || 0, 1)} ${esc(L.metric || '')}</span>${L.test ? '<span class="text-amber-600">TEST</span>' : ''}` : `<span class="text-slate-400 truncate max-w-[200px]">${esc(L.title || 'no live source')}</span>`}</button>`;
    }
    const col = s.highIncidents ? '#dc2626' : s.pct >= 1 ? '#16a34a' : s.pct > 0.5 ? '#0284c7' : '#d97706';
    return `<button data-country="${c}" class="shrink-0 inline-flex items-center gap-2 hover:opacity-80 ${c === state.country ? 'underline decoration-sky-500 underline-offset-4' : ''}">
      <b class="text-slate-900">${c}</b><span class="text-slate-500">${esc(d.authorityShort)}</span>
      <span class="w-16 inline-block">${bar(s.pct, col, 'h-1')}</span>
      <span style="color:${col}" class="font-semibold">${pct(s.pct, 0)} ${esc(d.metricWord)}</span>
      ${s.leader ? leaderLabel(c, s) : ''}</button>`;
  }).join('<span class="text-slate-300">|</span>');
}

function renderNav() {
  const name = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'command';
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === name;
    a.className = `navtab shrink-0 px-2.5 h-8 inline-flex items-center gap-1.5 rounded text-[13px] whitespace-nowrap ${on ? 'on bg-sky-700 text-white font-semibold' : 'text-slate-700 hover:bg-slate-100'}`;
    if (on) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

function renderSide() {
  const el = document.getElementById('side'); if (!state.meta) return;
  if (document.activeElement?.matches?.('#side select, #side input')) return; // don't close an open dropdown / interrupt typing
  const c = state.country; const d = def(c); const s = state.summary[c];
  const ads = state.adapters.filter((a) => a.country === c || a.country === '*');
  const admin = state.meta.admin;
  el.innerHTML = `
    <div class="p-3 border-b border-slate-100">
      <div class="lbl mb-2">Jurisdiction filter</div>
      ${state.meta.order.map((k) => { const x = state.summary[k]; return `
        <button data-country="${k}" class="w-full text-left px-2 py-1.5 mb-0.5 rounded border ${k === c ? 'bg-sky-50 border-sky-300' : 'border-transparent hover:bg-slate-50'}">
          <div class="flex items-center justify-between text-[13px]"><span class="${k === c ? 'font-semibold text-sky-800' : ''}">${esc(def(k).name)}</span><span class="font-mono text-[10.5px] text-sky-700">${esc(def(k).authorityShort)}</span></div>
          ${x ? `<div class="mt-1">${bar(isLive() ? (x.live?.pct || 0) : x.pct, k === c ? '#0284c7' : '#94a3b8', 'h-[3px]')}</div>` : ''}
        </button>`; }).join('')}
    </div>
    <div class="p-3 border-b border-slate-100" id="side-year"><span class="lbl">Election year</span> <b class="font-mono">${yearFor(c)}</b></div>
    <div class="p-3 border-b border-slate-100">
      <div class="lbl mb-1.5">Election in focus</div>
      <div class="text-[13px] font-semibold leading-snug">${esc(d.election.name)}</div>
      <div class="font-mono text-[11px] text-slate-500 mt-0.5">${d.election.date ? esc(d.election.date) : 'no date'} · ${esc(d.election.phase)}</div>
      <p class="text-[11.5px] text-slate-600 mt-1.5 leading-snug">${esc(d.election.note)}</p>
      <div class="mt-2 font-mono text-[10.5px] text-slate-500">Hierarchy: ${d.levels.map(esc).join(' › ')}</div>
    </div>
    <div class="p-3 border-b border-slate-100">
      <div class="lbl mb-1.5">Telemetry sources</div>
      ${ads.map((a) => `<div class="flex items-start gap-1.5 text-[12px] py-0.5" title="${esc(a.note)}">
        <span class="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${a.status === 'live' ? 'bg-green-500' : a.status === 'error' ? 'bg-red-500' : a.status === 'blocked' ? 'bg-slate-300' : 'bg-amber-500'}"></span>
        <span class="flex-1">${esc(a.name)}<br><span class="font-mono text-[10px] ${ADAPTER_TONE[a.status] || ''}">${ADAPTER_LABEL[a.status] || a.status}${a.items ? ` · ${a.items}` : ''}</span></span></div>`).join('')}
    </div>
    ${isLive() ? `<div class="p-3"><a href="#/settings" class="block text-center text-[12px] px-2 py-1.5 rounded border border-slate-300 hover:bg-slate-50">${icon('settings', 'sm')} Integrations &amp; settings</a></div>` : `<div class="p-3">
      <div class="lbl mb-1.5">Simulation control</div>
      ${admin ? `
        <div class="flex gap-1 mb-2">
          <button data-sim="${s && s.running ? 'pause' : 'resume'}" class="flex-1 text-[12px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">${icon(s && s.running ? 'pause' : 'play_arrow', 'sm')} ${s && s.running ? 'Pause' : 'Resume'}</button>
          <button data-sim="reset" class="flex-1 text-[12px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">${icon('restart_alt', 'sm')} Reset</button>
        </div>
        <label class="text-[11px] text-slate-500 flex items-center gap-2">Speed
          <select id="simspeed" class="flex-1 text-[12px] py-0.5 rounded border-slate-300">${[0.5, 1, 2, 5, 10].map((v) => `<option ${state.meta.sim.speed == v ? 'selected' : ''} value="${v}">${v}×</option>`).join('')}</select></label>
        <p class="text-[10.5px] text-slate-400 mt-1">Applies to ${esc(d.name)} (pause/reset) · speed is global.</p>`
      : `<p class="text-[11.5px] text-slate-500 mb-1">Controls and moderation are available from this computer, or with the moderator token.</p>
         <input id="tok" type="password" placeholder="Moderator token" class="w-full text-[12px] rounded border-slate-300 py-1" value="${esc(lsGet('gp.adminToken') || '')}" />`}
    </div>`}`;
  yearsFor(c).then((ys) => { const b = document.getElementById('side-year'); if (b && state.country === c) b.innerHTML = yearSelect(c, ys, '', true); });
}

function renderFoot() {
  const el = document.getElementById('foot');
  const h = state.ledgerHead;
  el.innerHTML = `<span class="font-semibold text-slate-800">SOURCES HEALTH:</span>` +
    state.adapters.map((a) => `<span class="${ADAPTER_TONE[a.status] || ''}" title="${esc((a.lastError || a.detail || a.note || ''))}">${esc(a.name.split(' (')[0].toUpperCase())} [${ADAPTER_LABEL[a.status] || a.status}]</span>`).join('') +
    `<span class="flex-1"></span><a href="#/ledger" class="text-sky-700 inline-flex items-center gap-1">${icon('verified', 'sm')} LEDGER #${h.seq} · ${esc((h.hash || '').slice(0, 10))}…</a>`;
}

const VIEWS = { command: () => import('./views/command.js'), drilldown: () => import('./views/drilldown.js'), map: () => import('./views/map.js'), signals: () => import('./views/signals.js'), ledger: () => import('./views/ledger.js'), live: () => import('./views/live.js'), news: () => import('./views/news.js'), settings: () => import('./views/settings.js'), wall: () => import('./views/wall.js') };

async function route() {
  const m = location.hash.match(/^#\/(\w+)(?:\/(.*))?$/);
  const name = m && VIEWS[m[1]] ? m[1] : 'command';
  const param = m && m[2] ? decodeURIComponent(m[2]) : null;
  renderNav();
  if (current && current.name === name && current.view.setParam) { current.view.setParam(param); return; }
  if (current && current.view.unmount) current.view.unmount();
  current = null; // the old view must not receive events while the new one mounts
  const el = document.getElementById('view');
  el.innerHTML = '<div class="p-6 text-slate-400 font-mono text-sm">Loading…</div>';
  el.scrollTop = 0;
  const mod = await VIEWS[name]();
  el.innerHTML = '';
  el.classList.toggle('bg-void', name === 'wall');
  current = { name, view: mod.mount(el, param) };
}

async function boot() {
  shell();
  renderClocks(); setInterval(renderClocks, 1000); setInterval(renderConn, 2000);
  state.meta = await api.get('/api/meta');
  if (!state.meta.order.includes(state.country)) setCountry(state.meta.order.includes('NGA') ? 'NGA' : state.meta.order[0]); // a country no longer covered (e.g. New Zealand) was saved
  state.reports = await api.get('/api/reports').catch(() => []);
  connect();
  const heavy = throttle(() => { renderTicker(); renderSide(); renderFoot(); }, 1500);
  document.addEventListener('change', (e) => { const y = e.target.closest('[data-year-select]'); if (y) setYear(y.dataset.yearSelect, y.value); });
  subscribe((kind) => {
    if (kind === 'hello') { renderBanner(); renderTicker(); renderSide(); renderFoot(); renderConn(); if (!current) route(); }
    else if (kind === 'tick' || kind === 'live') heavy();
    else if (kind === 'country' || kind === 'year') { renderTicker(); renderSide(); }
    else if (kind === 'conn') renderConn();
    if (current && current.view.update) current.view.update(kind);
  });

  // global delegated handlers for shell controls
  document.addEventListener('click', async (e) => {
    const cbtn = e.target.closest('[data-country]');
    if (cbtn && !cbtn.closest('#view')) { setCountry(cbtn.dataset.country); return; }
    const sbtn = e.target.closest('[data-sim]');
    if (sbtn) {
      try { await api.post(`/api/sim/${sbtn.dataset.sim}?country=${state.country}`); toast(`Simulation ${sbtn.dataset.sim} — ${def(state.country).name}`); }
      catch (err) { toast(err.message, 'red'); }
    }
  });
  document.addEventListener('change', async (e) => {
    if (e.target.id === 'simspeed') { const r = await api.post('/api/sim/speed', { speed: +e.target.value }).catch((err) => toast(err.message, 'red')); if (r) state.meta.sim.speed = r.speed; }
    if (e.target.id === 'tok') { lsSet('gp.adminToken', e.target.value); state.meta = await api.get('/api/meta'); renderSide(); toast(state.meta.admin ? 'Moderator access enabled' : 'Token not accepted', state.meta.admin ? 'green' : 'red'); }
  });
  window.addEventListener('hashchange', route);
}
boot();
