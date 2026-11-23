// Global Polls — zero-dependency Node server (Node 18+).
// Serves the dashboard (public/), a REST API and a Server-Sent Events stream.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA, loadConfig, saveConfigPatch, writeEnv, maskedSecrets } from './config.js';
import { COUNTRIES, COUNTRY_ORDER } from './model/countries.js';
import { Store } from './model/store.js';
import { Ledger } from './ledger.js';
import { Simulation } from './sim.js';
import { JsonStore } from './jsonstore.js';
import { seedPolls, validatePoll, average } from './polls.js';
import { LiveHub } from './live/hub.js';
import { startLive } from './live/index.js';
import { DEFAULT_FEEDS, GDELT } from './live/news.js';
import { createGeo } from './geo.js';
import { createArchive } from './archive.js';
import { DEFAULT_STREAMS, resolveLive, channelBase } from './live/youtube.js';

const cfg = loadConfig();
fs.mkdirSync(DATA, { recursive: true });
// Mirror console output to data/server.log so startup problems can be diagnosed
const LOG = path.join(DATA, 'server.log');
try { fs.writeFileSync(LOG, `--- start ${new Date().toISOString()} · Node ${process.version} · ${process.platform} · ${ROOT}\n`); } catch { /* read-only folder */ }
for (const k of ['log', 'error']) { const orig = console[k].bind(console); console[k] = (...a) => { orig(...a); try { fs.appendFileSync(LOG, a.map(String).join(' ') + '\n'); } catch { /* ignore */ } }; }
process.on('uncaughtException', (e) => { console.error('CRASH:', e && e.stack || e); process.exit(1); });
const [major] = process.versions.node.split('.').map(Number);
if (major < 18) { console.error(`Node ${process.version} is too old — install Node 18 or newer from https://nodejs.org`); process.exit(1); }
const store = new Store();
const ledger = new Ledger(path.join(DATA, 'ledger.jsonl'));
const reports = new JsonStore(path.join(DATA, 'reports.json'), []);
const polls = new JsonStore(path.join(DATA, 'polls.json'), seedPolls());
const hub = new LiveHub(DATA);
const geo = createGeo(DATA);
const archive = createArchive(DATA, hub);
const geoReported = new Set();
const sim = new Simulation(store, ledger, cfg.sim);
sim.speed = cfg.sim.speed;
// Empty slots (old default) → preload real broadcasters' free YouTube live channels
let streams = Array.isArray(cfg.streams) && cfg.streams.some((s) => s.url) ? cfg.streams : DEFAULT_STREAMS;

// ---------------- SSE ----------------
const clients = new Set();
function send(res, event, data) { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
function broadcast(event, data) { for (const c of clients) send(c, event, data); }

const fmtN = (n) => Number(n || 0).toLocaleString('en-US');
const dateKey = (d) => { const t = Date.parse(/^\d{2}\/\d{2}\/\d{4}$/.test(d || '') ? d.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$1-$2') : d); return isNaN(t) ? 0 : t; };
// Headline of real data per country (used by cards, ticker and sidebar in live mode)
function liveSummary(code) {
  const srcs = hub.sourceList().filter((x) => x.country === code && x.kind === 'results');
  const status = srcs.some((x) => x.status === 'live') ? 'live' : srcs.some((x) => x.status === 'test') ? 'test' : srcs.some((x) => x.status === 'error') ? 'error' : 'none';
  if (code === 'NGA') {
    const t = [...hub.irev.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    if (!t) return { status, pct: 0, title: 'No tracked IReV election yet', detail: srcs.map((x) => x.lastError || x.note).join(' ') };
    return { status, source: 'INEC IReV', pct: t.pct || 0, metric: 'sheets uploaded', title: t.name, detail: `${fmtN(t.uploaded)} / ${fmtN(t.expected)} polling-unit result sheets`, updatedAt: t.statsAt, count: hub.irev.size, unit: 'tracked elections' };
  }
  const list = hub.contestList(code);
  if (!list.length) return { status, pct: 0, title: srcs.length ? 'No live results' : 'No source', detail: srcs.map((x) => x.lastError || x.note).join(' ') };
  const latest = Math.max(...list.map((c) => dateKey(c.date)));
  const set = list.filter((c) => dateKey(c.date) === latest).sort((a, b) => (a.officeLevel || 999) - (b.officeLevel || 999));
  const done = set.reduce((a, c) => a + (c.reportingDone || 0), 0); const total = set.reduce((a, c) => a + (c.reportingTotal || 0), 0);
  const top = set[0]; const tv = top.choices.reduce((a, x) => a + x.votes, 0); const lead = top.choices[0];
  return {
    status, source: srcs.find((x) => x.status === 'live' || x.status === 'test')?.name || 'live source', test: set.some((c) => c.test),
    pct: total ? done / total : 0, metric: set[0].reportingLabel || 'reporting', title: `${set.length} contest${set.length > 1 ? 's' : ''} · ${set[0].date}`,
    detail: lead ? `${top.title}: ${lead.name}${lead.party ? ` (${lead.party})` : ''} ${tv ? ((lead.votes / tv) * 100).toFixed(1) + '%' : '— no votes yet'}${lead.elected ? ' ✓' : ''}` : top.title,
    leaderCode: tv ? lead.partyCode : null, count: list.length, unit: 'live contests', updatedAt: set.map((c) => c.changedAt).sort().pop(),
  };
}

function summary() {
  return COUNTRY_ORDER.map((code) => {
    const root = store.get(code); const b = store.brief(root);
    const st = sim.c[code];
    const openInc = sim.incidents.filter((i) => i.country === code && i.status !== 'resolved');
    return {
      ...b, running: st.running && cfg.mode === 'simulation', election: COUNTRIES[code].election, live: liveSummary(code),
      openIncidents: openInc.length, highIncidents: openInc.filter((i) => i.severity === 'high').length,
      children: root.children.map((id) => { const c = store.brief(store.get(id)); return { id: c.id, name: c.name, code: c.code, pct: c.pct, leader: c.leader, marginPct: c.marginPct, status: c.status, turnout: c.turnout, disputed: c.disputed }; }),
    };
  });
}

// live data → browsers (throttled)
let livePending = false;
hub.on('change', () => {
  if (livePending) return; livePending = true;
  setTimeout(() => { livePending = false; broadcast('live', { contests: hub.contestList(), irev: hub.irevSummary(), sources: hub.sourceList() }); }, 3000);
});
hub.on('news', (items) => broadcast('news', items.slice(0, 60)));

// real wire events (live mode) — also recorded in the hash-chained ledger when a result is declared
const liveWire = []; let pendingWire = [];
hub.on('event', (e) => {
  const w = { id: `lw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, ts: new Date().toISOString(), simulated: false, live: true, ...e };
  if (e.ledger && !e.test) { const le = ledger.append('LIVE_RESULT', e.country, e.ref, e.ledger); w.ledgerSeq = le.seq; w.hash = le.hash; }
  delete w.ledger;
  liveWire.unshift(w); liveWire.length = Math.min(liveWire.length, 300); pendingWire.push(w);
});
function broadcastTick(out) {
  const live = cfg.mode !== 'simulation';
  broadcast('tick', { serverTs: Date.now(), mode: cfg.mode, summary: summary(), wire: live ? pendingWire.splice(0) : out.wire, posts: live ? [] : out.posts, incidents: live ? [] : out.incidents, velocity: live ? {} : sim.velocity(), ledgerHead: { seq: ledger.entries.length, hash: ledger.head } });
}
sim.on('tick', broadcastTick);
// one heartbeat drives both modes: simulation ticks only run in simulation mode
setInterval(() => { if (cfg.mode === 'simulation') sim.tick(); else broadcastTick({ wire: [], posts: [], incidents: [] }); }, cfg.sim.tickMs);

// ---------------- helpers ----------------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.csv': 'text/csv' };
function json(res, code, data) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); }
function csvOut(res, name, text) { res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"` }); res.end(text); }
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let b = ''; req.on('data', (c) => { b += c; if (b.length > limit) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { reject(new Error('invalid JSON')); } });
  });
}
const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
function isAdmin(req) { return cfg.adminToken ? req.headers['x-admin-token'] === cfg.adminToken : isLocal(req); }
const clean = (s, n = 1000) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

function nodePayload(n) {
  const def = COUNTRIES[n.country];
  return {
    node: { ...store.brief(n), detail: n.leaf ? { registered: n.registered, cast: n.cast, invalid: n.invalid, status: n.status } : null },
    ancestors: store.ancestors(n.id).map((a) => ({ id: a.id, name: a.name, levelName: a.levelName })),
    children: n.children.map((id) => store.brief(store.get(id))),
    parties: def.parties,
    incidents: sim.incidents.filter((i) => i.nodeId === n.id || i.nodeId.startsWith(n.id + '.')).slice(0, 30),
    reports: reports.items.filter((r) => r.nodeId === n.id || r.nodeId.startsWith(n.id + '.')).slice(-30).reverse(),
  };
}
function childrenCsv(n) {
  const def = COUNTRIES[n.country]; const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['id', 'name', 'level', 'units', 'reported', 'pct', 'registered', 'cast', 'turnout', 'status', ...def.parties.map((p) => p.code), 'provenance'];
  const rows = n.children.map((id) => { const b = store.brief(store.get(id)); return [b.id, b.name, b.levelName, b.leafCount, b.reported, (b.pct * 100).toFixed(1), b.registered, b.cast, (b.turnout * 100).toFixed(1), b.status, ...def.parties.map((p) => b.votes[p.code]), b.provenance.kind]; });
  return [head, ...rows].map((r) => r.map(q).join(',')).join('\n');
}

// simple per-IP rate limit for public crowd submissions
const hits = new Map();
function rateLimited(ip, max = 10, windowMs = 600_000) {
  const now = Date.now(); const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(ip, arr); return arr.length > max;
}

// ---------------- routes ----------------
async function api(req, res, url) {
  let mm0;
  const p = url.pathname; const qs = url.searchParams; const m = req.method;
  const country = qs.get('country') || undefined;

  if (p === '/api/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write('retry: 3000\n\n');
    const liveMode = cfg.mode !== 'simulation';
    send(res, 'hello', { serverTs: Date.now(), mode: cfg.mode, summary: summary(), wire: liveMode ? liveWire.slice(0, 80) : sim.wire.slice(0, 60), posts: liveMode ? [] : sim.posts.slice(0, 60), incidents: liveMode ? [] : sim.incidents.slice(0, 80), velocity: sim.velocity(), adapters: hub.sourceList(), live: { contests: hub.contestList(), irev: hub.irevSummary() }, news: hub.news.slice(0, 120), ledgerHead: { seq: ledger.entries.length, hash: ledger.head } });
    clients.add(res);
    const hb = setInterval(() => res.write(': hb\n\n'), 15000);
    req.on('close', () => { clearInterval(hb); clients.delete(res); });
    return;
  }
  if (p === '/api/meta') return json(res, 200, { mode: cfg.mode, map: cfg.map, countries: COUNTRIES, order: COUNTRY_ORDER, sim: { speed: sim.speed, tickMs: sim.tickMs }, admin: isAdmin(req), supervised: process.env.GP_SUPERVISED === '1', version: '0.4.0' });
  if (p === '/api/ping') return json(res, 200, { serverTs: Date.now() });
  if (p === '/api/summary') return json(res, 200, summary());
  if (p === '/api/adapters' || p === '/api/live/sources') return json(res, 200, hub.sourceList());
  // ---- settings (admin) ----
  if (p === '/api/settings' && m === 'GET') {
    if (!isAdmin(req)) return json(res, 403, { error: 'admin access required' });
    return json(res, 200, { mode: cfg.mode, map: cfg.map, sim: cfg.sim, live: cfg.live, port: cfg.port, host: cfg.host, defaults: { feeds: DEFAULT_FEEDS, gdelt: GDELT }, secrets: maskedSecrets(), supervised: process.env.GP_SUPERVISED === '1' });
  }
  if (p === '/api/settings' && m === 'PUT') {
    if (!isAdmin(req)) return json(res, 403, { error: 'admin access required' });
    const b = await readBody(req, 512 * 1024); const patch = {};
    if (b.mode && ['live', 'simulation'].includes(b.mode)) patch.mode = b.mode;
    if (b.map && typeof b.map === 'object') patch.map = { basemap: clean(b.map.basemap, 40) || 'esri-gray', customUrl: clean(b.map.customUrl, 300), customAttribution: clean(b.map.customAttribution, 200) };
    if (b.live && typeof b.live === 'object') patch.live = b.live;
    if (b.sim && typeof b.sim === 'object') patch.sim = { ...cfg.sim, ...Object.fromEntries(Object.entries(b.sim).filter(([k]) => ['tickMs', 'durationTicks', 'speed'].includes(k)).map(([k, v]) => [k, Number(v)])) };
    saveConfigPatch(patch);
    const modeChanged = patch.mode && patch.mode !== cfg.mode;
    Object.assign(cfg, patch);
    if (patch.sim) sim.speed = cfg.sim.speed;
    if (modeChanged) { console.log(`  Data mode → ${cfg.mode.toUpperCase()}`); broadcast('mode', { mode: cfg.mode }); }
    return json(res, 200, { ok: true, restartNeeded: !!(patch.live), mode: cfg.mode });
  }
  if (p === '/api/settings/secrets' && m === 'PUT') {
    if (!isAdmin(req)) return json(res, 403, { error: 'admin access required' });
    const b = await readBody(req); writeEnv(b); if ('ADMIN_TOKEN' in b) cfg.adminToken = process.env.ADMIN_TOKEN || '';
    return json(res, 200, { ok: true, secrets: maskedSecrets(), restartNeeded: true });
  }
  if (p === '/api/settings/restart' && m === 'POST') {
    if (!isAdmin(req)) return json(res, 403, { error: 'admin access required' });
    if (process.env.GP_SUPERVISED !== '1') return json(res, 409, { error: 'Started without start.bat — close the window and run start.bat to apply.' });
    json(res, 200, { ok: true }); hub.dirty = true; hub.persist(); console.log('  Restarting to apply settings…');
    setTimeout(() => process.exit(3), 300); return;
  }
  // ---- map boundaries (geoBoundaries, cached in data/geo) ----
  if ((mm0 = p.match(/^\/api\/geo\/(USA|NGA|AUS|GBR|NZL)\/(ADM1|ADM2)$/))) {
    try {
      const d = await geo.get(mm0[1], mm0[2], qs.get('parent') || null);
      if (mm0[2] === 'ADM1' && !geoReported.has(mm0[1])) {
        geoReported.add(mm0[1]);
        const root = store.get(mm0[1]); const lvl = mm0[1] === 'NGA' ? root.children.flatMap((z) => store.get(z).children) : root.children;
        geo.report(mm0[1], 'ADM1', lvl.map((id) => store.get(id).name).filter((n) => n !== 'Māori Electorates'));
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, max-age=3600' });
      return res.end(JSON.stringify(d));
    } catch (e) { console.log(`  [geo] ${mm0[1]}-${mm0[2]} failed: ${e.message}`); return json(res, 502, { error: `Boundary download failed: ${e.message}` }); }
  }
  // ---- live (real) data ----
  if (p === '/api/live/contests') return json(res, 200, hub.contestList(country));
  if (p === '/api/live/irev') return json(res, 200, hub.irevSummary());
  if ((mm0 = p.match(/^\/api\/live\/irev\/([^/]+)$/))) {
    const t = hub.irev.get(mm0[1]); if (!t) return json(res, 404, { error: 'unknown election' });
    return json(res, 200, { ...t, lgas: t.lgas.map((l) => ({ ...l, wards: l.wards.map(({ pus, ...w }) => w) })) });
  }
  if ((mm0 = p.match(/^\/api\/live\/irev\/([^/]+)\/ward\/([^/]+)$/))) {
    const t = hub.irev.get(mm0[1]); const w = t && t.lgas.flatMap((l) => l.wards.map((x) => ({ ...x, lga: l.name }))).find((x) => x.id === mm0[2]);
    return w ? json(res, 200, w) : json(res, 404, { error: 'unknown ward' });
  }
  if (p === '/api/news') {
    const q = (qs.get('q') || '').toLowerCase(); const src = qs.get('source');
    return json(res, 200, hub.news.filter((n) => (!country || n.country === country) && (!src || n.sourceId === src || n.via === src) && (!q || (n.title + ' ' + n.summary).toLowerCase().includes(q))).slice(0, +qs.get('limit') || 150));
  }

  let mm;
  if ((mm = p.match(/^\/api\/node\/([^/]+)(\/children\.csv)?$/))) {
    const n = store.get(decodeURIComponent(mm[1]));
    if (!n) return json(res, 404, { error: 'node not found' });
    if (mm[2]) return csvOut(res, `${n.id}-subreport.csv`, childrenCsv(n));
    const out = nodePayload(n);
    if (qs.get('grand') === '1') out.grandchildren = n.children.flatMap((id) => store.get(id).children.map((g) => store.brief(store.get(g))));
    return json(res, 200, out);
  }
  if (p === '/api/search') return json(res, 200, store.search(country, clean(qs.get('q'), 80)));
  if (p === '/api/wire') return json(res, 200, sim.wire.filter((w) => !country || w.country === country).slice(0, +qs.get('limit') || 100));
  if (p === '/api/posts') {
    const q = (qs.get('q') || '').toLowerCase(); const plat = qs.get('platform');
    return json(res, 200, sim.posts.filter((x) => (!country || x.country === country) && (!plat || x.platform === plat) && (!q || x.text.toLowerCase().includes(q) || x.path.toLowerCase().includes(q))).slice(0, +qs.get('limit') || 100));
  }
  if (p === '/api/incidents') {
    const sev = qs.get('severity'); const st = qs.get('status'); const q = (qs.get('q') || '').toLowerCase();
    const rows = sim.incidents.filter((i) => (!country || i.country === country) && (!sev || i.severity === sev) && (!st || i.status === st) && (!q || i.id.toLowerCase().includes(q) || i.path.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)));
    const all = sim.incidents.filter((i) => !country || i.country === country);
    const counts = { high: 0, medium: 0, low: 0, resolved: 0, open: 0 };
    for (const i of all) { if (i.status === 'resolved') counts.resolved++; else { counts.open++; counts[i.severity]++; } }
    return json(res, 200, { counts, total: rows.length, items: rows.slice(+qs.get('offset') || 0, (+qs.get('offset') || 0) + (+qs.get('limit') || 50)) });
  }
  if (p === '/api/ledger') return json(res, 200, ledger.list({ country, type: qs.get('type') || undefined, limit: +qs.get('limit') || 50, offset: +qs.get('offset') || 0, excludeSim: cfg.mode !== 'simulation' && qs.get('all') !== '1' }));
  if (p === '/api/ledger/verify') return json(res, 200, ledger.verify());
  if (p === '/api/ledger.csv') return csvOut(res, 'ledger.csv', ledger.csv());

  // ---- crowd reports ----
  if (p === '/api/reports' && m === 'GET') {
    const st = qs.get('status');
    return json(res, 200, reports.items.filter((r) => (!country || r.country === country) && (!st || r.status === st)).slice(-200).reverse());
  }
  if (p === '/api/reports' && m === 'POST') {
    if (rateLimited(req.socket.remoteAddress)) return json(res, 429, { error: 'too many reports, try later' });
    const b = await readBody(req);
    const n = store.get(clean(b.nodeId, 200));
    if (!n) return json(res, 400, { error: 'nodeId must be a valid location' });
    const text = clean(b.text, 1000);
    if (text.length < 10) return json(res, 400, { error: 'describe what you saw (10+ characters)' });
    const r = reports.add({
      id: `CR-${Date.now().toString(36).toUpperCase()}`, ts: new Date().toISOString(), country: n.country, nodeId: n.id,
      path: store.ancestors(n.id).slice(1).map((a) => a.name).concat(n.name).join(' › '),
      category: clean(b.category, 60) || 'Other', text, reporter: clean(b.reporter, 60) || 'anonymous',
      status: 'unverified', confirmations: 0, moderation: [],
    });
    broadcast('report', r);
    return json(res, 201, r);
  }
  if ((mm = p.match(/^\/api\/reports\/([^/]+)\/(confirm|verify|reject)$/)) && m === 'POST') {
    const r = reports.find(mm[1]); if (!r) return json(res, 404, { error: 'report not found' });
    const b = await readBody(req).catch(() => ({}));
    if (mm[2] === 'confirm') { r.confirmations++; }
    else {
      if (!isAdmin(req)) return json(res, 403, { error: 'moderator access required' });
      r.status = mm[2] === 'verify' ? 'verified' : 'rejected';
      r.moderation.push({ ts: new Date().toISOString(), action: r.status, note: clean(b.note, 300) });
      const le = ledger.append(r.status === 'verified' ? 'CROWD_VERIFIED' : 'CROWD_REJECTED', r.country, r.nodeId, { report: r.id, category: r.category, note: clean(b.note, 300) });
      r.ledgerSeq = le.seq;
      if (r.status === 'verified') broadcast('tick', { serverTs: Date.now(), summary: summary(), wire: [sim.addWire(r.country, 'CROWD', `Verified crowd report: ${r.category} — ${r.path}`, r.nodeId, { ledgerSeq: le.seq, simulated: false })], posts: [], incidents: [], velocity: sim.velocity(), ledgerHead: { seq: ledger.entries.length, hash: ledger.head } });
    }
    reports.save(); broadcast('report', r);
    return json(res, 200, r);
  }

  // ---- polls ----
  if (p === '/api/polls' && m === 'GET') return json(res, 200, polls.items.filter((x) => !country || x.country === country));
  if (p === '/api/polls/average') {
    if (country) return json(res, 200, average(polls.items, country));
    return json(res, 200, Object.fromEntries(COUNTRY_ORDER.map((c) => [c, average(polls.items, c)])));
  }
  if (p === '/api/polls' && m === 'POST') {
    if (!isAdmin(req)) return json(res, 403, { error: 'admin access required' });
    const b = await readBody(req);
    const poll = { id: `poll-${Date.now().toString(36)}`, country: b.country, pollster: clean(b.pollster, 80), fieldStart: clean(b.fieldStart, 10), fieldEnd: clean(b.fieldEnd, 10), sample: Number(b.sample), mode: clean(b.mode, 20) || 'other', shares: Object.fromEntries(Object.entries(b.shares || {}).map(([k, v]) => [k, Number(v)])), source: clean(b.source, 300), demo: false };
    const err = validatePoll(poll); if (err) return json(res, 400, { error: err });
    return json(res, 201, polls.add(poll));
  }
  if ((mm = p.match(/^\/api\/polls\/([^/]+)$/)) && m === 'DELETE') {
    if (!isAdmin(req)) return json(res, 403, { error: 'admin access required' });
    return json(res, polls.remove(mm[1]) ? 200 : 404, {});
  }

  // ---- streams ----
  // ---- year-by-year archive ----
  if (p === '/api/years') { const c = COUNTRIES[qs.get('country')] ? qs.get('country') : null; if (!c) return json(res, 400, { error: 'country required' }); return json(res, 200, await archive.years(c)); }
  if ((mm = p.match(/^\/api\/archive\/(USA|NGA|AUS|GBR|NZL)\/(\d{4})$/))) return json(res, 200, await archive.contests(mm[1], +mm[2]));
  if (p === '/api/declared' && m === 'POST') { // moderators: add an INEC declared result (e.g. a new governorship election)
    if (!isAdmin(req)) return json(res, 403, { error: 'admin access required' });
    const b = await readBody(req, 256 * 1024);
    if (!['PRES', 'GOV'].includes(b.type) || !/^\d{4}$/.test(String(b.year)) || !Array.isArray(b.summary) || b.summary.length < 2) return json(res, 400, { error: 'type (PRES/GOV), year and at least two [name, party, votes] rows are required' });
    const rec = { type: b.type, year: +b.year, state: b.type === 'GOV' ? clean(b.state, 40) : null, date: clean(b.date, 10), page: null, revid: null, sourceNote: clean(b.source, 300) || 'Entered by a moderator',
      summary: b.summary.slice(0, 40).map((r) => [clean(r[0], 80), clean(r[1], 10).toUpperCase(), Math.max(0, Math.round(Number(r[2]) || 0))]), areas: null };
    archive.addDeclared(rec); ledger.append('DECLARED_ENTERED', { type: rec.type, year: rec.year, state: rec.state });
    return json(res, 201, rec);
  }
  if (p === '/api/streams' && m === 'GET') return json(res, 200, streams);
  if (p === '/api/streams/defaults' && m === 'GET') return json(res, 200, DEFAULT_STREAMS);
  if (p === '/api/streams/resolve' && m === 'GET') {
    const u = url.searchParams.get('url') || '';
    if (!channelBase(u)) return json(res, 400, { error: 'Not a YouTube channel URL' });
    return json(res, 200, await resolveLive(u));
  }
  if (p === '/api/streams' && m === 'PUT') {
    if (!isAdmin(req)) return json(res, 403, { error: 'admin access required' });
    const b = await readBody(req);
    if (!Array.isArray(b)) return json(res, 400, { error: 'expected array' });
    streams = b.slice(0, 12).map((s, i) => ({ id: clean(s.id, 20) || `cam${i + 1}`, label: clean(s.label, 60), country: COUNTRIES[s.country] ? s.country : 'USA', type: ['youtube', 'iframe', 'video'].includes(s.type) ? s.type : 'youtube', url: clean(s.url, 500) }));
    saveConfigPatch({ streams });
    return json(res, 200, streams);
  }

  // ---- simulation controls ----
  if ((mm = p.match(/^\/api\/sim\/(pause|resume|reset|speed)$/)) && m === 'POST') {
    if (!isAdmin(req)) return json(res, 403, { error: 'admin access required' });
    const codes = country ? [country] : COUNTRY_ORDER;
    if (mm[1] === 'speed') { const b = await readBody(req); sim.speed = Math.min(20, Math.max(0.25, Number(b.speed) || 1)); }
    for (const c of codes) {
      if (!sim.c[c]) continue;
      if (mm[1] === 'pause') sim.c[c].running = false;
      if (mm[1] === 'resume') sim.c[c].running = true;
      if (mm[1] === 'reset') sim.resetCountry(c);
    }
    broadcast('tick', { serverTs: Date.now(), summary: summary(), wire: [], posts: [], incidents: [], velocity: sim.velocity(), ledgerHead: { seq: ledger.entries.length, hash: ledger.head } });
    return json(res, 200, { speed: sim.speed, running: Object.fromEntries(COUNTRY_ORDER.map((c) => [c, sim.c[c].running])) });
  }
  return json(res, 404, { error: 'not found' });
}

const PUB = path.join(ROOT, 'public');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let f = path.normalize(path.join(PUB, decodeURIComponent(url.pathname)));
    if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, 'index.html'); // SPA fallback
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    if (!res.headersSent) json(res, 400, { error: e.message }); else res.end();
  }
});

// Listen on the configured port. If it is busy (EADDRINUSE) or reserved by
// Windows (EACCES — Hyper-V/WSL excluded port ranges), try other ports.
const CANDIDATES = [cfg.port, cfg.port + 1, cfg.port + 2, 3000, 5000, 8000, 8090, 8888, 9090, 7777, 0];
let ci = 0; let port = CANDIDATES[0];
server.on('error', (e) => {
  if ((e.code === 'EADDRINUSE' || e.code === 'EACCES' || e.code === 'EPERM') && ci < CANDIDATES.length - 1) {
    console.log(`  Port ${port} unavailable (${e.code}) — trying another…`);
    port = CANDIDATES[++ci]; server.listen(port, cfg.host);
  } else { console.error('  Server error:', e.code || '', e.message); process.exit(1); }
});
server.on('listening', async () => {
  port = server.address().port;
  const url = `http://127.0.0.1:${port}`;
  try { fs.writeFileSync(path.join(DATA, 'url.txt'), url); } catch { /* ignore */ }
  console.log(`\n  Global Polls running → ${url}`);
  console.log(`  Mode: ${cfg.mode === 'simulation' ? 'SIMULATION — synthetic demo data (Live Results and News stay real)' : 'LIVE — real public sources only'}. Ledger: ${ledger.entries.length} entries.`);
  console.log('  Keep this window open. Press Ctrl+C to stop.\n');
  startLive(hub, cfg.live || {});
  if (process.env.OPEN_BROWSER === '1') {
    const { exec } = await import('node:child_process');
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
});
server.listen(port, cfg.host);
