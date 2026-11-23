// Settings — every integration in one place: data mode, results sources,
// news feeds + GDELT, API keys (.env), basemap, server, polls and streams.
import { state, api, esc, chip, icon, def, toast, lsGet, lsSet, ago, BASEMAPS, fmt } from '../core.js';

const STATUS_TONE = { live: 'green', test: 'amber', error: 'red', blocked: 'slate', needs_key: 'amber', configured: 'blue', idle: 'slate', off: 'slate' };
const STATUS_LABEL = { live: 'Live', test: 'Test data', error: 'Error', blocked: 'No access', needs_key: 'Needs key', configured: 'Key set', idle: 'Idle', off: 'Off' };
const SECRET_HELP = {
  ADMIN_TOKEN: 'Required if you open the dashboard to your network (HOST 0.0.0.0). Moderators enter it in the sidebar.',
  ELECTION_API_KEY: 'Election.org developer key (free, read-only). Optional — public results work without it; with it, US results use your registered key. Create it at election.org/api/developers and paste it here, never in chat or code.',
  AP_API_KEY: 'AP Elections API (paid). US race calls for every state.',
  X_BEARER_TOKEN: 'X API (pay-per-use, no free tier). Set a spend cap in the X developer console first.',
  REDDIT_CLIENT_ID: 'Reddit app client ID (free tier is non-commercial only).', REDDIT_CLIENT_SECRET: 'Reddit app secret.',
  VEC_FEED_URL: 'Victorian Electoral Commission live feed URL — issued after your VEC terms-of-use agreement is approved.',
  VEC_CANDIDATES_URL: 'VEC candidates file URL (from the VEC user guide).',
  AEC_FEED_HOST: 'AEC media feed host (federal elections only; free registration).',
  ECNZ_FEED_URL: 'NZ Electoral Commission media feed URL (request via media@elections.govt.nz).',
};

export function mount(el) {
  let s = null; let feeds = []; let gq = {}; let polls = [];
  const card = (title, ic, body, extra = '') => `<section class="card"><div class="flex items-center gap-2 px-4 py-3 border-b border-slate-200"><h3 class="font-bold text-[16px] flex items-center gap-2">${icon(ic)} ${title}</h3><span class="flex-1"></span>${extra}</div><div class="p-4">${body}</div></section>`;
  const src = (id) => state.adapters.find((a) => a.id === id) || {};
  const status = (id) => { const a = src(id); return `${chip(STATUS_LABEL[a.status] || a.status || '—', STATUS_TONE[a.status] || 'slate')}${a.lastOk ? `<span class="font-mono text-[10.5px] text-slate-500">ok ${ago(a.lastOk)}</span>` : ''}`; };
  const statusLine = (id) => { const a = src(id); return `<div class="text-[12px] mt-1 ${a.lastError ? 'text-red-600 font-mono' : 'text-slate-500'}">${esc(a.lastError || a.detail || a.note || '')}</div>`; };
  const toggle = (id, on) => `<label class="inline-flex items-center gap-2 text-[13px] cursor-pointer"><input type="checkbox" data-k="${id}" ${on ? 'checked' : ''} class="w-4 h-4 accent-sky-600"/> Enabled</label>`;
  const field = (id, label, val, attrs = '', help = '') => `<label class="block"><span class="lbl">${label}</span><input data-k="${id}" value="${esc(val ?? '')}" ${attrs} class="mt-1 w-full text-[13px]"/>${help ? `<span class="text-[11px] text-slate-500">${help}</span>` : ''}</label>`;

  async function load() {
    if (!state.meta.admin) { renderLocked(); return; }
    s = await api.get('/api/settings');
    const n = s.live.news || {};
    feeds = (Array.isArray(n.feeds) && n.feeds.length ? n.feeds : s.defaults.feeds).map((f) => ({ enabled: f.enabled !== false, ...f }));
    gq = { ...s.defaults.gdelt, ...(n.gdeltQueries || {}) };
    polls = await api.get('/api/polls').catch(() => []);
    render();
  }

  function renderLocked() {
    el.innerHTML = `<div class="p-6 max-w-xl"><div class="card p-5"><h2 class="text-xl font-bold">Settings</h2><p class="text-[14px] text-slate-600 mt-1">Settings can be changed from the computer running the dashboard, or with the moderator token.</p>
      <input id="st-tok" type="password" placeholder="Moderator token" class="mt-3 w-full text-sm" value="${esc(lsGet('gp.adminToken') || '')}"/><button id="st-tok-go" class="mt-2 px-3 py-1.5 rounded bg-sky-700 text-white text-sm">Unlock</button></div></div>`;
    el.querySelector('#st-tok-go').onclick = async () => { lsSet('gp.adminToken', el.querySelector('#st-tok').value); state.meta = await api.get('/api/meta'); load(); };
  }

  function render() {
    const L = s.live; const ir = L.irev || {}; const la = L.louisiana || {}; const dc = L.democracyclub || {}; const vec = L.vec || {}; const nw = L.news || {};
    el.innerHTML = `<div class="p-4 max-w-[1200px] space-y-4 pb-24">
      <div class="flex items-center gap-3"><h2 class="text-[24px] font-bold">Settings &amp; integrations</h2><span class="text-[13px] text-slate-500">Changes to sources, feeds and keys apply after a restart (one click below).</span></div>

      ${card('Data mode', 'toggle_on', `<div class="grid sm:grid-cols-2 gap-3">
        ${[['live', 'Live — real public sources only', 'Every tab shows real data. The simulation engine is switched off. Recommended.'], ['simulation', 'Simulation — demo data', 'Synthetic results, incidents and social posts to explore every screen. Live Results and News stay real.']].map(([k, t, d]) => `
          <label class="rounded border p-3 cursor-pointer ${s.mode === k ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'}"><input type="radio" name="mode" value="${k}" ${s.mode === k ? 'checked' : ''} class="accent-sky-600"/> <b class="text-[14px]">${t}</b><p class="text-[12.5px] text-slate-600 mt-1">${d}</p></label>`).join('')}</div>
        <p class="text-[12px] text-slate-500 mt-2">Switching mode applies immediately — no restart needed.</p>`)}

      ${card('Results sources', 'how_to_vote', `<div class="space-y-4">
        <div class="rounded border border-slate-200 p-3"><div class="flex flex-wrap items-center gap-2"><b>Nigeria — INEC IReV</b>${status('irev')}<span class="flex-1"></span>${toggle('irev.enabled', ir.enabled !== false)}</div>${statusLine('irev')}
          <div class="grid sm:grid-cols-4 gap-3 mt-2">${field('irev.elections', 'Elections to track', Array.isArray(ir.elections) ? ir.elections.join(', ') : 'auto', '', '“auto” = latest presidential/governorship, or comma-separated IReV election IDs')}
            ${field('irev.statsEverySec', 'Stats refresh (sec)', ir.statsEverySec ?? 60, 'type="number" min="15"')}${field('irev.crawlEveryMin', 'Full crawl every (min)', ir.crawlEveryMin ?? 30, 'type="number" min="5"')}${field('irev.gapMs', 'Pause between requests (ms)', ir.gapMs ?? 1200, 'type="number" min="300"', 'Be gentle: IReV slows under load')}</div></div>
        <div class="rounded border border-slate-200 p-3"><div class="flex flex-wrap items-center gap-2"><b>USA — Louisiana Secretary of State</b>${status('louisiana')}<span class="flex-1"></span>${toggle('louisiana.enabled', la.enabled !== false)}</div>${statusLine('louisiana')}
          <div class="grid sm:grid-cols-2 gap-3 mt-2">${field('louisiana.dates', 'Election dates', Array.isArray(la.dates) ? la.dates.join(', ') : 'auto', '', '“auto” = two most recent, or e.g. 12/12/2026, 11/03/2026')}</div></div>
        <div class="rounded border border-slate-200 p-3"><div class="flex flex-wrap items-center gap-2"><b>UK — Democracy Club</b>${status('democracyclub')}<span class="flex-1"></span>${toggle('democracyclub.enabled', dc.enabled !== false)}</div>${statusLine('democracyclub')}
          <div class="grid sm:grid-cols-3 gap-3 mt-2">${field('democracyclub.days', 'Look back (days)', dc.days ?? 21, 'type="number" min="1" max="120"')}</div></div>
        <div class="rounded border border-slate-200 p-3"><div class="flex flex-wrap items-center gap-2"><b>Australia — Victorian Electoral Commission</b>${status('vec')}</div>${statusLine('vec')}
          <div class="grid sm:grid-cols-3 gap-3 mt-2"><label class="block"><span class="lbl">Mode</span><select data-k="vec.mode" class="mt-1 w-full text-[13px]">${[['off', 'Off'], ['live', 'Live feed (needs VEC approval)'], ['sample', 'Public sample replay (TEST DATA — for checking the screens only)']].map(([k, t]) => `<option value="${k}" ${(vec.mode || 'off') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <div class="sm:col-span-2 text-[12px] text-slate-600 self-end">Live access is free but needs the VEC terms-of-use agreement: <a class="text-sky-700" target="_blank" rel="noopener" href="https://www.vec.vic.gov.au/about-us/media/2026-results-data-feed">request access ↗</a>. Then add the feed URLs under API keys below.</div></div></div>
        <div class="rounded border border-slate-200 p-3 text-[13px]"><b>Not reachable for free</b>
          <ul class="mt-1 space-y-1 text-slate-600">${['ecnz', 'ap', 'us-states', 'aec', 'x', 'reddit', 'facebook', 'nairaland'].map((id) => { const a = src(id); return a.id ? `<li class="flex flex-wrap items-center gap-2">${chip(STATUS_LABEL[a.status] || a.status, STATUS_TONE[a.status] || 'slate')}<b>${esc(a.name)}</b> — ${esc(a.note || '')}</li>` : ''; }).join('')}</ul></div>
      </div>`)}

      ${card('News feeds', 'newspaper', `<div class="flex flex-wrap items-center gap-4 mb-3">${toggle('news.enabled', nw.enabled !== false)}
          <label class="inline-flex items-center gap-2 text-[13px]"><input type="checkbox" data-k="news.gdelt" ${nw.gdelt !== false ? 'checked' : ''} class="w-4 h-4 accent-sky-600"/> GDELT global news index</label>
          <label class="inline-flex items-center gap-2 text-[13px]">Refresh every <input data-k="news.everyMin" type="number" min="2" value="${esc(nw.everyMin ?? 10)}" class="w-20 text-[13px]"/> min</label>
          <span class="flex-1"></span>${status('news')}</div>
        <div class="overflow-x-auto"><table class="w-full text-[13px]"><thead><tr>${['On', 'Name', 'Country', 'Feed URL', 'Election filter', 'Status', ''].map((h) => `<th class="lbl text-left py-2 px-2 bg-slate-50 border-b border-slate-300">${h}</th>`).join('')}</tr></thead>
          <tbody id="st-feeds">${feedRows()}</tbody></table></div>
        <div class="flex gap-2 mt-2"><button data-act="addfeed" class="px-3 py-1.5 rounded border border-slate-300 text-[12.5px]">${icon('add', 'sm')} Add feed</button><button data-act="resetfeeds" class="px-3 py-1.5 rounded border border-slate-300 text-[12.5px]">Reset to defaults</button></div>
        <p class="text-[11.5px] text-slate-500 mt-2">“Election filter” keeps only items mentioning elections/parties/candidates (for general news feeds). Headlines + links only; check each publisher's RSS terms before public or commercial use.</p>
        <div class="mt-4"><div class="lbl mb-1">GDELT search per country</div><div class="grid sm:grid-cols-2 gap-2">${state.meta.order.map((c) => `<label class="block"><span class="text-[12px] font-semibold">${c} — ${esc(def(c).name)}</span><input data-gq="${c}" value="${esc(gq[c] || '')}" class="mt-0.5 w-full text-[12.5px] font-mono"/></label>`).join('')}</div>
          <p class="text-[11.5px] text-slate-500 mt-1">GDELT query syntax: OR, quotes, <code>sourcecountry:nigeria</code>. Leave blank to skip a country. ${status('gdelt')}</p></div>`)}

      ${card('API keys & feed credentials', 'key', `<p class="text-[12.5px] text-slate-600 mb-3">Stored in the <code>.env</code> file on this computer. Saved values are never shown again in full. Leave a field empty to keep it; type <code>-</code> to clear it.</p>
        <div class="grid sm:grid-cols-2 gap-3">${Object.keys(SECRET_HELP).map((k) => `<label class="block"><span class="lbl">${k}</span>${s.secrets[k] ? ` <span class="font-mono text-[11px] text-green-700">${esc(s.secrets[k])}</span>` : ' <span class="font-mono text-[11px] text-slate-400">not set</span>'}
          <input data-secret="${k}" type="password" autocomplete="off" placeholder="${s.secrets[k] ? 'leave blank to keep' : 'not set'}" class="mt-1 w-full text-[13px] font-mono"/><span class="text-[11px] text-slate-500">${SECRET_HELP[k]}</span></label>`).join('')}</div>
        <button data-act="savesecrets" class="mt-3 px-3 py-1.5 rounded bg-sky-700 text-white text-[13px] font-semibold">Save keys</button>`)}

      ${card('Map', 'map', `<div class="grid sm:grid-cols-3 gap-3"><label class="block"><span class="lbl">Basemap</span><select id="st-bm" class="mt-1 w-full text-[13px]">${Object.entries(BASEMAPS).map(([k, b]) => `<option value="${k}" ${s.map.basemap === k ? 'selected' : ''}>${b.name}</option>`).join('')}<option value="custom" ${s.map.basemap === 'custom' ? 'selected' : ''}>Custom tile URL…</option></select></label>
          <label class="block sm:col-span-2"><span class="lbl">Custom tile URL</span><input id="st-bmurl" value="${esc(s.map.customUrl)}" placeholder="https://…/{z}/{x}/{y}.png" class="mt-1 w-full text-[13px] font-mono"/></label>
          <label class="block sm:col-span-3"><span class="lbl">Custom attribution</span><input id="st-bmatt" value="${esc(s.map.customAttribution)}" class="mt-1 w-full text-[13px]"/></label></div>
        <div class="flex items-center gap-3 mt-3"><img id="st-bmprev" class="w-24 h-24 rounded border border-slate-200 bg-slate-50" alt="preview"/><button data-act="savemap" class="px-3 py-1.5 rounded bg-sky-700 text-white text-[13px] font-semibold">Save map settings</button><span class="text-[12px] text-slate-500">Applies the next time you open the map. Boundaries: geoBoundaries (open licences), cached in data\\geo.</span></div>`)}

      ${card('Polls', 'monitoring', `<p class="text-[12.5px] text-slate-600 mb-2">${polls.filter((p) => p.demo).length} demo placeholder polls · ${polls.filter((p) => !p.demo).length} real polls.</p>
        <div class="overflow-x-auto max-h-64 overflow-y-auto scroll-thin"><table class="w-full text-[12.5px]"><tbody>${polls.map((p) => `<tr class="border-b border-slate-100"><td class="py-1 px-2 font-mono">${p.country}</td><td class="px-2">${esc(p.pollster)} ${p.demo ? chip('demo', 'amber') : ''}</td><td class="px-2 font-mono">${esc(p.fieldEnd)}</td><td class="px-2 font-mono">n=${fmt(p.sample)}</td><td class="px-2 font-mono">${Object.entries(p.shares).map(([k, v]) => `${k} ${v}`).join(' · ')}</td><td class="px-2 text-right"><button data-delpoll="${esc(p.id)}" class="text-red-600 text-[12px]">Delete</button></td></tr>`).join('')}</tbody></table></div>
        <div class="flex flex-wrap gap-2 mt-2"><button data-act="deldemo" class="px-3 py-1.5 rounded border border-red-300 text-red-700 text-[12.5px]">Remove all demo polls</button></div>
        <div class="grid sm:grid-cols-6 gap-2 mt-3 items-end"><select id="pl-c" class="text-[12.5px]">${state.meta.order.map((c) => `<option>${c}</option>`).join('')}</select><input id="pl-p" placeholder="Pollster" class="text-[12.5px]"/><input id="pl-d" type="date" class="text-[12.5px]"/><input id="pl-n" type="number" placeholder="Sample" class="text-[12.5px]"/><input id="pl-s" placeholder="APC=38, PDP=27, LP=25…" class="text-[12.5px] sm:col-span-2 font-mono"/>
          <input id="pl-u" placeholder="Source URL" class="text-[12.5px] sm:col-span-5"/><button data-act="addpoll" class="px-3 py-1.5 rounded bg-sky-700 text-white text-[12.5px]">Add poll</button></div>`)}

      ${card('Declared results (Nigeria)', 'how_to_vote', `<p class="text-[12.5px] text-slate-600 mb-2">Built in: INEC declared results for presidential elections (2011–2023, by state) and governorship elections (2019–2026, by LGA where published). Add an election that isn't there yet — e.g. a new governorship result — from the returning officer's declaration. It appears under that year in Results and on the map.</p>
        <div class="grid sm:grid-cols-5 gap-2 items-end">
          <label class="block"><span class="lbl">Election</span><select id="dr-type" class="mt-1 w-full text-[13px]"><option value="GOV">Governorship</option><option value="PRES">Presidential</option></select></label>
          <label class="block"><span class="lbl">State</span><input id="dr-state" placeholder="e.g. Ekiti" class="mt-1 w-full text-[13px]"/></label>
          <label class="block"><span class="lbl">Election date</span><input id="dr-date" type="date" class="mt-1 w-full text-[13px]"/></label>
          <label class="block sm:col-span-2"><span class="lbl">Source (link to INEC / report)</span><input id="dr-src" placeholder="https://…" class="mt-1 w-full text-[13px]"/></label></div>
        <label class="block mt-2"><span class="lbl">Results — one candidate per line: Name, PARTY, votes</span><textarea id="dr-rows" rows="4" class="mt-1 w-full text-[13px] font-mono" placeholder="Biodun Oyebanji, APC, 185000&#10;Wole Oluyede, PDP, 95000"></textarea></label>
        <button data-act="adddeclared" class="mt-2 px-3 py-1.5 rounded bg-sky-700 text-white text-[12.5px]">Add declared result</button>`)}

      ${card('Streams & server', 'dns', `<div class="grid sm:grid-cols-3 gap-3 text-[13px]">
          <div><div class="lbl">Live video streams</div><a href="#/wall" class="text-sky-700">Configure on the Stream Wall →</a></div>
          <label class="block"><span class="lbl">Port (GP_PORT)</span><input data-secret="GP_PORT" placeholder="${esc(s.secrets.GP_PORT || String(s.port))}" class="mt-1 w-full text-[13px] font-mono"/></label>
          <label class="block"><span class="lbl">Listen on (HOST)</span><select data-secret="HOST" class="mt-1 w-full text-[13px]"><option value="">unchanged (${esc(s.secrets.HOST || s.host)})</option><option value="127.0.0.1">127.0.0.1 — this computer only</option><option value="0.0.0.0">0.0.0.0 — whole network (set ADMIN_TOKEN!)</option></select></label></div>
        <button data-act="savesecrets" class="mt-3 px-3 py-1.5 rounded border border-slate-300 text-[13px]">Save server settings</button>`)}

      <div class="fixed bottom-9 left-0 right-0 z-30 pointer-events-none"><div class="max-w-[1200px] mx-auto px-4 md:pl-64 pointer-events-auto"><div class="card p-3 flex flex-wrap items-center gap-3 shadow-lg border-sky-300">
        <span class="text-[13px] text-slate-600">${s.supervised ? 'Sources, feeds and keys apply after a restart.' : 'Started without start.bat — after saving, close the server window and run start.bat to apply.'}</span><span class="flex-1"></span>
        <button data-act="save" class="px-4 py-2 rounded bg-sky-700 text-white text-[13px] font-semibold">Save integrations</button>
        ${s.supervised ? '<button data-act="saverestart" class="px-4 py-2 rounded bg-emerald-600 text-white text-[13px] font-semibold">Save &amp; restart server</button>' : ''}</div></div></div>
    </div>`;
    preview();
  }

  function feedRows() {
    const fstat = src('news').feeds || {};
    return feeds.map((f, i) => `<tr class="border-b border-slate-100" data-fi="${i}">
      <td class="px-2"><input type="checkbox" data-f="enabled" ${f.enabled !== false ? 'checked' : ''} class="w-4 h-4 accent-sky-600"/></td>
      <td class="px-2"><input data-f="name" value="${esc(f.name)}" class="w-full text-[12.5px]"/></td>
      <td class="px-2"><select data-f="country" class="text-[12.5px]">${state.meta.order.map((c) => `<option ${c === f.country ? 'selected' : ''}>${c}</option>`).join('')}</select></td>
      <td class="px-2"><input data-f="url" value="${esc(f.url)}" class="w-full text-[12px] font-mono min-w-[260px]"/>${f.terms ? `<div class="text-[10.5px] text-amber-700">${esc(f.terms)}</div>` : ''}</td>
      <td class="px-2"><input type="checkbox" data-f="filter" ${f.filter ? 'checked' : ''} class="w-4 h-4 accent-sky-600"/></td>
      <td class="px-2 font-mono text-[11px]">${fstat[f.id] ? (fstat[f.id].ok ? `<span class="text-green-700">${fstat[f.id].n} items</span>` : `<span class="text-red-600" title="${esc(fstat[f.id].error)}">error</span>`) : '<span class="text-slate-400">—</span>'}</td>
      <td class="px-2 text-right"><button data-delfeed="${i}" class="msi sm text-slate-400 hover:text-red-600">delete</button></td></tr>`).join('');
  }
  function readFeeds() {
    el.querySelectorAll('[data-fi]').forEach((tr) => { const f = feeds[+tr.dataset.fi]; tr.querySelectorAll('[data-f]').forEach((i) => { f[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.value.trim(); }); if (!f.id) f.id = (f.name || 'feed').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) + '-' + Math.random().toString(36).slice(2, 5); });
  }
  const v = (k) => { const i = el.querySelector(`[data-k="${k}"]`); return !i ? undefined : i.type === 'checkbox' ? i.checked : i.value.trim(); };
  const list = (x) => (!x || x === 'auto' ? 'auto' : x.split(',').map((y) => y.trim()).filter(Boolean));
  function buildLive() {
    readFeeds(); const q = {}; el.querySelectorAll('[data-gq]').forEach((i) => { q[i.dataset.gq] = i.value; });
    return {
      irev: { enabled: v('irev.enabled'), elections: list(v('irev.elections')), statsEverySec: +v('irev.statsEverySec') || 60, crawlEveryMin: +v('irev.crawlEveryMin') || 30, gapMs: +v('irev.gapMs') || 1200 },
      louisiana: { enabled: v('louisiana.enabled'), dates: list(v('louisiana.dates')) },
      democracyclub: { enabled: v('democracyclub.enabled'), days: +v('democracyclub.days') || 21 },
      vec: { mode: v('vec.mode') },
      news: { enabled: v('news.enabled'), gdelt: v('news.gdelt'), everyMin: +v('news.everyMin') || 10, feeds: feeds.map(({ id, name, country, url, filter, enabled, terms }) => ({ id, name, country, url, filter: !!filter, enabled: enabled !== false, ...(terms ? { terms } : {}) })), gdeltQueries: q },
    };
  }
  function preview() {
    const k = el.querySelector('#st-bm').value; const b = k === 'custom' ? { url: el.querySelector('#st-bmurl').value } : BASEMAPS[k];
    const img = el.querySelector('#st-bmprev');
    if (b && b.url) img.src = b.url.replace('{s}', 'a').replace('{z}', '3').replace('{x}', '4').replace('{y}', '3').replace('{r}', ''); else img.removeAttribute('src');
  }
  async function restart() {
    try { await api.post('/api/settings/restart'); } catch (e) { toast(e.message, 'red'); return; }
    toast('Server restarting — reconnecting…');
    const t0 = Date.now(); await new Promise((r) => setTimeout(r, 2500));
    for (;;) { try { await api.get('/api/ping'); break; } catch { if (Date.now() - t0 > 60000) { toast('Server did not come back — check the server window', 'red'); return; } await new Promise((r) => setTimeout(r, 1500)); } }
    location.reload();
  }

  el.addEventListener('change', async (e) => {
    if (e.target.name === 'mode') { await api.put('/api/settings', { mode: e.target.value }); toast(`Data mode: ${e.target.value}`, 'green'); setTimeout(() => location.reload(), 600); }
    if (e.target.id === 'st-bm' || e.target.id === 'st-bmurl') preview();
  });
  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    const df = e.target.closest('[data-delfeed]'); if (df) { readFeeds(); feeds.splice(+df.dataset.delfeed, 1); el.querySelector('#st-feeds').innerHTML = feedRows(); return; }
    const dp = e.target.closest('[data-delpoll]'); if (dp) { await api.del(`/api/polls/${dp.dataset.delpoll}`); polls = await api.get('/api/polls'); render(); return; }
    if (!a) return;
    try {
      if (a === 'addfeed') { readFeeds(); feeds.push({ id: '', name: 'New feed', country: state.country, url: '', filter: true, enabled: true }); el.querySelector('#st-feeds').innerHTML = feedRows(); }
      if (a === 'resetfeeds') { feeds = s.defaults.feeds.map((f) => ({ enabled: true, ...f })); el.querySelector('#st-feeds').innerHTML = feedRows(); }
      if (a === 'save' || a === 'saverestart') { const r = await api.put('/api/settings', { live: buildLive() }); toast('Integrations saved', 'green'); if (a === 'saverestart') await restart(); else if (r.restartNeeded) toast(s.supervised ? 'Click “Save & restart server” to apply' : 'Restart the server (start.bat) to apply'); }
      if (a === 'savesecrets') {
        const patch = {}; el.querySelectorAll('[data-secret]').forEach((i) => { const val = i.value.trim(); if (val === '-') patch[i.dataset.secret] = ''; else if (val) patch[i.dataset.secret] = val; });
        if (!Object.keys(patch).length) { toast('Nothing to save'); return; }
        const r = await api.put('/api/settings/secrets', patch); s.secrets = r.secrets; toast('Saved to .env — restart to apply', 'green'); render();
      }
      if (a === 'savemap') { const map = { basemap: el.querySelector('#st-bm').value, customUrl: el.querySelector('#st-bmurl').value, customAttribution: el.querySelector('#st-bmatt').value }; await api.put('/api/settings', { map }); state.meta.map = map; toast('Map settings saved', 'green'); }
      if (a === 'deldemo') { for (const p of polls.filter((x) => x.demo)) await api.del(`/api/polls/${p.id}`); polls = await api.get('/api/polls'); toast('Demo polls removed', 'green'); render(); }
      if (a === 'adddeclared') {
        const date = el.querySelector('#dr-date').value; const summary = el.querySelector('#dr-rows').value.split('\n').map((l) => l.split(',').map((x) => x.trim())).filter((r) => r.length >= 3 && r[0]).map(([n, p, v]) => [n, p, Number(String(v).replace(/[^0-9]/g, ''))]);
        if (!date || summary.length < 2) { toast('Enter the date and at least two candidates (Name, PARTY, votes)', 'red'); return; }
        await api.post('/api/declared', { type: el.querySelector('#dr-type').value, year: +date.slice(0, 4), state: el.querySelector('#dr-state').value, date, source: el.querySelector('#dr-src').value, summary });
        toast('Declared result added — reload the page to see it under that year', 'green'); el.querySelector('#dr-rows').value = '';
      }
      if (a === 'addpoll') {
        const shares = Object.fromEntries(el.querySelector('#pl-s').value.split(',').map((x) => x.split('=').map((y) => y.trim())).filter((x) => x[0] && x[1]).map(([k, val]) => [k.toUpperCase(), Number(val)]));
        await api.post('/api/polls', { country: el.querySelector('#pl-c').value, pollster: el.querySelector('#pl-p').value, fieldEnd: el.querySelector('#pl-d').value, sample: +el.querySelector('#pl-n').value, mode: 'other', shares, source: el.querySelector('#pl-u').value });
        polls = await api.get('/api/polls'); toast('Poll added', 'green'); render();
      }
    } catch (err) { toast(err.message, 'red'); }
  });

  load();
  return { update(kind) { if (kind === 'live' && s) { const tb = el.querySelector('#st-feeds'); if (tb && !el.contains(document.activeElement)) { /* keep edits */ } } } };
}
