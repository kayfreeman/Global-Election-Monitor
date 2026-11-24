// Canada — Elections Canada "Official Voting Results", Table 12 (every candidate in every electoral district).
// Free and public (Open Government Licence – Canada). One CSV per general election; the archive caches it on disk.
//   Contest shape matches the other archives: national seat totals, a roll-up per province/territory (the party
//   with the most seats colours the map) and one contest per electoral district (riding).
import { get } from './http.js';
import { parseCsv } from './medsl.js';

const OVR = 'https://www.elections.ca/res/rep/off';
// General elections with official results online. Folder names differ by era; each entry is tried in order.
export const CAN_GE = {
  2025: { n: 45, date: '2025-04-28', urls: [`${OVR}/ovrGE45/62/data_donnees/table_tableau12.csv`], page: `${OVR}/ovrGE45/62/table12E.html` },
  2021: { n: 44, date: '2021-09-20', urls: [`${OVR}/ovr2021app/53/data_donnees/table_tableau12.csv`], page: `${OVR}/ovr2021app/53/table12E.html` },
  2019: { n: 43, date: '2019-10-21', urls: [`${OVR}/ovr2019app/51/data_donnees/table_tableau12.csv`], page: `${OVR}/ovr2019app/51/table12E.html` },
  2015: { n: 42, date: '2015-10-19', urls: [`${OVR}/ovr2015app/41/data_donnees/table_tableau12.csv`], page: `${OVR}/ovr2015app/41/table12E.html` },
  2011: { n: 41, date: '2011-05-02', urls: ['https://www.elections.ca/scripts/OVR2011/34/data_donnees/table_tableau12.csv'], page: 'https://www.elections.ca/scripts/OVR2011/34/table12E.html' },
  2008: { n: 40, date: '2008-10-14', urls: ['https://www.elections.ca/scripts/OVR2008/31/data/table_tableau12.csv', 'https://www.elections.ca/scripts/OVR2008/31/data_donnees/table_tableau12.csv'], page: 'https://www.elections.ca/scripts/OVR2008/31/table12E.html' },
  2006: { n: 39, date: '2006-01-23', urls: ['https://www.elections.ca/scripts/OVR2006/25/data_donnees/table_tableau12.csv'], page: 'https://www.elections.ca/scripts/OVR2006/25/table12E.html' },
};
const ORD = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

// English affiliation names as printed by Elections Canada (before the "/French" half). Longest match wins.
const PARTIES = [
  ['LPC', 'Liberal', /^liberal( party of canada)?$/i],
  ['CPC', 'Conservative', /^conservative( party of canada)?$/i],
  ['NDP', 'NDP', /^(ndp-)?new democratic party$|^n\.?d\.?p\.?$/i],
  ['BQ', 'Bloc Québécois', /^bloc qu[eé]b[eé]cois$/i],
  ['GPC', 'Green Party', /^green party( of canada)?$/i],
  ['PPC', "People's Party", /^people'?s party( - ppc| of canada)?$/i],
  ['IND', 'Independent', /^independent$/i],
  ['IND', 'No affiliation', /^no affiliation$/i],
];
// Smaller registered parties seen in Elections Canada files (English names). Anything else falls back to
// "Surname, Given [Initial.] Affiliation…".
const MINOR = ['Animal Protection Party', 'Animal Alliance/Environment Voters', 'Christian Heritage Party', 'Communist', 'Marxist-Leninist', 'Rhinoceros', 'Libertarian',
  'Marijuana Party', 'Maverick Party', 'Centrist', 'Free Party Canada', 'Parti Patriote', 'Canadian Future Party', 'United Party of Canada (UP)', 'United Party of Canada',
  'Pirate Party', 'Veterans Coalition Party', 'Progressive Canadian Party', 'Canadian Action', 'Work Less Party', 'National Citizens Alliance', 'Stop Climate Change',
  "Canada's Fourth Front", 'Alliance of the North', 'Democratic Advancement', 'First Peoples National Party', 'Canadian Nationalist Party', 'Western Block Party',
  'Strength in Democracy', 'Seniors Party', 'Bridge Party', 'PC Party', 'Canada Party', 'Newfoundland and Labrador First Party', 'Party for Accountability, Competency and Transparency',
  'Canadian Medical Freedom Party', 'Mouvement Québec Indépendant', 'Christian Freedom Party', 'Parti Rhinocéros Party', 'Radical Marijuana', 'People’s Party - PPC'];
const isMinor = (tail) => MINOR.find((m) => m.toLowerCase() === tail.toLowerCase());

export function splitCandidate(raw) {
  let s = String(raw || '').replace(/\s\*+(?=\s|$)/g, '').replace(/\s+/g, ' ').trim(); // "**" marks the incumbent in older files
  const slash = s.indexOf('/'); if (slash > 0) s = s.slice(0, slash).trim(); // drop the French half of the affiliation
  // known parties: try every split point from the right
  const words = s.split(' ');
  for (let i = 1; i < words.length; i++) {
    const tail = words.slice(i).join(' '); const hit = PARTIES.find((p) => p[2].test(tail));
    if (hit) return { name: personName(words.slice(0, i).join(' ')), partyCode: hit[0], party: hit[1] };
  }
  for (let i = 1; i < words.length; i++) { const tail = words.slice(i).join(' '); const hit = isMinor(tail); if (hit) return { name: personName(words.slice(0, i).join(' ')), partyCode: 'OTH', party: hit }; }
  const comma = words.findIndex((w) => w.endsWith(',')); // fallback: one given name (plus initials) after "Surname,"
  if (comma >= 0 && comma + 2 < words.length) { let i = comma + 2; while (i < words.length - 1 && /^[A-Z]\.$/.test(words[i])) i++; return { name: personName(words.slice(0, i).join(' ')), partyCode: 'OTH', party: words.slice(i).join(' ') }; }
  return { name: personName(s), partyCode: 'OTH', party: '' };
}
// "Rogers, Churence" → "Churence Rogers"
function personName(n) { const m = String(n).trim().match(/^([^,]+),\s*(.+)$/); return m ? `${m[2]} ${m[1]}` : String(n).trim(); }
const english = (s) => String(s || '').split('/')[0].replace(/--/g, '—').trim();
const num = (v) => Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0;

function decode(buf) { // the files are Windows-1252 in older years, UTF-8 in newer ones
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}

export async function canadaGeneral(year) {
  const ge = CAN_GE[year]; if (!ge) return [];
  let text = null; const errs = [];
  for (const u of ge.urls) { try { text = decode(await get(u, { as: 'buffer', timeout: 60000, retries: 1 })); if (/district|circonscription/i.test(text.slice(0, 400))) break; errs.push(`${u}: unexpected content`); text = null; } catch (e) { errs.push(`${u}: ${e.message}`); } }
  if (!text) throw new Error(`Elections Canada ${year}: ${errs.join('; ')}`);
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (!rows.length) throw new Error(`Elections Canada ${year}: empty file`);
  const keys = Object.keys(rows[0]); const col = (re) => keys.find((k) => re.test(k));
  const K = { prov: col(/^province/i), name: col(/district name|nom de circonscription|^electoral district/i), num: col(/district number|num[ée]ro/i), cand: col(/^candidate\/|^candidat/i), votes: col(/votes obtained|votes obtenus/i), maj: col(/^majority\/|^majorit/i) };
  if (!K.name || !K.cand || !K.votes) throw new Error(`Elections Canada ${year}: unrecognised columns (${keys.join(', ').slice(0, 200)})`);

  const title = `${year} Canadian federal election (${ORD(ge.n)} general election)`; const eid = `CAN-EC-${year}-GE`;
  const common = { country: 'CAN', source: 'elections-canada', official: true, declared: true, office: 'House of Commons', officeType: 'GE', year, date: ge.date, electionId: eid, electionTitle: title, reportingDone: 0, reportingTotal: 0, reportingLabel: '', url: ge.page, sourceNote: 'Elections Canada, Official Voting Results (Table 12). Open Government Licence – Canada.' };
  const byRiding = new Map();
  for (const r of rows) {
    const nm = english(r[K.name]); if (!nm || /^total/i.test(nm)) continue; const id = String(r[K.num] || nm).trim();
    if (!byRiding.has(id)) byRiding.set(id, { name: nm, prov: english(r[K.prov]) || '', rows: [] }); byRiding.get(id).rows.push(r);
  }
  const ridings = [];
  for (const [id, rd] of byRiding) {
    const ch = rd.rows.map((r) => ({ ...splitCandidate(r[K.cand]), votes: num(r[K.votes]), maj: K.maj ? num(r[K.maj]) : 0 })).sort((a, b) => b.votes - a.votes);
    const w = ch.find((x) => x.maj > 0) || ch[0]; // the elected candidate is the one with a majority figure
    ridings.push({ ...common, id: `CAN-EC-${year}-${id}`, title: `${rd.name} (${rd.prov})`, area: rd.name, level: 'district', parent: rd.prov, ballots: ch.reduce((a, x) => a + x.votes, 0),
      choices: ch.map((x) => ({ name: x.name, party: x.party || 'Other', partyCode: x.partyCode, votes: x.votes, elected: x === w ? true : null })) });
  }
  const roll = (list, id, rtitle, area, level) => {
    const by = new Map();
    for (const c of list) { const w = c.choices.find((x) => x.elected); for (const x of c.choices) { const k = x.partyCode === 'OTH' ? `OTH:${x.party}` : x.partyCode; const e = by.get(k) || { party: x.partyCode === 'IND' ? 'Independent / no affiliation' : x.party, partyCode: x.partyCode, votes: 0, seats: 0 }; e.votes += x.votes; if (x === w) e.seats++; by.set(k, e); } }
    const ch = [...by.values()].sort((a, b) => b.seats - a.seats || b.votes - a.votes).slice(0, 10).map((e) => ({ name: `${e.party} — ${e.seats} seat${e.seats === 1 ? '' : 's'}`, party: e.party, partyCode: e.partyCode, votes: e.votes, seats: e.seats, elected: null }));
    if (level === 'state' && ch[0] && (!ch[1] || ch[0].seats > ch[1].seats)) ch[0].elected = true; // most seats colours the province
    return { ...common, id, title: rtitle, area, level, parent: null, choices: ch };
  };
  const out = [roll(ridings, eid, `${title} — seats and votes by party (${ridings.length} seats)`, 'Canada', 'national')];
  const byProv = new Map(); for (const c of ridings) { if (!byProv.has(c.parent)) byProv.set(c.parent, []); byProv.get(c.parent).push(c); }
  for (const [p, list] of byProv) out.push(roll(list, `${eid}-${p}`, `${year} federal election · ${p} (${list.length} seats)`, p, 'state'));
  return [...out, ...ridings];
}
