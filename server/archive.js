// Year-by-year results archive. Every result is returned as a "contest" (the
// same shape the live sources produce), so Live Results and the map work the
// same for any year.
//   NGA — INEC declared results (presidential by state, governorship by LGA
//         or state total), bundled in server/data/declared-nga.json, plus the
//         list of IReV elections held that year.
//   USA — Louisiana Secretary of State, every election date in the year.
//   GBR — Democracy Club results, every Thursday in the year (UK polling day).
//   AUS / NZL — no free year-by-year feed; only live/test data.
// Past years are cached on disk for good; the current year refreshes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, getJson } from './live/http.js';
import { parseLouisiana } from './live/louisiana.js';
import { parseCsv, groupResults } from './live/democracyclub.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const yearOf = (d) => { const s = String(d || ''); const m = s.match(/(\d{4})/); return m ? +m[1] : null; };
const nowYear = () => new Date().getUTCFullYear();

// ---------------- Nigeria: INEC declared results ----------------
function loadDeclared(dataDir) {
  const files = [path.join(HERE, 'data', 'declared-nga.json'), path.join(dataDir, 'declared-user.json')];
  const out = [];
  for (const f of files) { try { if (fs.existsSync(f)) out.push(...JSON.parse(fs.readFileSync(f, 'utf8'))); } catch (e) { console.error('declared results load failed:', f, e.message); } }
  return out;
}

/** One declared election record → contests (overall + one per state/LGA). */
export function declaredToContests(r) {
  const office = r.type === 'PRES' ? 'Presidential' : 'Governorship';
  const where = r.type === 'PRES' ? 'Nigeria' : `${r.state} State`;
  const base = `NGA-${r.type}-${r.year}-${slug(r.state || 'national')}`;
  const title = `${office} election ${r.year} — ${where}`;
  const src = r.page ? `https://en.wikipedia.org/wiki/${encodeURIComponent(r.page.replace(/ /g, '_'))}${r.revid ? `?oldid=${r.revid}` : ''}` : null;
  const common = { country: 'NGA', source: 'declared', official: true, declared: true, office, officeType: r.type, date: r.date, year: r.year, electionId: base, electionTitle: title,
    reportingDone: 0, reportingTotal: 0, reportingLabel: '', url: src, check: r.check || null, sourceNote: r.sourceNote || 'INEC declared result, as compiled in Wikipedia (CC BY-SA). Later court rulings are not reflected.' };
  const sum = (r.summary || []).slice().sort((a, b) => b[2] - a[2]);
  const overall = { ...common, id: base, title, area: r.type === 'PRES' ? 'Nigeria' : r.state, level: r.type === 'PRES' ? 'national' : 'state', parent: null,
    choices: sum.map(([name, p, votes], i) => ({ name, party: p, partyCode: p, votes, elected: i === 0 ? true : null })) };
  const out = [overall];
  const A = r.areas;
  if (A && A.rows && A.rows.length) {
    const lvl = A.level === 'state' ? 'state' : 'lga';
    for (const row of A.rows) {
      const [area, ...vals] = row; const k = A.cands.length;
      const choices = A.cands.map(([name, p], i) => ({ name, party: p, partyCode: p, votes: vals[i] || 0 }));
      if (vals[k]) choices.push({ name: 'Others', party: '', partyCode: 'OTH', votes: vals[k] });
      choices.sort((a, b) => b.votes - a.votes);
      out.push({ ...common, id: `${base}-${slug(area)}`, title: `${title} · ${area}`, area: area.replace(/\s*\(.*\)$/, ''), level: lvl, parent: r.type === 'PRES' ? null : r.state, choices, ballots: vals[k + 1] || null });
    }
  }
  return out;
}

export function createArchive(dataDir, hub) {
  const dir = path.join(dataDir, 'archive'); fs.mkdirSync(dir, { recursive: true });
  let declared = loadDeclared(dataDir);
  const mem = new Map();
  const cacheFile = (k) => path.join(dir, `${k}.json`);
  async function cached(key, year, fn) {
    const ttl = year < nowYear() ? Infinity : 30 * 60000;
    const m = mem.get(key); if (m && Date.now() - m.at < ttl) return m.data;
    const f = cacheFile(key);
    if (fs.existsSync(f)) { const st = fs.statSync(f); if (Date.now() - st.mtimeMs < ttl) { const data = JSON.parse(fs.readFileSync(f, 'utf8')); mem.set(key, { at: st.mtimeMs, data }); return data; } }
    const data = await fn();
    try { fs.writeFileSync(f, JSON.stringify(data)); } catch { /* cache is optional */ }
    mem.set(key, { at: Date.now(), data }); return data;
  }

  // Louisiana: list of all election dates (shared cache)
  const LA = 'https://voterportal.sos.la.gov/ElectionResults/ElectionResults/Data?blob=';
  const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
  async function laDates() {
    const m = mem.get('la-dates'); if (m && Date.now() - m.at < 6 * 3600000) return m.data;
    const d = await getJson(LA + 'ElectionDates.htm'); const data = arr(d?.Dates?.Date);
    mem.set('la-dates', { at: Date.now(), data }); return data;
  }
  async function usa(year) {
    return cached(`usa-la-${year}`, year, async () => {
      const dates = (await laDates()).filter((e) => yearOf(e.ElectionDate) === year);
      const out = [];
      for (const e of dates) {
        const [m, d, y] = e.ElectionDate.split('/'); const key = `${y}${m}${d}`;
        try {
          const races = await getJson(`${LA}${key}/RacesCandidates_Multiparish.htm`, { gapMs: 800 }); const votes = await getJson(`${LA}${key}/Votes_Multiparish.htm`, { gapMs: 800 });
          out.push(...parseLouisiana(e.ElectionDate, races, votes, e.ResultsOfficial === '1').sort((a, b) => a.officeLevel - b.officeLevel).slice(0, 60));
        } catch (err) { out.push({ error: `${e.ElectionDate}: ${err.message}` }); }
      }
      return out;
    });
  }
  async function gbr(year) {
    return cached(`gbr-dc-${year}`, year, async () => {
      const out = []; const end = Math.min(Date.now(), Date.UTC(year, 11, 31));
      let d = new Date(Date.UTC(year, 0, 1)); while (d.getUTCDay() !== 4) d = new Date(d.getTime() + 86400000); // Thursdays
      for (; d.getTime() <= end; d = new Date(d.getTime() + 7 * 86400000)) {
        const day = d.toISOString().slice(0, 10);
        try { const csv = await get(`https://candidates.democracyclub.org.uk/data/export_csv/?election_date=${day}&field_group=results&format=csv`, { gapMs: 1200 }); out.push(...groupResults(parseCsv(csv))); }
        catch (err) { out.push({ error: `${day}: ${err.message}` }); }
      }
      return out;
    });
  }

  // IReV: elections held each year (presidential + governorship), for the year picker and links
  const IREV = 'https://dolphin-app-sleqh.ondigitalocean.app/api/v1/';
  const IREV_TYPES = { PRES: '5f129a04df41d910dcdc1d50', GOV: '5f129a04df41d910dcdc1d51' };
  async function irevList() {
    const m = mem.get('irev-list'); if (m && Date.now() - m.at < 3600000) return m.data;
    const out = [];
    for (const [code, id] of Object.entries(IREV_TYPES)) {
      try { const r = await getJson(`${IREV}elections?election_type=${id}`, { gapMs: 1200, headers: { origin: 'https://www.inecelectionresults.ng', referer: 'https://www.inecelectionresults.ng/' }, timeout: 40000 });
        for (const e of r.data || []) out.push({ id: e._id, type: code, name: e.full_name, date: String(e.election_date || '').slice(0, 10), year: yearOf(e.election_date), state: code === 'PRES' ? null : e.state?.name, portal: `https://www.inecelectionresults.ng/elections/${e._id}` }); }
      catch { /* offline: keep going */ }
    }
    if (out.length) mem.set('irev-list', { at: Date.now(), data: out });
    return out;
  }

  // never let a slow IReV hold up the page: wait at most 3 s, then use what we have (the fetch carries on)
  let irevPending = null;
  let irevFailedAt = 0;
  async function irevQuick() {
    const m = mem.get('irev-list'); if (m && Date.now() - m.at < 3600000) return m.data;
    if (irevPending || Date.now() - irevFailedAt < 10 * 60000) return m ? m.data : []; // fetch in flight or failed recently: don't wait
    irevPending = irevList().then((d) => { if (!d.length) irevFailedAt = Date.now(); return d; }).finally(() => { irevPending = null; });
    return Promise.race([irevPending, new Promise((r) => setTimeout(() => r(m ? m.data : []), 3000))]);
  }
  return {
    reload() { declared = loadDeclared(dataDir); },
    addDeclared(rec) {
      const f = path.join(dataDir, 'declared-user.json'); let cur = []; try { cur = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* new file */ }
      cur = cur.filter((x) => !(x.type === rec.type && x.year === rec.year && (x.state || null) === (rec.state || null))); cur.push(rec);
      fs.writeFileSync(f, JSON.stringify(cur, null, 1)); declared = loadDeclared(dataDir);
    },
    async years(country) {
      const ys = new Map(); const add = (y, what) => { if (!y) return; if (!ys.has(y)) ys.set(y, new Set()); ys.get(y).add(what); };
      for (const c of hub.contestList(country)) add(yearOf(c.date), 'live');
      if (country === 'NGA') { for (const r of declared) add(r.year, r.type === 'PRES' ? 'Presidential' : 'Governorship'); for (const e of await irevQuick()) add(e.year, 'IReV'); }
      if (country === 'USA') { try { for (const e of await Promise.race([laDates(), new Promise((_, j) => setTimeout(() => j(new Error('slow')), 5000))])) add(yearOf(e.ElectionDate), 'Louisiana'); } catch { /* offline or slow: retry next time */ } }
      if (country === 'GBR') for (let y = 2016; y <= nowYear(); y++) add(y, 'Democracy Club');
      add(nowYear(), 'current');
      return [...ys.entries()].sort((a, b) => b[0] - a[0]).map(([year, s]) => ({ year, sources: [...s].filter((x) => x !== 'current') }));
    },
    async contests(country, year) {
      const live = hub.contestList(country).filter((c) => yearOf(c.date) === year);
      let extra = []; const notes = []; let irev = [];
      if (country === 'NGA') {
        extra = declared.filter((r) => r.year === year).flatMap(declaredToContests);
        irev = (await irevQuick()).filter((e) => e.year === year);
        if (!extra.length) notes.push(`No declared results loaded for ${year}.`);
      }
      if (country === 'USA') { try { extra = await usa(year); } catch (e) { notes.push(`Louisiana: ${e.message}`); } notes.push('USA: Louisiana is the only state with a free results feed here; other states need the AP licence.'); }
      if (country === 'GBR') { try { extra = await gbr(year); } catch (e) { notes.push(`Democracy Club: ${e.message}`); } }
      if (country === 'AUS' || country === 'NZL') notes.push('No free year-by-year results feed is available for this country.');
      const errs = extra.filter((c) => c.error).map((c) => c.error); extra = extra.filter((c) => !c.error);
      if (errs.length) notes.push(`${errs.length} fetch error(s): ${errs.slice(0, 3).join('; ')}`);
      const seen = new Set(extra.map((c) => c.id));
      return { country, year, contests: [...extra, ...live.filter((c) => !seen.has(c.id))], irev, notes };
    },
  };
}
