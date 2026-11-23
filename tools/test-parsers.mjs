// Parser tests using fixtures captured from the real sources (Nov 2026).
import assert from 'node:assert/strict';
import { parseLouisiana } from '../server/live/louisiana.js';
import { parseCsv, groupResults } from '../server/live/democracyclub.js';
import { parseCandidates, parseLowerHouse } from '../server/live/vec.js';
import { parseFeed, parseGdelt } from '../server/live/news.js';

// Louisiana (shape from voterportal.sos.la.gov, 3 Nov 2026)
const races = { Races: { WriteTime: '2026-11-22T05:00:57.243', Race: [{ ID: '67997', SpecificTitle: 'U. S. Senator', GeneralTitle: 'U.S. Senator', OfficeLevel: '140', Choice: [{ ID: '124654', Desc: '"Jamie" Davis (DEM)' }, { ID: '124655', Desc: 'Julia Letlow (REP)' }] }, { ID: '1', SpecificTitle: 'Single', GeneralTitle: 'X', OfficeLevel: '300', Choice: { ID: '9', Desc: 'Solo (NOPTY)' } }] } };
const votes = { Races: { Race: [{ ID: '67997', PrecinctsReporting: '3722', PrecinctsExpected: '3722', VoterCountQualified: '2975700', VoterCountVoted: '1493171', Choice: [{ ID: '124654', VoteTotal: '720516', Outcome: 'Defeated' }, { ID: '124655', VoteTotal: '746466', Outcome: 'Elected' }] }] } };
const la = parseLouisiana('11/03/2026', races, votes, true);
assert.equal(la.length, 2); assert.equal(la[0].choices[0].name, 'Julia Letlow'); assert.equal(la[0].choices[0].partyCode, 'GOP');
assert.equal(la[0].choices[0].elected, true); assert.equal(la[0].reportingDone, 3722); assert.equal(la[1].choices.length, 1); assert.equal(la[1].choices[0].votes, 0);
console.log('louisiana ok:', la[0].title, la[0].choices.map((c) => `${c.name} ${c.votes}`).join(' / '));

// Democracy Club CSV (shape from export_csv, 19 Nov 2026)
const csv = 'person_id,person_name,election_id,ballot_paper_id,election_date,election_current,party_name,party_id,post_label,cancelled_poll,seats_contested,votes_cast,elected,tied_vote_winner,rank,turnout_reported,spoilt_ballots,total_electorate,turnout_percentage,results_source\n139590,Tracy Barrington,local.caerphilly.2026-11-19,local.caerphilly.risca-east.by.2026-11-19,2026-11-19,t,Green Party,PP63,Risca East,f,1,31,f,f,6,1034,2,4696,22.02,https://example.org/x\n1,"Smith, Jo",local.caerphilly.2026-11-19,local.caerphilly.risca-east.by.2026-11-19,2026-11-19,t,Labour Party,PP53,Risca East,f,1,400,t,f,1,1034,2,4696,22.02,https://example.org/x\n2,No Result,local.x.2026-11-19,local.x.y.2026-11-19,2026-11-19,t,Independent,ynmp-party:2,Y,f,1,,,,,,,,,\n';
const dc = groupResults(parseCsv(csv));
assert.equal(dc.length, 1); assert.equal(dc[0].choices[0].name, 'Smith, Jo'); assert.equal(dc[0].choices[0].partyCode, 'LAB'); assert.equal(dc[0].choices[0].elected, true);
assert.equal(dc[0].title, 'Risca East by-election'); assert.equal(dc[0].area, 'Caerphilly');
console.log('democracyclub ok:', dc[0].area, dc[0].title, dc[0].choices.map((c) => `${c.name} ${c.votes}`).join(' / '));

// VEC (shapes from the VEC 2026 public sample)
const candXml = '<EML xmlns="urn:oasis:names:tc:evs:schema:eml"><CandidateList><Election><Contest><ContestIdentifier Id="18828"><ContestName>Bass District</ContestName></ContestIdentifier><Candidate Independent="yes"><CandidateIdentifier Id="24952"><CandidateName>CANDIDATE, One</CandidateName></CandidateIdentifier><BallotPosition>1</BallotPosition></Candidate><Candidate Independent="no"><CandidateIdentifier Id="24970"><CandidateName>CANDIDATE, Two</CandidateName></CandidateIdentifier><Affiliation><AffiliationIdentifier Id="8"><RegisteredName>Liberal Party of Australia - Victorian Division</RegisteredName></AffiliationIdentifier></Affiliation><BallotPosition>2</BallotPosition></Candidate></Contest></Election></CandidateList></EML>';
const lh = '<?xml version="1.0"?><MediaFeed Created="2026-10-02T12:45:35" xmlns="http://www.vec.vic.gov.au"><Election><House><Contests><Contest Updated="2026-10-02T08:53:34+11:00"><eml:ContestIdentifier Id="18828"><eml:ContestName>Bass District</eml:ContestName></eml:ContestIdentifier><Declared>false</Declared><Enrolment>5000</Enrolment><FirstPreferences PollingPlacesReturned="9" PollingPlacesExpected="9"><Candidate><eml:CandidateIdentifier Id="24952" /><BallotPosition>1</BallotPosition><Votes>191</Votes><VotesByType><Votes Type="Ordinary">26</Votes></VotesByType></Candidate><Candidate><eml:CandidateIdentifier Id="24970" /><BallotPosition>2</BallotPosition><Votes>261</Votes><VotesByType><Votes Type="Ordinary">28</Votes></VotesByType></Candidate><Formal><Votes>452</Votes></Formal><Informal><Votes>12</Votes></Informal></FirstPreferences><TwoCandidatePreferred PollingPlacesReturned="9" PollingPlacesExpected="9"><Candidate><eml:CandidateIdentifier Id="24952" /><BallotPosition>1</BallotPosition><Votes>253</Votes></Candidate><Candidate><eml:CandidateIdentifier Id="24970" /><BallotPosition>2</BallotPosition><Votes>211</Votes></Candidate></TwoCandidatePreferred><PollingPlaces><PollingPlace><FirstPreferences Updated="x" /></PollingPlace></PollingPlaces></Contest></Contests></House></Election></MediaFeed>';
const cands = parseCandidates(candXml);
assert.equal(cands.get('24970').party, 'Liberal Party of Australia - Victorian Division'); assert.equal(cands.get('24952').party, 'Independent');
const vec = parseLowerHouse(lh, cands, { test: true });
assert.equal(vec.length, 1); assert.equal(vec[0].choices[0].votes, 261); assert.equal(vec[0].choices[0].partyCode, 'LNP');
assert.equal(vec[0].reportingDone, 9); assert.equal(vec[0].ballots, 464); assert.equal(vec[0].twoCP[0].votes, 253); assert.equal(vec[0].test, true);
console.log('vec ok:', vec[0].title, vec[0].choices.map((c) => `${c.name} (${c.partyCode}) ${c.votes}`).join(' / '));

// RSS + Atom + GDELT
const rss = '<rss><channel><item><title><![CDATA[INEC fixes date for Osun rerun &amp; collation]]></title><link>https://example.ng/a</link><pubDate>Sun, 22 Nov 2026 10:00:00 +0100</pubDate><description><![CDATA[<p>The electoral commission said&#8230;</p>]]></description></item><item><title>Football: Eagles win</title><link>https://example.ng/b</link></item></channel></rss>';
const r = parseFeed(rss, { id: 't', country: 'NGA', name: 'Test', filter: true });
assert.equal(r.length, 1); assert.equal(r[0].title, 'INEC fixes date for Osun rerun & collation'); assert.ok(r[0].summary.startsWith('The electoral commission'));
const atom = '<feed><entry><title>By-election called</title><link rel="alternate" href="https://example.uk/c"/><updated>2026-11-21T09:00:00Z</updated><summary>Text</summary></entry></feed>';
assert.equal(parseFeed(atom, { id: 'a', country: 'GBR', name: 'A' })[0].url, 'https://example.uk/c');
const g = parseGdelt({ articles: [{ url: 'https://x.com/1', title: 'Vote count', seendate: '20261122T101500Z', domain: 'x.com', language: 'English' }] }, 'USA');
assert.equal(g[0].ts, '2026-11-22T10:15:00Z');
console.log('news ok:', r[0].title, '|', g[0].source);
console.log('\nALL PARSER TESTS PASSED');
