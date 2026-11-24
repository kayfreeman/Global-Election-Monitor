// Louisiana Secretary of State live results (US). Public JSON behind
// voterportal.sos.la.gov/graphical — includes the 12 Dec 2026 runoffs.
import { getJson } from './http.js';

const BASE = 'https://voterportal.sos.la.gov/ElectionResults/ElectionResults/Data?blob=';
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const ymd = (mdy) => { const [m, d, y] = mdy.split('/'); return `${y}${m}${d}`; };
const PARTY = { REP: 'GOP', DEM: 'DEM' };

export function parseLouisiana(dateMDY, racesJson, votesJson, official) {
  const votes = new Map(arr(votesJson?.Races?.Race).map((r) => [r.ID, r]));
  return arr(racesJson?.Races?.Race).map((r) => {
    const v = votes.get(r.ID) || {}; const vc = new Map(arr(v.Choice).map((c) => [c.ID, c]));
    return {
      id: `USA-LA-${ymd(dateMDY)}-${r.ID}`, country: 'USA', source: 'louisiana', area: 'Louisiana',
      title: r.SpecificTitle, office: r.GeneralTitle, officeLevel: +r.OfficeLevel || 999, date: dateMDY, official: !!official,
      reportingDone: +v.PrecinctsReporting || 0, reportingTotal: +v.PrecinctsExpected || 0, reportingLabel: 'precincts',
      registered: +v.VoterCountQualified || null, ballots: +v.VoterCountVoted || null,
      choices: arr(r.Choice).map((c) => {
        const p = (c.Desc.match(/\(([A-Z]+)\)\s*$/) || [])[1] || null; const x = vc.get(c.ID) || {};
        return { name: c.Desc.replace(/\s*\([A-Z]+\)\s*$/, ''), party: p, partyCode: PARTY[p] || 'OTH', votes: +x.VoteTotal || 0, elected: x.Outcome === 'Elected' ? true : x.Outcome === 'Defeated' ? false : null, outcome: x.Outcome || null };
      }).sort((a, b) => b.votes - a.votes),
      url: 'https://voterportal.sos.la.gov/graphical', updatedAt: racesJson?.Races?.WriteTime || null,
    };
  });
}

// For the national USA view keep federal races, statewide offices and constitutional
// amendments; leave out parish/town propositions, school boards, judges and local seats.
export function laSignificant(c) {
  return /^(U\.?\s?S\.?\s|Presidential Electors|Governor|Lieutenant Governor|Attorney General|Secretary of State|Treasurer|Commissioner of (Agriculture|Insurance)|CA No\.)/i.test(c.title || '') || /Constitutional Amendment/i.test(c.office || '');
}
// Louisiana results are one state's, not the country's: say so in every title.
export const laLabel = (c) => ({ ...c, title: /^Louisiana — /.test(c.title) ? c.title : `Louisiana — ${c.title}`, area: 'Louisiana', stateFeed: true });

export function startLouisiana(hub, cfg = {}) {
  const opt = { enabled: true, dates: 'auto', maxContests: 40, ...cfg };
  hub.source({ id: 'louisiana', name: 'Louisiana SoS results', country: 'USA', kind: 'results', docs: 'https://voterportal.sos.la.gov/graphical', note: 'Official unofficial-until-certified results JSON. Statewide and multi-parish races incl. 12 Dec 2026 runoffs.' });
  hub.removeContests((c) => c.source === 'louisiana' && !c.stateFeed); // drop cached entries from before the Louisiana labelling/filter
  if (!opt.enabled) { hub.status('louisiana', { status: 'off' }); return; }
  let timer;
  async function run() {
    let next = 30 * 60000;
    try {
      const d = await getJson(BASE + 'ElectionDates.htm');
      const all = arr(d?.Dates?.Date);
      const pick = Array.isArray(opt.dates) ? all.filter((x) => opt.dates.includes(x.ElectionDate)) : all.slice(0, 2);
      let n = 0;
      for (const e of pick) {
        const key = ymd(e.ElectionDate);
        const [races, votes] = [await getJson(`${BASE}${key}/RacesCandidates_Multiparish.htm`), await getJson(`${BASE}${key}/Votes_Multiparish.htm`)];
        const list = parseLouisiana(e.ElectionDate, races, votes, e.ResultsOfficial === '1').filter(laSignificant).map(laLabel).sort((a, b) => a.officeLevel - b.officeLevel).slice(0, opt.maxContests);
        list.forEach((c) => hub.upsertContest(c)); n += list.length;
        const day = Date.parse(e.ElectionDate);
        if (e.ResultsOfficial !== '1' && Math.abs(Date.now() - day) < 3 * 86400000) next = 60000; // election window → every minute
      }
      hub.status('louisiana', { status: 'live', lastError: null, items: n, detail: pick.map((p) => `${p.ElectionDate}${p.ResultsOfficial === '1' ? ' (official)' : ''}`).join(', ') });
    } catch (e) { hub.status('louisiana', { status: 'error', lastError: e.message }); next = 5 * 60000; }
    timer = setTimeout(run, next); timer.unref();
  }
  run();
}
