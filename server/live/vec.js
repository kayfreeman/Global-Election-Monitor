// Victorian Electoral Commission (Australia) results feed — XML (EML-based).
// Access to the live feed is FREE but requires signing the VEC terms of use:
//   https://www.vec.vic.gov.au/about-us/media/2026-results-data-feed
// Until access is granted this adapter can replay the VEC's PUBLIC SAMPLE
// (test data, clearly labelled) so the parser and screens are proven.
import zlib from 'node:zlib';
import { get } from './http.js';

const SAMPLE = 'https://www.vec.vic.gov.au/-/media/04d4aa2108084aa98478adc06fa0a078.zip';
const PARTY = [[/labor/i, 'ALP'], [/liberal|national/i, 'LNP'], [/green/i, 'GRN'], [/one nation/i, 'ONP']];

// minimal ZIP reader (central directory; stored or deflate)
export function unzip(buf) {
  let e = buf.length - 22; while (e > 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e <= 0) throw new Error('not a zip');
  const n = buf.readUInt16LE(e + 10); let cd = buf.readUInt32LE(e + 16); const out = new Map();
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(cd + 10), csize = buf.readUInt32LE(cd + 20), nlen = buf.readUInt16LE(cd + 28), xlen = buf.readUInt16LE(cd + 30), clen = buf.readUInt16LE(cd + 32), off = buf.readUInt32LE(cd + 42);
    const name = buf.subarray(cd + 46, cd + 46 + nlen).toString('utf8');
    const lnl = buf.readUInt16LE(off + 26), lxl = buf.readUInt16LE(off + 28);
    const data = buf.subarray(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
    out.set(name, method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data));
    cd += 46 + nlen + xlen + clen;
  }
  return out;
}

const attr = (s, a) => (s.match(new RegExp(`${a}="([^"]*)"`)) || [])[1];
const tag = (s, t) => (s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1];
const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').trim();

export function parseCandidates(xml) {
  const map = new Map(); // candidateId -> {name, party}
  for (const [, c] of xml.matchAll(/<Candidate(?:\s[^>]*)?>([\s\S]*?)<\/Candidate>/g)) {
    const id = attr(c, 'CandidateIdentifier Id'); if (!id) continue;
    map.set(id, { name: decode(tag(c, 'CandidateName')), party: decode(tag(c, 'RegisteredName')) || 'Independent' });
  }
  return map;
}

function block(c, name) {
  const m = c.match(new RegExp(`<${name}([^>]*)>([\\s\\S]*?)</${name}>`)); if (!m) return null;
  const cands = [...m[2].matchAll(/<Candidate>([\s\S]*?)<\/Candidate>/g)].map(([, x]) => ({ id: attr(x, 'eml:CandidateIdentifier Id'), votes: +(x.match(/<\/BallotPosition><Votes>(\d+)<\/Votes>/) || x.match(/<Votes>(\d+)<\/Votes>/) || [])[1] || 0 }));
  return { returned: +attr(m[1], 'PollingPlacesReturned') || 0, expected: +attr(m[1], 'PollingPlacesExpected') || 0, cands, formal: +(m[2].match(/<Formal>[\s\S]*?<Votes>(\d+)/) || [])[1] || null, informal: +(m[2].match(/<Informal>[\s\S]*?<Votes>(\d+)/) || [])[1] || null };
}

export function parseLowerHouse(xml, candidates, { test = false } = {}) {
  const created = attr(xml.slice(0, 2000), 'Created');
  return [...xml.matchAll(/<Contest(\s[^>]*)?>([\s\S]*?)<\/Contest>/g)].map(([, at, c]) => {
    const updated = at ? attr(at, 'Updated') : null;
    const id = attr(c, 'eml:ContestIdentifier Id'); const fp = block(c, 'FirstPreferences'); const tcp = block(c, 'TwoCandidatePreferred');
    const pick = (x) => (x ? x.cands.map((k) => { const ci = candidates.get(k.id) || { name: `Candidate ${k.id}`, party: '' }; return { name: ci.name, party: ci.party, partyCode: (PARTY.find(([re]) => re.test(ci.party)) || [])[1] || 'IND', votes: k.votes, elected: null }; }).sort((a, b) => b.votes - a.votes) : []);
    return {
      id: `AUS-VIC-LH-${id}${test ? '-TEST' : ''}`, country: 'AUS', source: 'vec', area: 'Victoria', test,
      title: decode(tag(c, 'eml:ContestName')), office: 'Legislative Assembly', date: '2026-11-28', official: false,
      declared: /<Declared>true<\/Declared>/.test(c), registered: +tag(c, 'Enrolment') || null,
      reportingDone: fp ? fp.returned : 0, reportingTotal: fp ? fp.expected : 0, reportingLabel: 'voting centres',
      ballots: fp && fp.formal != null ? fp.formal + (fp.informal || 0) : null,
      choices: pick(fp), twoCP: pick(tcp), updatedAt: updated || created,
      url: 'https://www.vec.vic.gov.au/results',
    };
  });
}

export function startVec(hub, cfg = {}) {
  const opt = { mode: process.env.VEC_FEED_URL ? 'live' : 'off', // the public SAMPLE replay is test data: only on if chosen in Settings
    url: process.env.VEC_FEED_URL || '', replayEverySec: 45, everySec: 90, ...cfg };
  hub.source({ id: 'vec', name: 'VEC results feed (Victoria)', country: 'AUS', kind: 'results', docs: 'https://www.vec.vic.gov.au/about-us/media/2026-results-data-feed', note: opt.mode === 'sample' ? 'Replaying the VEC public SAMPLE (test data) until live feed access is approved.' : opt.mode === 'off' ? 'Off — free live feed needs VEC approval; add its URL in Settings.' : 'Live VEC XML feed.', terms: 'VEC terms of use agreement required for the live feed (free).' });
  if (opt.mode !== 'sample') hub.removeContests((c) => c.source === 'vec' && c.test); // clear any cached test results
  if (opt.mode === 'off') { hub.status('vec', { status: 'off', detail: 'Off. Add the VEC live feed URL in Settings once access is approved (free).' }); return; }

  if (opt.mode === 'sample') {
    let files, cands, snaps, i = 0;
    const tick = async () => {
      try {
        if (!files) {
          files = unzip(await get(SAMPLE, { as: 'buffer', timeout: 60000 }));
          const cname = [...files.keys()].find((k) => /Candidates.*\.xml$/i.test(k)); cands = parseCandidates(files.get(cname).toString('utf8'));
          snaps = [...files.keys()].filter((k) => /mediafilelitelhv2_.*\.zip$/i.test(k)).sort();
        }
        const inner = unzip(files.get(snaps[i % snaps.length])); const xml = [...inner.values()][0].toString('utf8');
        hub.removeContests((c) => c.source === 'vec' && !c.test); // never mix test and live
        const list = parseLowerHouse(xml, cands, { test: true }); list.forEach((c) => hub.upsertContest(c));
        hub.status('vec', { status: 'test', lastError: null, items: list.length, detail: `TEST DATA replay ${(i % snaps.length) + 1}/${snaps.length} (${snaps[i % snaps.length].match(/_(\d{8}_\d{6})/)[1]})` });
        i++;
      } catch (e) { hub.status('vec', { status: 'error', lastError: e.message }); }
    };
    tick(); setInterval(tick, opt.replayEverySec * 1000).unref();
    return;
  }

  // live: VEC_FEED_URL should point at the latest lower-house "lite" file (zip or xml) and
  // VEC_CANDIDATES_URL at the candidates file — confirm exact paths from the VEC user guide once approved.
  let cands = new Map();
  const tick = async () => {
    try {
      if (!cands.size && process.env.VEC_CANDIDATES_URL) cands = parseCandidates((await get(process.env.VEC_CANDIDATES_URL)).toString());
      const raw = await get(opt.url, { as: 'buffer' });
      const xml = raw.readUInt32LE(0) === 0x04034b50 ? [...unzip(raw).values()][0].toString('utf8') : raw.toString('utf8');
      hub.removeContests((c) => c.source === 'vec' && c.test);
      const list = parseLowerHouse(xml, cands); list.forEach((c) => hub.upsertContest(c));
      hub.status('vec', { status: 'live', lastError: null, items: list.length });
    } catch (e) { hub.status('vec', { status: 'error', lastError: e.message }); }
  };
  tick(); setInterval(tick, opt.everySec * 1000).unref();
}
