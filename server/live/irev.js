// INEC IReV adapter (Nigeria). Uses the same public JSON endpoints the IReV
// website calls. IReV publishes polling-unit RESULT SHEET IMAGES (Form EC8A),
// not vote numbers, so this tracks: real geography (LGA › ward › PU), upload
// progress per unit, and the link to each sheet image.
// By using IReV you accept INEC's terms of use (shown on the portal).
import { getJson } from './http.js';

const API = 'https://dolphin-app-sleqh.ondigitalocean.app/api/v1';
const PORTAL = 'https://www.inecelectionresults.ng';
const TRACK_TYPES = new Set(['PRES', 'GOV']);

export function startIrev(hub, cfg = {}) {
  const opt = { enabled: true, elections: 'auto', statsEverySec: 60, crawlEveryMin: 30, gapMs: 1200, maxAuto: 3, ...cfg };
  hub.source({ id: 'irev', name: 'INEC IReV', country: 'NGA', kind: 'results', docs: PORTAL, note: 'Public IReV endpoints: election structure, upload progress and result-sheet images (no vote numbers — sheets are images).', terms: 'INEC IReV terms of use apply.' });
  if (!opt.enabled) { hub.status('irev', { status: 'off' }); return; }
  const http = (p) => getJson(API + p, { gapMs: opt.gapMs, headers: { origin: PORTAL, referer: PORTAL + '/' }, timeout: 40000 });

  async function pickElections() {
    if (Array.isArray(opt.elections) && opt.elections.length) return opt.elections;
    const latest = await http('/elections/elections/latest');
    const rows = (latest.data || []).filter((e) => TRACK_TYPES.has(e.election_type?.code) || /presidential|governorship/i.test(e.full_name || ''));
    return rows.sort((a, b) => String(b.election_date).localeCompare(String(a.election_date))).slice(0, opt.maxAuto).map((e) => e._id);
  }

  const meta = new Map(); // electionId -> full_name etc.
  async function refreshStats(eid) {
    const s = (await http(`/elections/${eid}/result/stats`)).data || {};
    const t = hub.irev.get(eid) || { id: eid, lgas: [], crawledWards: 0, totalWards: 0 };
    const lat = s.latest || null;
    Object.assign(t, {
      name: t.name || meta.get(eid)?.full_name || lat?.election?.full_name || eid,
      date: t.date || meta.get(eid)?.election_date || null,
      state: t.state || meta.get(eid)?.state?.name || null,
      expected: s.expected ?? s.pus ?? 0, uploaded: s.documents ?? 0,
      pct: (s.expected || s.pus) ? (s.documents || 0) / (s.expected || s.pus) : 0,
      latestUpload: lat ? { puCode: lat.pu_code, name: lat.name, at: lat.document?.updated_at || lat.updated_at, url: lat.document?.url || null } : null,
      portal: `${PORTAL}/elections/${eid}`, statsAt: new Date().toISOString(),
    });
    hub.setIrev(t);
    return t;
  }

  async function crawl(eid) {
    const t = hub.irev.get(eid);
    const res = await http(`/elections/${eid}/lga`);
    if (res.data?.[0]?.election?.full_name) { t.name = res.data[0].election.full_name; t.date = res.data[0].election.election_date; t.state = res.data[0].state?.name || t.state; }
    const prev = new Map(t.lgas.flatMap((l) => l.wards.map((w) => [w.id, w])));
    t.lgas = (res.data || []).map((l) => ({
      id: l.lga?._id, name: l.lga?.name, code: l.lga?.code,
      wards: (l.wards || []).map((w) => ({ id: w._id, name: w.name, code: w.code, ...(prev.get(w._id) ? { total: prev.get(w._id).total, uploaded: prev.get(w._id).uploaded, pus: prev.get(w._id).pus, fetchedAt: prev.get(w._id).fetchedAt } : { total: null, uploaded: null, pus: null }) })),
    })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    t.totalWards = t.lgas.reduce((a, l) => a + l.wards.length, 0);
    hub.setIrev(t);
    // wards with unknown or incomplete uploads first
    const queue = t.lgas.flatMap((l) => l.wards.map((w) => ({ l, w }))).sort((a, b) => (a.w.total == null ? -1 : a.w.uploaded < a.w.total ? 0 : 1) - (b.w.total == null ? -1 : b.w.uploaded < b.w.total ? 0 : 1));
    let done = 0;
    for (const { l, w } of queue) {
      if (w.total != null && w.uploaded >= w.total && w.fetchedAt) { done++; continue; } // complete wards are not re-fetched
      try {
        const r = await http(`/elections/${eid}/pus?ward=${w.id}`);
        w.pus = (r.data || []).map((p) => ({
          id: p._id, code: p.pu_code || p.polling_unit?.pu_code || p.code, name: p.name || p.polling_unit?.name,
          uploaded: !!p.document?.url, url: p.document?.url || null, at: p.document?.updated_at || null,
          supplements: (p.old_documents || []).length, zero: !!p.is_zero_pu,
        })).sort((a, b) => String(a.code).localeCompare(String(b.code)));
        w.total = w.pus.length; w.uploaded = w.pus.filter((p) => p.uploaded).length; w.fetchedAt = new Date().toISOString();
      } catch (e) { hub.status('irev', { status: 'error', lastError: `ward ${w.name}: ${e.message}` }); }
      done++;
      if (done % 20 === 0) { rollup(t, done); hub.setIrev(t); }
    }
    rollup(t, done); hub.setIrev(t);
  }
  function rollup(t, crawled) {
    for (const l of t.lgas) { l.total = l.wards.reduce((a, w) => a + (w.total || 0), 0); l.uploaded = l.wards.reduce((a, w) => a + (w.uploaded || 0), 0); l.crawled = l.wards.filter((w) => w.fetchedAt).length; }
    t.crawledWards = Math.max(t.crawledWards || 0, crawled); t.crawlAt = new Date().toISOString();
  }

  let ids = [];
  async function cycleStats() {
    try {
      if (!ids.length) {
        const latest = await http('/elections/elections/latest');
        for (const e of latest.data || []) meta.set(e._id, e);
        ids = await pickElections();
      }
      for (const id of ids) await refreshStats(id);
      hub.status('irev', { status: 'live', lastError: null, items: ids.length, detail: ids.map((id) => { const t = hub.irev.get(id); return `${t.name}: ${t.uploaded}/${t.expected}`; }).join(' · ') });
    } catch (e) { hub.status('irev', { status: 'error', lastError: e.message }); }
  }
  let crawling = false;
  async function cycleCrawl() {
    if (crawling || !ids.length) return; crawling = true;
    try { for (const id of ids) await crawl(id); } catch (e) { hub.status('irev', { status: 'error', lastError: `crawl: ${e.message}` }); }
    crawling = false;
  }
  cycleStats().then(cycleCrawl);
  setInterval(cycleStats, opt.statsEverySec * 1000).unref();
  setInterval(cycleCrawl, opt.crawlEveryMin * 60000).unref();
}
