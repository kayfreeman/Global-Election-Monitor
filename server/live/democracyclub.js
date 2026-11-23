// Democracy Club (UK) — free CSV export of candidates and FPTP results
// (council by-elections etc.). Data licence: CC-BY, attribute Democracy Club.
import { get } from './http.js';

const BASE = 'https://candidates.democracyclub.org.uk/data/export_csv/';
const PARTY = [[/labour/i, 'LAB'], [/conservative/i, 'CON'], [/reform/i, 'REF'], [/liberal democrat/i, 'LD'], [/green/i, 'GRN'], [/scottish national|plaid/i, 'SNP']];

export function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter((r) => r.length > 1).map((r) => { const o = {}; head.forEach((h, i) => { if (!(h in o)) o[h] = r[i]; }); return o; });
}

export function groupResults(rows) {
  const by = new Map();
  for (const r of rows) {
    if (r.cancelled_poll === 't' || r.votes_cast === '' || r.votes_cast == null) continue;
    const id = r.ballot_paper_id; if (!by.has(id)) by.set(id, []); by.get(id).push(r);
  }
  return [...by.entries()].map(([id, rs]) => {
    const r0 = rs[0]; const org = (r0.election_id || '').split('.')[1] || '';
    return {
      id: `GBR-DC-${id}`, country: 'GBR', source: 'democracyclub', area: org.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      title: `${r0.post_label}${/\.by\./.test(id) ? ' by-election' : ''}`, office: (r0.election_id || '').split('.')[0], date: r0.election_date, official: true,
      reportingDone: 1, reportingTotal: 1, reportingLabel: 'declaration',
      registered: +r0.total_electorate || null, ballots: +r0.turnout_reported || null, turnoutPct: +r0.turnout_percentage || null, seats: +r0.seats_contested || 1,
      choices: rs.map((r) => ({ name: r.person_name, party: r.party_name, partyCode: (PARTY.find(([re]) => re.test(r.party_name)) || [])[1] || 'OTH', votes: +r.votes_cast || 0, elected: r.elected === 't' })).sort((a, b) => b.votes - a.votes),
      url: r0.results_source || `https://candidates.democracyclub.org.uk/elections/${id}/`, updatedAt: null,
    };
  });
}

export function startDemocracyClub(hub, cfg = {}) {
  const opt = { enabled: true, days: 21, everyMin: 30, ...cfg };
  hub.source({ id: 'democracyclub', name: 'Democracy Club results', country: 'GBR', kind: 'results', docs: 'https://candidates.democracyclub.org.uk/data/', note: 'Free CSV export (CC-BY). Council by-elections and other FPTP contests.', terms: 'CC-BY — credit Democracy Club.' });
  if (!opt.enabled) { hub.status('democracyclub', { status: 'off' }); return; }
  async function run() {
    let n = 0;
    try {
      for (let i = 0; i < opt.days; i++) {
        const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        const csv = await get(`${BASE}?election_date=${day}&field_group=results&format=csv`, { gapMs: 1500 });
        const contests = groupResults(parseCsv(csv)); contests.forEach((c) => hub.upsertContest(c)); n += contests.length;
      }
      hub.status('democracyclub', { status: 'live', lastError: null, items: n, detail: `${n} declared contests in the last ${opt.days} days` });
    } catch (e) { hub.status('democracyclub', { status: 'error', lastError: e.message }); }
  }
  run(); setInterval(run, opt.everyMin * 60000).unref();
}
