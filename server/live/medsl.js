// MIT Election Data and Science Lab (MEDSL) — US federal results 1976 onward,
// turned into dashboard contests by year and office. Licence: CC0 1.0.
//   President 1976–2024, state level   Harvard Dataverse doi:10.7910/DVN/42MVDX
//   Senate    1976–2024, state level   Harvard Dataverse doi:10.7910/DVN/PEJ5QU
//   House     1976–2018, district      MEDSL constituency-returns (GitHub, public)
// (The Dataverse House file 1976–2024 sits behind a guestbook form; House
//  2020–2024 comes from Election.org instead. If you download that file yourself
//  and save it as data/medsl/1976-2024-house.csv, it is used automatically.)
// Files are downloaded once and cached in data/medsl/ (refreshed every 30 days).
import fs from 'node:fs';
import path from 'node:path';
import { get } from './http.js';

const FILES = {
  president: { url: 'https://dataverse.harvard.edu/api/access/datafile/13887042', doi: 'https://doi.org/10.7910/DVN/42MVDX', label: 'MIT Election Data and Science Lab, "U.S. President 1976–2024", Harvard Dataverse (CC0)' },
  senate: { url: 'https://dataverse.harvard.edu/api/access/datafile/13887039?format=original', doi: 'https://doi.org/10.7910/DVN/PEJ5QU', label: 'MIT Election Data and Science Lab, "U.S. Senate statewide 1976–2024", Harvard Dataverse (CC0)' },
  house: { url: 'https://raw.githubusercontent.com/MEDSL/constituency-returns/master/1976-2018-house.csv', doi: 'https://doi.org/10.7910/DVN/IG0UN2', label: 'MIT Election Data and Science Lab, U.S. House returns 1976–2018 (CC0)' },
};
export const MEDSL_FIRST_YEAR = 1976;
const HOUSE_2024_FILE_ID = 13592823; // MEDSL "U.S. House 1976–2024" (doi:10.7910/DVN/IG0UN2)

/** RFC-4180 CSV → array of objects (quoted fields, "" escapes, embedded commas/newlines). */
export function parseCsv(text) {
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; }
    if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const title = (s) => String(s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bOf\b/g, 'of').replace(/^Dc$|District Of Columbia/i, 'District of Columbia');
const NOT_CANDIDATE = /^(undervotes?|overvotes?|blank( vote)?s?|scattering|void|none of these candidates|other|na|n\/a|scatter|scattered|write-?ins? \(scatter\w*\))$/i;
const truthy = (v) => /^true$/i.test(String(v || ''));
function party(p) {
  const s = String(p || '').toLowerCase();
  if (/^democrat|democratic|^dfl|farmer.?labor/.test(s)) return ['DEM', 'Democratic'];
  if (/^republican|^gop|^independent-republican/.test(s)) return ['GOP', 'Republican']; // Minnesota's GOP was the "Independent-Republicans" until 1995
  if (s === 'na' || s === 'none') return ['OTH', ''];
  if (/libertarian/.test(s)) return ['OTH', 'Libertarian']; if (/green/.test(s)) return ['OTH', 'Green'];
  if (/independent/.test(s) || !s) return ['OTH', s ? 'Independent' : '']; return ['OTH', title(s)];
}
// Merge a contest's rows into one entry per candidate (New York fusion lines, vote modes), biggest first.
function choicesOf(rows) {
  const by = new Map();
  for (const r of rows) {
    const name = String(r.candidate || '').trim(); if (!name || NOT_CANDIDATE.test(name)) continue;
    const wi = truthy(r.writein) && !/[a-z]/i.test(name.replace(/write-?in/i, '')) ; const key = wi ? 'WRITE-INS' : name.toUpperCase();
    const v = Math.round(Number(r.candidatevotes) || 0);
    const simp = String(r.party_simplified || '').toUpperCase(); let [code, pname] = party(simp && simp !== 'OTHER' ? r.party_simplified : (r.party_detailed || r.party_simplified || r.party)); if (!pname && wi === false && truthy(r.writein)) pname = 'Write-in';
    const nice = personName(name);
    const e = by.get(key) || { name: wi ? 'Write-ins' : nice, votes: 0, parties: [] };
    e.votes += v; if (pname) e.parties.push([code, pname, v]); by.set(key, e);
  }
  return [...by.values()].map((e) => { const lines = new Map(); for (const [c, n, v] of e.parties) { const k = `${c}|${n}`; lines.set(k, (lines.get(k) || 0) + v); }
    // party = the major-party line that brought the most votes (Pennsylvania cross-filers like Shuster won both the R and D lines)
    const ranked = [...lines.entries()].map(([k, v]) => [...k.split('|'), v]).sort((a, b) => (a[0] === 'OTH') - (b[0] === 'OTH') || b[2] - a[2]);
    const major = ranked[0] || ['OTH', '']; return { name: e.name, party: major[1], partyCode: major[0], votes: e.votes }; })
    .filter((x, _i, all) => x.votes > 0 || (!all.some((y) => y.votes > 0) && x.name !== 'Write-ins')).sort((a, b) => b.votes - a.votes);
}
// Known party-label errors in the MEDSL files, found by reconciling each year's totals with the House Clerk's
// official statistics. Most are cross-filed candidates (Pennsylvania and Massachusetts let a candidate win both
// parties' nominations) recorded on the other party's line.
const PARTY_FIX = { '1982|MA|1|CONTE': 'GOP', '1984|PA|6|YATRON': 'DEM', '1994|PA|5|CLINGER': 'GOP', '1994|PA|9|SHUSTER': 'GOP' };
// Members who changed party: their later label must not be applied backwards to an uncontested race.
const NO_FIX = new Set(['1982|FL|10|IRELAND']);
// Results that were never certified.
const NOT_CERTIFIED = { '2018|NC|9': 'Not certified: the North Carolina State Board of Elections ordered a new election (held September 2019) after an absentee-ballot fraud investigation, so the seat was vacant when the 116th Congress began.' };
const surname = (name) => String(name).replace(/\s+(Jr|Sr)\.?$|\s+(II|III|IV)$/i, '').replace(/,.*$/, '').trim().split(/\s+/).pop().toUpperCase();
function fixParty(year, po, dist, ch, hist) {
  for (const x of ch) { const f = PARTY_FIX[`${year}|${po}|${+dist}|${surname(x.name)}`];
    if (f) { x.partyCode = f; x.party = f === 'GOP' ? 'Republican' : 'Democratic'; x.note = "Party corrected to the House Clerk record (the source file lists the other party's line)"; } }
  // A winner listed without an opponent (or sharing a label with an opponent, or with no major label) whose every
  // contested race in the file carries the other major party is a labelling error in the file: the usual case is a
  // Pennsylvania cross-filer who won both primaries and appears only on one line.
  const w = ch.find((x) => x.elected) || ch[0]; if (!w || w.note || !hist || NO_FIX.has(`${year}|${po}|${+dist}|${surname(w.name)}`)) return;
  const h = hist.get(`${po}|${+dist}|${surname(w.name)}`); if (!h) return;
  const [[best, n] = [], ...others] = Object.entries(h).sort((a, b) => b[1] - a[1]);
  if (!best || n < (w.party ? 2 : 1) || others.length || best === w.partyCode) return;
  const contested = ch.some((x) => x !== w && x.partyCode === w.partyCode) || w.partyCode === 'OTH' || !ch.some((x) => x !== w && x.partyCode !== 'OTH');
  if (!contested) return;
  const was = w.party || 'no party'; w.partyCode = best; w.party = best === 'GOP' ? 'Republican' : 'Democratic';
  w.note = `Listed in the source file as ${was}; counted as ${w.party}, the party of every contested race this member ran in (House Clerk records agree for the cases checked).`;
}
// "BIDEN, JOSEPH R. JR" → "Joseph R. Biden Jr."; "ALLAN NORWITZ" → "Allan Norwitz"
function personName(raw) {
  let n = String(raw).replace(/"+/g, '"').trim(); const sx = n.match(/^(.+?),?\s+(JR|SR|II|III|IV)\.?$/i); const m = sx && !/,/.test(sx[1]) ? null : n.match(/^([^,]+),\s*(.+)$/); if (sx && !m) n = `${sx[1]} ${sx[2]}`;
  if (m) { let rest = m[2]; let suf = ''; const lead = rest.match(/^(JR|SR|II|III|IV)\.?,?\s+/i); if (lead) { suf = lead[1]; rest = rest.slice(lead[0].length); } const sm = !suf && rest.match(/,?\s+(JR|SR|II|III|IV)\.?$/i); if (sm) { suf = sm[1]; rest = rest.slice(0, sm.index); } n = `${rest} ${m[1]}${suf ? ` ${suf}` : ''}`; }
  return title(n).replace(/\b(Jr|Sr)\b\.?/g, '$1.').replace(/\b(Ii|Iii|Iv)\b/g, (x) => x.toUpperCase()).replace(/\bMc([a-z])/g, (x, c) => `Mc${c.toUpperCase()}`);
}
// keep one vote mode: "total" rows when a contest has them, otherwise all modes summed
const oneMode = (rows) => (rows.some((r) => /^total$/i.test(r.mode || '')) ? rows.filter((r) => /^total$/i.test(r.mode || '')) : rows);

export function createMedsl(dataDir) {
  const dir = path.join(dataDir, 'medsl'); fs.mkdirSync(dir, { recursive: true });
  const mem = {};
  // The 1976–2024 House file sits behind a Dataverse guestbook. With a Dataverse API token in .env
  // (DATAVERSE_API_TOKEN, never in code or chat) the server downloads it once and keeps it.
  let dvTried = 0; let dvError = '';
  async function dataverseHouse() {
    const token = process.env.DATAVERSE_API_TOKEN; const dest = path.join(dir, '1976-2024-house.csv');
    if (!token || fs.existsSync(dest) || Date.now() - dvTried < 6 * 3600000) return; dvTried = Date.now();
    const url = `https://dataverse.harvard.edu/api/access/datafile/${HOUSE_2024_FILE_ID}?format=original`;
    const headers = { 'X-Dataverse-key': token, 'user-agent': 'GlobalElectoralPulse/0.5 (+local dashboard)' };
    try {
      let r = await fetch(url, { headers, signal: AbortSignal.timeout(180000) });
      if (!r.ok) { // guestbook-protected files accept a guestbook response posted with the request (Dataverse 6.x)
        const first = `${r.status} ${(await r.text()).slice(0, 200)}`;
        r = await fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ guestbookResponse: { answers: [] } }), signal: AbortSignal.timeout(180000) });
        if (!r.ok) throw new Error(`GET ${first}; POST ${r.status} ${(await r.text()).slice(0, 200)}`);
      }
      const text = await r.text(); if (!/^\s*"?year"?,/i.test(text)) throw new Error('unexpected file format (not the CSV)');
      fs.writeFileSync(dest, text); dvError = ''; delete mem.house; delete hists.house; console.log(`[medsl] downloaded the 1976–2024 House file (${Math.round(text.length / 1e6)} MB) from Harvard Dataverse`);
    } catch (e) { dvError = e.message.replace(token, '***'); console.warn(`[medsl] Dataverse House download failed: ${dvError}`); }
  }
  async function file(kind) {
    if (kind === 'house') await dataverseHouse();
    if (mem[kind]) return mem[kind];
    const local = path.join(dir, kind === 'house' && fs.existsSync(path.join(dir, '1976-2024-house.csv')) ? '1976-2024-house.csv' : `${kind}.csv`);
    if (kind === 'house' && local.endsWith('1976-2024-house.csv')) FILES.house = { ...FILES.house, url: `https://dataverse.harvard.edu/file.xhtml?fileId=${HOUSE_2024_FILE_ID}`, label: 'MIT Election Data and Science Lab, "U.S. House 1976–2024", Harvard Dataverse (CC0)' };
    let text = null;
    if (fs.existsSync(local) && Date.now() - fs.statSync(local).mtimeMs < 30 * 86400000) text = fs.readFileSync(local, 'utf8');
    else {
      try { text = await get(FILES[kind].url, { timeout: 120000, gapMs: 500, retries: 1 }); if (!/^\s*"?year"?,/i.test(text)) throw new Error('unexpected file format'); fs.writeFileSync(path.join(dir, `${kind}.csv`), text); }
      catch (e) { if (fs.existsSync(local)) text = fs.readFileSync(local, 'utf8'); else throw new Error(`MEDSL ${kind}: ${e.message}`); }
    }
    const byYear = new Map();
    for (const r of parseCsv(text)) { const y = +r.year; if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(r); }
    mem[kind] = byYear; return byYear;
  }

  const hists = {};
  async function history(kind) { // state|district|surname → { DEM: races, GOP: races } over contested regular general elections in every year
    if (hists[kind]) return hists[kind]; const all = await file(kind); const h = new Map();
    for (const rows of all.values()) { const g = new Map();
      for (const r of rows) { if (!/^gen/i.test(r.stage || 'gen') || truthy(r.special) || truthy(r.runoff)) continue; const k = `${r.state_po}|${r.district}`; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
      for (const rs of g.values()) { const ch = choicesOf(oneMode(rs)); if (!ch.some((x) => x.partyCode === 'DEM') || !ch.some((x) => x.partyCode === 'GOP')) continue;
        if (ch.filter((x) => x.partyCode === 'DEM').length > 1 || ch.filter((x) => x.partyCode === 'GOP').length > 1) continue;
        for (const x of ch) { if (x.partyCode === 'OTH') continue; const k = `${rs[0].state_po}|${+rs[0].district}|${surname(x.name)}`; const e = h.get(k) || {}; e[x.partyCode] = (e[x.partyCode] || 0) + 1; h.set(k, e); } } }
    hists[kind] = h; return h;
  }

  const common = (year, office, officeType, eid, etitle, src) => ({ country: 'USA', source: 'medsl', official: true, declared: true, office, officeType, year, date: `${year}-11`, electionId: eid, electionTitle: etitle, reportingDone: 0, reportingTotal: 0, reportingLabel: '', url: FILES[src].doi, sourceNote: `${FILES[src].label}. Final certified returns as compiled by MEDSL.` });

  async function president(year) {
    const rows = (await file('president')).get(year) || []; if (!rows.length) return [];
    const eid = `USA-MEDSL-${year}-PRES`; const t = `${year} U.S. presidential election`; const c0 = common(year, 'President', 'PRES', eid, t, 'president');
    const byState = new Map(); for (const r of rows) { if (!byState.has(r.state)) byState.set(r.state, []); byState.get(r.state).push(r); }
    const states = [...byState.entries()].map(([st, rs]) => { const ch = choicesOf(rs); if (ch[0]) ch[0].elected = true; // statewide plurality carries the state (ME/NE split electoral votes by district)
      return { ...c0, id: `${eid}-${rs[0].state_po}`, title: `${t} · ${title(st)}`, area: title(st), level: 'state', parent: null, choices: ch, ballots: Math.round(Number(rs[0].totalvotes) || 0) || null }; });
    const nat = new Map();
    for (const s of states) s.choices.forEach((x, i) => { const k = `${x.name}|${x.partyCode}`; const e = nat.get(k) || { ...x, votes: 0, states: 0 }; e.votes += x.votes; if (i === 0) { e.states++; if (/District of Columbia/.test(s.area)) e.dc = true; } nat.set(k, e); });
    const top = [...nat.values()].sort((a, b) => b.votes - a.votes).slice(0, 6);
    return [{ ...c0, id: eid, title: `${t} — national popular vote and states carried`, area: 'United States', level: 'national', parent: null,
      choices: top.map((e) => ({ name: `${e.name}${e.states ? ` — carried ${e.dc ? `${e.states} (${e.states - 1} state${e.states === 2 ? '' : 's'} + DC)` : `${e.states} state${e.states === 1 ? '' : 's'}`}` : ''}`, party: e.party, partyCode: e.partyCode, votes: e.votes, elected: null })) }, ...states];
  }

  async function seats(kind, year) { // Senate (statewide) or House (district) races, plus state and national roll-ups
    const rows = (await file(kind)).get(year) || []; if (!rows.length) return [];
    const sen = kind === 'senate'; const ot = sen ? 'SEN' : 'HOUSE'; const office = sen ? 'U.S. Senate' : 'U.S. House';
    const eid = `USA-MEDSL-${year}-${ot}`; const t = `${year} ${office} elections`; const c0 = common(year, office, ot, eid, t, kind);
    const groups = new Map(); const hist = sen ? null : await history(kind);
    // Districts whose November contest was an all-party special "open" election (Texas 1996 after court-ordered redistricting)
    // are coded stage "pri" + special; they stand in for the general election where no regular general exists.
    const hasGen = new Set(rows.filter((r) => /^gen/i.test(r.stage || 'gen') && !truthy(r.special) && !truthy(r.runoff)).map((r) => `${r.state_po}|${sen ? 'S' : r.district}`));
    for (const r of rows) { let stage = String(r.stage || 'gen').toLowerCase();
      if (!sen && truthy(r.special) && /^(pri|gen)/.test(stage) && !truthy(r.runoff) && !hasGen.has(`${r.state_po}|${r.district}`)) { r.special = 'FALSE'; stage = 'gen'; }
      if (!/^(gen|runoff)/.test(stage) && !truthy(r.runoff)) continue;
      const k = [r.state_po, sen ? 'S' : r.district, truthy(r.special) ? 'special' : '', truthy(r.runoff) || /runoff/.test(stage) ? 'runoff' : 'gen'].join('|'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    const races = [];
    for (const [k, rs] of groups) {
      const [po, dist, special, stage] = k.split('|'); const hasRunoff = stage === 'gen' && groups.has([po, dist, special, 'runoff'].join('|'));
      const ch = choicesOf(oneMode(rs)); if (!ch.length) continue; if (!sen) { if (!hasRunoff) ch[0].elected = true; fixParty(year, po, dist, ch, hist); } const nc = !sen && !special && NOT_CERTIFIED[`${year}|${po}|${+dist}`]; if (nc) ch.forEach((x) => { x.elected = false; }); const unopposed = ch.length === 1 && ch[0].votes <= 1;
      const tot = ch.reduce((a, x) => a + x.votes, 0); if (!hasRunoff && !nc && ch[0]) ch[0].elected = true; // the runoff decides where one was held
      const st = title(rs[0].state); const d = String(dist).replace(/^0+(?=\d)/, '');
      const label = sen ? `${st}${special ? ' (special)' : ''}${stage === 'runoff' ? ' — runoff' : ''}` : `${st} — ${d === '0' ? 'at-large' : `District ${d}`}${special ? ' (special)' : ''}${stage === 'runoff' ? ' — runoff' : ''}`;
      races.push({ ...c0, id: `${eid}-${k.replace(/\|/g, '-')}`, title: `${t.replace(' elections', '')} · ${label}`, area: sen ? st : `${st} — ${d === '0' ? 'at-large' : `District ${d}`}`, level: sen ? 'state' : 'district', parent: st, choices: ch, ballots: tot, decided: !hasRunoff && !nc, special: !!special, ...(nc ? { note: nc } : unopposed ? { note: 'Unopposed — the state did not print this race on the ballot, so no votes were counted.' } : {}) });
    }
    const roll = (list, id, rt, area, level) => {
      const by = new Map(); for (const c of list) { const w = c.choices.find((x) => x.elected); if (!w) continue; const k2 = w.partyCode === 'OTH' ? `OTH:${w.party}` : w.partyCode; const e = by.get(k2) || { party: w.partyCode === 'DEM' ? 'Democratic' : w.partyCode === 'GOP' ? 'Republican' : w.party || 'Other', partyCode: w.partyCode, n: 0, votes: 0 }; e.n++; by.set(k2, e); }
      for (const c of list) for (const x of c.choices) { const k2 = x.partyCode === 'OTH' ? `OTH:${x.party}` : x.partyCode; if (by.has(k2)) by.get(k2).votes += x.votes; }
      const ch = [...by.values()].sort((a, b) => b.n - a.n || b.votes - a.votes).map((e) => ({ name: `${e.party} — ${e.n} ${e.n === 1 ? 'race' : 'races'} won`, party: e.party, partyCode: e.partyCode, votes: e.votes, seats: e.n, elected: null }));
      if (level === 'state' && ch[0] && (!ch[1] || ch[0].seats > ch[1].seats)) ch[0].elected = true; // majority of the state's delegation (colours the map)
      return { ...c0, id, title: rt, area, level, parent: null, choices: ch };
    };
    const seatRaces = sen ? races : races.filter((c) => !c.special); const nSpecial = races.length - seatRaces.length;
    const out = [roll(seatRaces, eid, `${t} — races won and votes by party${sen ? ' (incl. special elections)' : ''}`, 'United States', 'national')]; if (nSpecial) out[0].note = `Counts the ${seatRaces.length} regular district races; ${nSpecial} special election${nSpecial === 1 ? '' : 's'} for the rest of an unexpired term ${nSpecial === 1 ? 'is' : 'are'} listed separately.`;
    if (!sen) { const byState = new Map(); for (const c of seatRaces) { if (!byState.has(c.parent)) byState.set(c.parent, []); byState.get(c.parent).push(c); }
      for (const [st, list] of byState) out.push(roll(list, `${eid}-${st}`, `${t} · ${st} delegation`, st, 'state')); }
    return [...out, ...races];
  }

  return {
    sources: () => FILES,
    houseStatus: () => ({ full: fs.existsSync(path.join(dir, '1976-2024-house.csv')), tokenSet: !!process.env.DATAVERSE_API_TOKEN, error: dvError }),
    /** contests for one year: office kinds to include are chosen by the caller (Election.org covers 2020–2024 House/Senate, 2024 President) */
    async contests(year, { president: p = true, senate: s = true, house: h = true } = {}) {
      const out = []; const errs = [];
      for (const [want, fn] of [[p, () => president(year)], [s, () => seats('senate', year)], [h, () => seats('house', year)]]) {
        if (!want) continue; try { out.push(...await fn()); } catch (e) { errs.push(e.message); }
      }
      return { contests: out, errors: errs };
    },
  };
}
