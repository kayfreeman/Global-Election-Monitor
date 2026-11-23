// In-memory hierarchy store. Every country is a tree of nodes:
//   Country -> level 1 -> ... -> leaf (polling unit / precinct / voting place)
// Leaves hold votes; every ancestor holds running aggregates, updated by
// delta-propagation whenever a leaf changes. Each node records provenance.
import { COUNTRIES, COUNTRY_ORDER, US_STATES, NG_ZONES, LAGOS_LGAS, AU_STATES, UK_NATIONS, NZ_REGIONS, NZ_MAORI } from './countries.js';

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pad = (n) => String(n).padStart(2, '0');
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export class Store {
  constructor(seed = 2027) {
    this.seed = seed;
    this.nodes = new Map();
    this.leaves = {}; // country -> [leafId]
    for (const c of COUNTRY_ORDER) this.build(c);
  }

  add(country, id, name, code, level, parent, synthetic) {
    const def = COUNTRIES[country];
    const n = {
      id, country, name, code, level, levelName: def.levels[level], parent: parent ? parent.id : null,
      children: [], synthetic: !!synthetic, leaf: false,
      leafCount: 0, reported: 0, disputed: 0, registered: 0, cast: 0, invalid: 0,
      votes: Object.fromEntries(def.parties.map((p) => [p.code, 0])),
      lean: null, updatedAt: null,
      provenance: { kind: 'simulated', source: 'Simulation engine', detail: 'Synthetic data — not real results' },
    };
    this.nodes.set(id, n);
    if (parent) parent.children.push(id);
    return n;
  }

  // lean = multiplicative bias on party base weights; compounds down the tree
  lean(def, r, strength) {
    return Object.fromEntries(def.parties.map((p) => [p.code, Math.exp((r() - 0.5) * 2 * strength)]));
  }

  build(country) {
    const def = COUNTRIES[country];
    const r = rng(this.seed + country.charCodeAt(0) * 131 + country.charCodeAt(2));
    const root = this.add(country, country, def.name, def.iso2, 0, null, false);
    root.lean = Object.fromEntries(def.parties.map((p) => [p.code, 1]));
    this.leaves[country] = [];
    const L = def.levels.length - 1; // leaf level index

    // generic synthetic subtree from `parent` down to the leaf level
    const grow = (parent, counts) => {
      const lvl = parent.level + 1;
      if (lvl > L) return;
      const [lo, hi] = counts[lvl] || [3, 5];
      const n = ri(r, lo, hi);
      for (let i = 1; i <= n; i++) {
        const word = ({ 'Polling Unit': 'PU', 'State / Territory': 'State' })[def.levels[lvl]] || def.levels[lvl];
        const child = this.add(country, `${parent.id}.${pad(i)}`, `${word} ${pad(i)}`, `${parent.code}-${pad(i)}`, lvl, parent, true);
        this.finishNode(def, child, parent, r, lvl === L);
        if (lvl < L) grow(child, counts);
      }
    };

    if (country === 'USA') {
      const counts = { 2: [3, 7], 3: [3, 6] };
      for (const [pc, nm] of US_STATES) {
        const s = this.add(country, `USA.${pc}`, nm, pc, 1, root, false); this.finishNode(def, s, root, r, false, 0.35);
        grow(s, counts);
      }
    } else if (country === 'NGA') {
      const counts = { 3: [4, 6], 4: [3, 5], 5: [3, 6] };
      for (const [zc, zn, states] of NG_ZONES) {
        const z = this.add(country, `NGA.${zc}`, zn, zc, 1, root, false); this.finishNode(def, z, root, r, false, 0.45);
        for (const [sc, sn] of states) {
          const s = this.add(country, `NGA.${zc}.${sc}`, sn, sc, 2, z, false); this.finishNode(def, s, z, r, false, 0.25);
          if (sc === 'LA') {
            LAGOS_LGAS.forEach((lg) => {
              const l = this.add(country, `NGA.${zc}.${sc}.${slug(lg)}`, lg, `LA-${slug(lg).slice(0, 3).toUpperCase()}`, 3, s, false);
              this.finishNode(def, l, s, r, false, 0.2); grow(l, counts);
            });
          } else grow(s, counts);
        }
      }
    } else if (country === 'AUS') {
      const counts = { 3: [3, 6] };
      for (const [sc, sn] of AU_STATES) {
        const s = this.add(country, `AUS.${sc}`, sn, sc, 1, root, false); this.finishNode(def, s, root, r, false, 0.25);
        grow(s, { ...counts, 2: sc === 'VIC' ? [12, 12] : sc === 'NSW' ? [8, 8] : [2, 5] });
      }
    } else if (country === 'GBR') {
      const counts = { 3: [3, 6], 4: [3, 5] };
      for (const [nc, nn, regions] of UK_NATIONS) {
        const nat = this.add(country, `GBR.${nc}`, nn, nc, 1, root, false); this.finishNode(def, nat, root, r, false, nc === 'SCT' ? 0.5 : 0.25);
        if (nc === 'SCT') nat.lean.SNP *= 3.2; if (nc === 'WLS') nat.lean.SNP *= 1.8; if (nc === 'NIR') { nat.lean.SNP *= 6; }
        regions.forEach((rn) => {
          const reg = this.add(country, `GBR.${nc}.${slug(rn)}`, rn, `${nc}-${slug(rn).slice(0, 4).toUpperCase()}`, 2, nat, false);
          this.finishNode(def, reg, nat, r, false, 0.2); grow(reg, counts);
        });
      }
    } else if (country === 'NZL') {
      const counts = { 2: [1, 4], 3: [4, 8] };
      for (const rn of NZ_REGIONS) {
        const reg = this.add(country, `NZL.${slug(rn)}`, rn, slug(rn).slice(0, 3).toUpperCase(), 1, root, false);
        this.finishNode(def, reg, root, r, false, 0.2); grow(reg, counts);
      }
      const m = this.add(country, 'NZL.maori', 'Māori Electorates', 'MAO', 1, root, false);
      this.finishNode(def, m, root, r, false, 0.2); m.lean.TPM *= 5; m.lean.LAB *= 1.4; m.lean.NAT *= 0.6; m.lean.ACT *= 0.4;
      NZ_MAORI.forEach((en) => {
        const e = this.add(country, `NZL.maori.${slug(en)}`, en, slug(en).slice(0, 4).toUpperCase(), 2, m, false);
        this.finishNode(def, e, m, r, false, 0.25); grow(e, counts);
      });
    }
    // aggregate static totals bottom-up
    const agg = (id) => {
      const n = this.nodes.get(id);
      if (n.leaf) return n;
      n.leafCount = 0; n.registered = 0;
      for (const cid of n.children) { const c = agg(cid); n.leafCount += c.leafCount; n.registered += c.registered; }
      return n;
    };
    agg(country);
  }

  finishNode(def, n, parent, r, isLeaf, strength = 0.18) {
    const l = this.lean(def, r, strength);
    n.lean = Object.fromEntries(def.parties.map((p) => [p.code, parent.lean[p.code] * l[p.code]]));
    if (!isLeaf) return;
    n.leaf = true; n.leafCount = 1; n.status = 'pending';
    const scale = { USA: [900, 4200], NGA: [350, 1500], AUS: [1200, 5200], GBR: [2500, 9000], NZL: [800, 3600] }[def.code];
    n.registered = ri(r, scale[0], scale[1]);
    n.turnoutTarget = { USA: 0.52, NGA: 0.29, AUS: 0.88, GBR: 0.58, NZL: 0.77 }[def.code] * (0.82 + r() * 0.36);
    const raw = def.parties.map((p) => p.w * n.lean[p.code]);
    const sum = raw.reduce((a, b) => a + b, 0);
    n.shares = Object.fromEntries(def.parties.map((p, i) => [p.code, raw[i] / sum]));
    this.leaves[def.code].push(n.id);
  }

  get(id) { return this.nodes.get(id); }
  ancestors(id) { const out = []; let n = this.nodes.get(id); while (n && n.parent) { n = this.nodes.get(n.parent); out.unshift(n); } return out; }

  // apply a delta from a leaf change up the chain
  propagate(leaf, d) {
    let n = leaf; const ts = Date.now();
    while (n) {
      if (n !== leaf) { // leaf fields are set directly by the caller
        n.reported += d.reported || 0; n.disputed += d.disputed || 0; n.cast += d.cast || 0; n.invalid += d.invalid || 0;
        if (d.votes) for (const k in d.votes) n.votes[k] += d.votes[k];
        n.updatedAt = ts;
      }
      n = n.parent ? this.nodes.get(n.parent) : null;
    }
  }

  reportLeaf(leaf, r) {
    if (leaf.status === 'reported') return false;
    const def = COUNTRIES[leaf.country];
    const wasDisputed = leaf.status === 'disputed';
    const cast = Math.round(leaf.registered * Math.min(0.98, leaf.turnoutTarget * (0.9 + r() * 0.2)));
    const invalid = Math.round(cast * (def.code === 'NGA' ? 0.02 + r() * 0.03 : 0.005 + r() * 0.012));
    const valid = cast - invalid;
    const noisy = def.parties.map((p) => leaf.shares[p.code] * (0.85 + r() * 0.3));
    const s = noisy.reduce((a, b) => a + b, 0);
    const votes = {}; let assigned = 0;
    def.parties.forEach((p, i) => { votes[p.code] = Math.floor(valid * noisy[i] / s); assigned += votes[p.code]; });
    votes[def.parties[0].code] += valid - assigned;
    leaf.status = 'reported';
    this.propagate(leaf, { reported: 1, disputed: wasDisputed ? -1 : 0, cast, invalid, votes });
    leaf.reported = 1; leaf.disputed = 0; leaf.cast = cast; leaf.invalid = invalid; leaf.votes = { ...votes }; leaf.updatedAt = Date.now();
    return true;
  }

  setDisputed(leaf, on) {
    if (on && leaf.status === 'pending') { leaf.status = 'disputed'; this.propagate(leaf, { disputed: 1 }); leaf.disputed = 1; return true; }
    if (!on && leaf.status === 'disputed') { leaf.status = 'pending'; this.propagate(leaf, { disputed: -1 }); leaf.disputed = 0; return true; }
    return false;
  }

  resetCountry(country) {
    for (const n of this.nodes.values()) {
      if (n.country !== country) continue;
      n.reported = 0; n.disputed = 0; n.cast = 0; n.invalid = 0; n.updatedAt = null;
      for (const k in n.votes) n.votes[k] = 0;
      if (n.leaf) n.status = 'pending';
    }
  }

  status(n) {
    if (n.leaf) return n.status;
    if (n.disputed > 0) return 'flagged';
    if (n.reported === 0) return 'awaiting';
    if (n.reported < n.leafCount) return 'counting';
    return 'complete';
  }

  brief(n) {
    const def = COUNTRIES[n.country];
    const valid = Object.values(n.votes).reduce((a, b) => a + b, 0);
    const ranked = def.parties.map((p) => ({ code: p.code, votes: n.votes[p.code], share: valid ? n.votes[p.code] / valid : 0 }))
      .sort((a, b) => b.votes - a.votes);
    return {
      id: n.id, country: n.country, name: n.name, code: n.code, level: n.level, levelName: n.levelName,
      childLevelName: def.levels[n.level + 1] || null, synthetic: n.synthetic, leaf: n.leaf,
      childCount: n.children.length, leafCount: n.leafCount, reported: n.reported, disputed: n.disputed,
      pct: n.leafCount ? n.reported / n.leafCount : 0,
      registered: n.registered, cast: n.cast, invalid: n.invalid, valid,
      turnout: n.reported && n.registered ? n.cast / this.reportedRegistered(n) : 0,
      votes: n.votes, ranked: valid ? ranked : [],
      leader: valid ? ranked[0].code : null,
      marginPct: valid && ranked.length > 1 ? ranked[0].share - ranked[1].share : 0,
      status: this.status(n), updatedAt: n.updatedAt, provenance: n.provenance,
    };
  }

  // registered voters in *reported* leaves (turnout must be computed on reported units only)
  reportedRegistered(n) {
    if (n.leaf) return n.registered;
    if (n.reported === n.leafCount) return n.registered;
    if (!n._rrCache || n._rrCache.at !== n.updatedAt) {
      let s = 0; const stack = [n];
      while (stack.length) { const x = stack.pop(); if (x.leaf) { if (x.status === 'reported') s += x.registered; } else if (x.reported) for (const c of x.children) stack.push(this.nodes.get(c)); }
      n._rrCache = { at: n.updatedAt, v: s };
    }
    return n._rrCache.v || 1;
  }

  search(country, q, limit = 20) {
    q = q.toLowerCase(); const out = [];
    for (const n of this.nodes.values()) {
      if (country && n.country !== country) continue;
      if (n.name.toLowerCase().includes(q) || n.code.toLowerCase().includes(q) || n.id.toLowerCase() === q) {
        out.push({ id: n.id, name: n.name, levelName: n.levelName, path: this.ancestors(n.id).map((a) => a.name).join(' › ') });
        if (out.length >= limit) break;
      }
    }
    return out;
  }
}
