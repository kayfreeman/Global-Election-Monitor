// Election.org public data API — official historical results, turned into
// dashboard contests for the year archive.
//   USA  2020/2022/2024 House + Senate (FEC / House Clerk, certified) and
//        2024 presidential by state (FEC)
//   GBR  2024 House of Commons general election (650 constituencies)
//   AUS  2025 federal House of Representatives (150 divisions)
// Keyless v1 access works; if ELECTION_API_KEY is set (in .env, never in the
// repository) the registered developer endpoint is used for US results.
// Credit: "Data via Election.org" with each record's link and original source.
import { getJson } from './http.js';

const V1 = 'https://election.org/api/v1/';
const DEV = 'https://election.org/api/developers/data/';
export const EO_YEARS = { USA: [2020, 2022, 2024], GBR: [2024], AUS: [2025] };
const CREDIT = 'Data via Election.org';
const STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

const opts = () => ({ gapMs: 300, timeout: 30000, retries: 1, headers: process.env.ELECTION_API_KEY ? { authorization: `Bearer ${process.env.ELECTION_API_KEY}` } : {} });
async function pages(url) { // follow limit/offset until every record is read
  const out = []; let offset = 0;
  for (let guard = 0; guard < 40; guard++) {
    const j = await getJson(`${url}${url.includes('?') ? '&' : '?'}limit=250&offset=${offset}`, opts());
    const d = j.data || {}; const recs = d.records || []; out.push(...recs);
    offset += recs.length; if (!recs.length || offset >= (d.total_matches ?? 0)) break;
  }
  return out;
}

// party codes used by the dashboard's colours
const usParty = (p) => (/^(D|DEM|Democrat)/i.test(p || '') ? 'DEM' : /^(R|REP|Republican)/i.test(p || '') ? 'GOP' : 'OTH');
const gbParty = (a, n) => { // match the abbreviation first: "Social Democratic and Labour Party" (SDLP) is not Labour
  const ab = String(a || '').trim();
  if (/^Lab(\b| Co-op)/i.test(ab)) return 'LAB'; if (/^Con$/i.test(ab)) return 'CON'; if (/^LD$/i.test(ab)) return 'LD'; if (/^(RUK|Reform)/i.test(ab)) return 'REF'; if (/^(Green|Grn)/i.test(ab)) return 'GRN'; if (/^SNP$/i.test(ab)) return 'SNP'; if (/^(PC|Plaid)/i.test(ab)) return 'PC';
  if (ab) return ab.toUpperCase();
  const nm = String(n || ''); return /^Labour/i.test(nm) ? 'LAB' : /^Conservative/i.test(nm) ? 'CON' : /^Liberal Democrat/i.test(nm) ? 'LD' : /^Reform/i.test(nm) ? 'REF' : /^Green/i.test(nm) ? 'GRN' : /^Scottish National/i.test(nm) ? 'SNP' : /^Plaid/i.test(nm) ? 'PC' : 'OTH';
};
const auParty = (a, n) => { // abbreviation first: e.g. the Liberal Democrats (LDP) are not the Liberal Party
  const ab = String(a || '').trim().toUpperCase();
  if (ab === 'ALP') return 'ALP'; if (['LP', 'LNP', 'NP', 'CLP', 'LNQ'].includes(ab)) return 'LNP'; if (ab === 'GRN' || ab === 'GVIC') return 'GRN'; if (ab === 'ON') return 'ONP'; if (ab) return 'IND';
  const nm = String(n || ''); return /^Australian Labor/i.test(nm) ? 'ALP' : /^(Liberal$|Liberal National|The Nationals|National Party|Country Liberal)/i.test(nm) ? 'LNP' : /Greens/i.test(nm) ? 'GRN' : /One Nation/i.test(nm) ? 'ONP' : 'IND';
};

function base(country, year, office, officeType, date, electionId, electionTitle) {
  return { country, source: 'electionorg', official: true, declared: true, office, officeType, date, year, electionId, electionTitle, reportingDone: 0, reportingTotal: 0, reportingLabel: '', sourceNote: `${CREDIT} (official sources: FEC / House Clerk / national electoral bodies). Historical certified results.` };
}
// display names for the dashboard's grouped party codes (individual small parties keep their own name)
const GROUP = {
  USA: { DEM: 'Democratic', GOP: 'Republican' },
  GBR: { LAB: 'Labour', CON: 'Conservative', LD: 'Liberal Democrats', REF: 'Reform UK', GRN: 'Green', SNP: 'SNP', PC: 'Plaid Cymru' },
  AUS: { ALP: 'Labor', LNP: 'Liberal–National Coalition', GRN: 'Greens', ONP: "Pauline Hanson's One Nation" },
};
// national (or state) roll-up of many seat contests: votes and seats (US: races won) by party
function rollup(contests, common, id, title, area, level) {
  const names = GROUP[common.country] || {}; const unit = common.country === 'USA' ? ['race won', 'races won'] : ['seat', 'seats'];
  const by = new Map();
  for (const c of contests) {
    const w = c.choices.find((x) => x.elected);
    for (const x of c.choices) { const k = names[x.partyCode] ? x.partyCode : `${x.partyCode}:${x.party || 'Other'}`; const e = by.get(k) || { party: names[x.partyCode] || x.party || x.partyCode, partyCode: x.partyCode, votes: 0, seats: 0 }; e.votes += x.votes; if (x === w) e.seats++; by.set(k, e); }
  }
  const choices = [...by.values()].sort((a, b) => b.seats - a.seats || b.votes - a.votes).slice(0, 12)
    .map((e, i) => ({ name: `${e.party} — ${e.seats} ${e.seats === 1 ? unit[0] : unit[1]}`, party: e.party, partyCode: e.partyCode, votes: e.votes, seats: e.seats, elected: null })); // a party total is not a declared winner
  return { ...common, id, title, area, level, parent: null, choices };
}

async function usa(year) {
  const recs = await pages(`${process.env.ELECTION_API_KEY ? DEV : V1}results?year=${year}`).catch(async (e) => { if (process.env.ELECTION_API_KEY) return pages(`${V1}results?year=${year}`); throw e; });
  const date = { 2020: '2020-11-03', 2022: '2022-11-08', 2024: '2024-11-05' }[year];
  const out = []; const seat = { H: [], S: [] };
  for (const r of recs) {
    const sen = r.office === 'S'; const eid = `USA-EO-${year}-${r.office}`;
    const common = base('USA', year, sen ? 'U.S. Senate' : 'U.S. House', sen ? 'SEN' : 'HOUSE', date, eid, `${year} U.S. ${sen ? 'Senate' : 'House'} elections`);
    const choices = (r.candidates || []).map((x) => ({ name: x.name, party: (x.parties || [])[0] || '', partyCode: usParty((x.parties || [])[0]), votes: x.final_votes ?? x.general_votes ?? 0, elected: x.winner ? true : null })).sort((a, b) => b.votes - a.votes);
    const c = { ...common, id: `USA-EO-${r.id}`, title: r.label, area: sen ? r.state_name : r.label, level: sen ? 'state' : 'district', parent: r.state_name, choices, url: `https://election.org${r.path}`, ballots: r.totals?.final_votes || null };
    out.push(c); seat[sen ? 'S' : 'H'].push(c);
  }
  // House delegation per state (majority colours the map), as for the MEDSL years
  const byState = new Map(); for (const c of seat.H) { if (!byState.has(c.parent)) byState.set(c.parent, []); byState.get(c.parent).push(c); }
  for (const [st, list] of byState) { const r = rollup(list, base('USA', year, 'U.S. House', 'HOUSE', date, `USA-EO-${year}-H`, `${year} U.S. House elections`), `USA-EO-${year}-H-${st}`, `${year} U.S. House · ${st} delegation`, st, 'state'); if (r.choices[0] && (!r.choices[1] || r.choices[0].seats > r.choices[1].seats)) r.choices[0].elected = true; out.push(r); }
  for (const [k, list] of Object.entries(seat)) if (list.length) out.push(rollup(list, base('USA', year, k === 'S' ? 'U.S. Senate' : 'U.S. House', k === 'S' ? 'SEN' : 'HOUSE', date, `USA-EO-${year}-${k}`, `${year} U.S. ${k === 'S' ? 'Senate' : 'House'} elections`), `USA-EO-${year}-${k}`, `${year} U.S. ${k === 'S' ? 'Senate' : 'House'} — races won and votes by party (incl. special elections${k === 'H' ? ' and non-voting delegates' : ''})`, 'United States', 'national'));
  if (year === 2024) out.push(...await usPresident2024());
  return out;
}
async function usPresident2024() {
  const eid = 'USA-EO-2024-PRES'; const title = '2024 U.S. presidential election';
  const common = base('USA', 2024, 'President', 'PRES', '2024-11-05', eid, title);
  const nat = await getJson(`${V1}presidential-results?year=2024`, opts());
  const out = [{ ...common, id: eid, title, area: 'United States', level: 'national', parent: null, url: 'https://election.org/election/2024/us-president',
    choices: (nat.data?.records || []).slice(0, 8).map((x) => ({ name: `${x.candidate_name}${x.electoral_votes ? ` — ${x.electoral_votes} electoral votes` : ''}`, party: x.party || '', partyCode: usParty(x.party), votes: x.votes, elected: x.electoral_votes >= 270 ? true : null })) }];
  for (const st of STATES) {
    try {
      const s = (await getJson(`${V1}presidential-results?year=2024&state=${st}`, opts())).data?.selected_state; if (!s) continue;
      out.push({ ...common, id: `${eid}-${st}`, title: `${title} · ${s.state_name}`, area: s.state_name, level: 'state', parent: null, url: `https://election.org/election/2024/us-president/${s.state_slug}`,
        choices: (s.candidates || []).map((x) => ({ name: x.candidate_name, party: x.party || '', partyCode: usParty(x.party), votes: x.votes })).sort((a, b) => b.votes - a.votes).map((x, i) => ({ ...x, elected: i === 0 ? true : null })) });
    } catch { /* one state missing doesn't stop the rest */ }
  }
  return out;
}

async function gbr(year) {
  const recs = await pages(`${V1}international-results?country=GB&year=${year}`);
  const eid = `GBR-EO-${year}-GE`; const title = `${year} UK general election`;
  const common = base('GBR', year, 'House of Commons', 'GE', recs[0]?.polling_date || null, eid, title);
  const seats = recs.map((r) => ({ ...common, id: `GBR-EO-${r.id}`, title: `${r.constituency}${r.result_summary ? ` — ${r.result_summary}` : ''}`, area: r.constituency, level: 'constituency', parent: r.nation, url: `https://election.org/country/united-kingdom/elections/${year}/house-of-commons/${r.constituency_slug}`, registered: r.electorate || null, ballots: r.valid_votes || null,
    choices: (r.candidates || []).map((x) => { const p = (x.parties || [])[0] || {}; return { name: x.name, party: p.abbreviation || p.name || 'Ind', partyCode: gbParty(p.abbreviation, p.name), votes: x.vote_count || 0, elected: x.elected ? true : null }; }).sort((a, b) => b.votes - a.votes) }));
  const nations = [...new Set(recs.map((r) => r.nation).filter(Boolean))];
  return [rollup(seats, common, eid, `${title} — seats and votes by party`, 'United Kingdom', 'national'),
    ...nations.map((n) => rollup(seats.filter((c) => c.parent === n), common, `${eid}-${n}`, `${title} · ${n}`, n, 'state')), ...seats];
}

async function aus(year) {
  const recs = await pages(`${V1}international-results?country=AU&year=${year}`);
  const eid = `AUS-EO-${year}-HOR`; const title = `${year} Australian federal election (House of Representatives)`;
  const common = base('AUS', year, 'House of Representatives', 'HOR', recs[0]?.polling_date || null, eid, title);
  const seats = recs.map((r) => ({ ...common, id: `AUS-EO-${r.id}`, title: `Division of ${r.division}`, area: r.division, level: 'division', parent: r.state, url: `https://election.org/country/australia/elections/${year}/house-of-representatives/${r.division_slug}`, registered: r.enrolment || null, ballots: r.formal_votes || null,
    choices: (r.candidates || []).map((x) => ({ name: x.name, party: x.affiliation_abbreviation || x.affiliation || 'IND', partyCode: auParty(x.affiliation_abbreviation, x.affiliation), votes: x.first_preference_votes || 0, elected: x.elected ? true : null })).sort((a, b) => b.votes - a.votes),
    twoCP: (r.candidates || []).filter((x) => x.tcp_votes != null).map((x) => ({ name: x.name, votes: x.tcp_votes })) }));
  const states = [...new Set(recs.map((r) => r.state).filter(Boolean))];
  return [rollup(seats, common, eid, `${title} — seats and first-preference votes by party`, 'Australia', 'national'),
    ...states.map((s) => rollup(seats.filter((c) => c.parent === s), common, `${eid}-${s}`, `${title} · ${s}`, s, 'state')), ...seats];
}

/** Contests for a country and year, or [] when Election.org has nothing for it. */
export async function electionOrgContests(country, year) {
  if (!(EO_YEARS[country] || []).includes(year)) return [];
  return country === 'USA' ? usa(year) : country === 'GBR' ? gbr(year) : country === 'AUS' ? aus(year) : [];
}

// Rebuild UK national/nation roll-ups from the constituencies; used on saved copies made before Plaid Cymru (PC)
// was separated from the SNP.
export function fixUkContests(list) {
  const seats = list.filter((c) => c.level === 'constituency'); if (!seats.length) return list;
  for (const c of seats) for (const x of c.choices) if (x.partyCode === 'SNP' && /^(PC|Plaid)/i.test(String(x.party || ''))) x.partyCode = 'PC';
  const nat = list.find((c) => c.level === 'national'); if (!nat) return list;
  const common = { ...nat }; const title = String(nat.title).replace(/ — seats and votes by party$/, '');
  const nations = [...new Set(seats.map((c) => c.parent).filter(Boolean))];
  return [rollup(seats, common, nat.id, nat.title, 'United Kingdom', 'national'), ...nations.map((n) => rollup(seats.filter((c) => c.parent === n), common, `${nat.id}-${n}`, `${title} · ${n}`, n, 'state')), ...seats];
}
