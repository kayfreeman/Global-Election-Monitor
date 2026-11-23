// Simulation engine: drives progressive counting, declarations, incidents and
// synthetic social posts so every screen can be exercised end-to-end before
// live adapters are licensed. Everything it produces is tagged simulated:true.
import { EventEmitter } from 'node:events';
import { COUNTRIES, COUNTRY_ORDER } from './model/countries.js';

const INCIDENTS = {
  NGA: ['BVAS accreditation delay', 'Result sheet upload to IReV delayed', 'Form EC8A figures differ from uploaded image', 'Late arrival of sensitive materials', 'Reported disruption at polling unit', 'Collation centre adjourned'],
  USA: ['Tabulator paper jam', 'Electronic poll book sync delay', 'Provisional ballot backlog', 'Drop-box chain-of-custody query', 'Request to extend polling hours'],
  AUS: ['Early voting centre queue overflow', 'Declaration vote batch recheck', 'Voting centre short of ballot papers', 'Two-candidate-preferred recount request'],
  GBR: ['Ballot box late to count', 'Bundle check requested by agent', 'Postal vote verification backlog', 'Polling station opened late'],
  NZL: ['Special vote batch transit delay', 'Voting place staffing shortfall', 'Ballot box seal query at scrutiny'],
};
const POSTS = [
  { t: 'Queue at {p} moving slowly — roughly 40 minutes to get through.', topic: 'Queues & wait times', s: 'tension' },
  { t: 'In and out of {p} in about ten minutes. Very orderly.', topic: 'Queues & wait times', s: 'calm' },
  { t: 'Turnout at {p} looks noticeably higher than last time.', topic: 'Turnout', s: 'calm' },
  { t: 'Has anyone seen a count posted for {p} yet?', topic: 'Results claims', s: 'calm' },
  { t: 'Claim going round that counting at {p} was stopped. Can anyone confirm?', topic: 'Results claims', s: 'disputed', rumor: true },
  { t: 'Officials at {p} say materials arrived late, voting started behind schedule.', topic: 'Ballot logistics', s: 'tension' },
  { t: 'Equipment at {p} restarted after a fault, voting resumed.', topic: 'Voting equipment', s: 'tension' },
];
const NGA_POSTS = [
  { t: 'BVAS working fine at {p}, accreditation fast this time.', topic: 'Voting equipment', s: 'calm' },
  { t: 'Result sheet for {p} still not showing on IReV.', topic: 'Results claims', s: 'tension' },
  { t: 'Video circulating claiming ballot snatching at {p} — unverified, be careful sharing.', topic: 'Results claims', s: 'disputed', rumor: true },
];
const PLATFORMS = {
  NGA: [['x', 0.4], ['nairaland', 0.3], ['facebook', 0.3]],
  USA: [['x', 0.5], ['reddit', 0.3], ['facebook', 0.2]],
  default: [['x', 0.45], ['reddit', 0.3], ['facebook', 0.25]],
};
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const wpick = (r, arr) => { let x = r(); for (const [v, w] of arr) { if ((x -= w) <= 0) return v; } return arr[arr.length - 1][0]; };
let seq = 0; const nid = (p) => `${p}-${Date.now().toString(36)}-${(++seq).toString(36)}`;

export class Simulation extends EventEmitter {
  constructor(store, ledger, { tickMs = 2000, durationTicks = 450, rng = Math.random } = {}) {
    super();
    Object.assign(this, { store, ledger, tickMs, durationTicks, r: rng });
    this.speed = 1; this.wire = []; this.posts = []; this.incidents = [];
    this.c = {};
    for (const code of COUNTRY_ORDER) this.resetCountry(code, false);
  }

  resetCountry(code, log = true) {
    this.store.resetCountry(code);
    const r = this.r; const off = {};
    const queue = this.store.leaves[code].slice().map((id) => {
      const top = id.split('.').slice(0, 2).join('.');
      off[top] ??= r() * 0.45;
      return [off[top] + r() * 0.55, id];
    }).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    this.c[code] = { running: true, queue, idx: 0, milestone: 0, declared: new Set(), carry: 0 };
    this.incidents = this.incidents.filter((i) => i.country !== code);
    if (log) this.ledger.append('SIM_RESET', code, code, { note: 'Simulation reset for country' });
  }

  start() { this.timer = setInterval(() => this.tick(), this.tickMs); }
  stop() { clearInterval(this.timer); }

  addWire(country, kind, text, nodeId, extra = {}) {
    const e = { id: nid('w'), ts: new Date().toISOString(), country, kind, text, nodeId, simulated: true, ...extra };
    this.wire.unshift(e); this.wire.length = Math.min(this.wire.length, 400);
    return e;
  }

  path(id) { return this.store.ancestors(id).slice(1).map((a) => a.name).concat(this.store.get(id).name).join(' › '); }

  tick() {
    const out = { wire: [], posts: [], incidents: [] };
    const now = Date.now();
    for (const code of COUNTRY_ORDER) {
      const st = this.c[code]; const def = COUNTRIES[code]; const r = this.r;
      if (!st.running) continue;
      const total = this.store.leaves[code].length;
      // reporting volume: base rate with bursts
      st.carry += (total / this.durationTicks) * this.speed * (0.4 + r() * 1.2);
      let n = Math.floor(st.carry); st.carry -= n;
      let guard = 0;
      while (n > 0 && st.idx < st.queue.length && guard++ < 5000) {
        const id = st.queue[st.idx]; st.idx++;
        const leaf = id && this.store.get(id);
        if (!leaf || leaf.status === 'reported') continue;
        if (leaf.status === 'disputed') { st.queue.push(id); if (guard > 200) break; continue; } // retry after review
        this.store.reportLeaf(leaf, r); n--;
        this.checkDeclarations(leaf, st, out);
      }
      if (st.idx > 2000) { st.queue = st.queue.slice(st.idx); st.idx = 0; }
      // milestones every 10%
      const root = this.store.get(code); const pct = Math.floor((root.reported / root.leafCount) * 10);
      if (pct > st.milestone) {
        st.milestone = pct; const b = this.store.brief(root);
        out.wire.push(this.addWire(code, 'STATISTICAL', `${def.name}: ${pct * 10}% of ${def.unitWord} ${def.metricWord.toLowerCase()}. ${b.leader} leads by ${(b.marginPct * 100).toFixed(1)} pts.`, code));
      }
      // incidents
      if (r() < 0.06 * this.speed && st.idx < st.queue.length) {
        const pendingId = st.queue[Math.min(st.queue.length - 1, st.idx + Math.floor(r() * 40))];
        const leaf = pendingId && this.store.get(pendingId);
        if (leaf && leaf.status === 'pending') out.incidents.push(this.openIncident(code, leaf, out));
      }
      // social posts
      const k = r() < 0.7 ? 1 : 2;
      for (let i = 0; i < k; i++) out.posts.push(this.makePost(code));
    }
    // resolve incidents that are due
    for (const inc of this.incidents) {
      if (inc.status !== 'resolved' && inc.resolveAt && now >= inc.resolveAt) {
        if (inc.status === 'open') { inc.status = 'under_review'; inc.resolveAt = now + (8 + this.r() * 20) * this.tickMs / this.speed; }
        else {
          inc.status = 'resolved'; inc.resolvedAt = new Date().toISOString();
          const leaf = this.store.get(inc.nodeId); this.store.setDisputed(leaf, false);
          const le = this.ledger.append('INCIDENT_RESOLVED', inc.country, inc.nodeId, { incident: inc.id, category: inc.category });
          inc.ledgerSeqs.push(le.seq);
          out.wire.push(this.addWire(inc.country, 'RESOLUTION', `Resolved: ${inc.category} — ${inc.path}. Counting resumed.`, inc.nodeId, { ledgerSeq: le.seq }));
        }
        out.incidents.push(inc);
      }
    }
    this.emit('tick', out);
  }

  checkDeclarations(leaf, st, out) {
    const def = COUNTRIES[leaf.country];
    const declareLevels = leaf.country === 'NGA' ? [2] : [1];
    for (const a of this.store.ancestors(leaf.id)) {
      if (!declareLevels.includes(a.level) || st.declared.has(a.id) || a.reported < a.leafCount) continue;
      st.declared.add(a.id);
      const b = this.store.brief(a);
      const le = this.ledger.append('DECLARATION', a.country, a.id, { leader: b.leader, marginPct: +(b.marginPct * 100).toFixed(2), votes: a.votes, cast: a.cast, kind: 'provisional' });
      out.wire.push(this.addWire(a.country, 'DECLARATION', `Provisional: ${a.name} (${a.levelName}) fully ${def.metricWord.toLowerCase()} — ${b.leader} ${(b.ranked[0].share * 100).toFixed(1)}%, margin ${(b.marginPct * 100).toFixed(1)} pts.`, a.id, { ledgerSeq: le.seq, hash: le.hash }));
    }
  }

  openIncident(code, leaf, out) {
    const r = this.r;
    const sev = r() < 0.15 ? 'high' : r() < 0.5 ? 'medium' : 'low';
    const category = pick(r, INCIDENTS[code]);
    const source = pick(r, ['Field observer report', 'Returning officer log', 'Party agent complaint', 'Crowd report cluster', 'Media wire']);
    this.store.setDisputed(leaf, true);
    const inc = {
      id: `INC-${code}-${String(this.ledger.entries.length + 1).padStart(5, '0')}`, ts: new Date().toISOString(), country: code,
      nodeId: leaf.id, path: this.path(leaf.id), severity: sev, category, source, status: 'open',
      resolveAt: Date.now() + (6 + r() * 25) * this.tickMs / this.speed, ledgerSeqs: [], simulated: true,
    };
    const le = this.ledger.append('INCIDENT_OPENED', code, leaf.id, { incident: inc.id, severity: sev, category, source });
    inc.ledgerSeqs.push(le.seq);
    this.incidents.unshift(inc); this.incidents.length = Math.min(this.incidents.length, 1000);
    out.wire.push(this.addWire(code, 'INCIDENT', `${sev.toUpperCase()}: ${category} — ${inc.path}. Unit held from tally pending review.`, leaf.id, { ledgerSeq: le.seq, incident: inc.id }));
    return inc;
  }

  makePost(code) {
    const r = this.r;
    const leaves = this.store.leaves[code]; const leaf = this.store.get(pick(r, leaves));
    const anc = this.store.ancestors(leaf.id);
    const place = anc.length > 2 ? `${anc[anc.length - 1].name}, ${anc[2] ? anc[2].name : anc[1].name}` : leaf.name;
    const tpl = pick(r, code === 'NGA' ? POSTS.concat(NGA_POSTS) : POSTS);
    const platform = wpick(r, PLATFORMS[code] || PLATFORMS.default);
    const p = {
      id: nid('p'), ts: new Date().toISOString(), country: code, platform, nodeId: leaf.id, path: this.path(leaf.id),
      handle: `sim_${platform}_${Math.floor(r() * 9000 + 1000)}`, text: tpl.t.replace('{p}', place),
      topic: tpl.topic, sentiment: tpl.s, rumor: !!tpl.rumor, engagement: Math.floor(r() ** 3 * 4000),
      verification: tpl.rumor ? 'unverified' : (r() < 0.25 ? 'corroborated' : 'unverified'), simulated: true,
    };
    this.posts.unshift(p); this.posts.length = Math.min(this.posts.length, 600);
    return p;
  }

  velocity() {
    const since = Date.now() - 60_000; const out = {};
    for (const p of this.posts) {
      if (Date.parse(p.ts) < since) break;
      out[p.country] ??= { total: 0, platforms: {}, sentiment: { calm: 0, tension: 0, disputed: 0 } };
      out[p.country].total++; out[p.country].platforms[p.platform] = (out[p.country].platforms[p.platform] || 0) + 1;
      out[p.country].sentiment[p.sentiment]++;
    }
    return out;
  }
}
