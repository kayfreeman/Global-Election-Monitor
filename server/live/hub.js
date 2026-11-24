import { byCountryName } from '../model/countries.js';
// LiveHub: holds everything that comes from real sources (contests, IReV
// trackers, news) plus an honest status record per source.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

export class LiveHub extends EventEmitter {
  constructor(dataDir) {
    super();
    this.file = path.join(dataDir, 'live-cache.json');
    this.contests = new Map(); this.irev = new Map(); this.news = []; this.sources = new Map();
    this.dirty = false; this.startedAt = Date.now(); this.irevPrev = new Map();
    try { // warm start from last snapshot so the UI isn't empty after a restart
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const c of j.contests || []) this.contests.set(c.id, c);
      for (const t of j.irev || []) this.irev.set(t.id, t);
      this.news = j.news || [];
    } catch { /* first run */ }
    setInterval(() => this.persist(), 30000).unref();
  }

  persist() {
    if (!this.dirty) return; this.dirty = false;
    try { fs.writeFileSync(this.file + '.tmp', JSON.stringify({ contests: [...this.contests.values()], irev: [...this.irev.values()], news: this.news.slice(0, 400) })); fs.renameSync(this.file + '.tmp', this.file); } catch (e) { console.error('live cache write failed:', e.message); }
  }

  source(def) { // register
    const s = { status: 'idle', lastRun: null, lastOk: null, lastError: null, items: 0, detail: null, ...def };
    this.sources.set(def.id, s); return s;
  }
  status(id, patch) {
    const s = this.sources.get(id); if (!s) return;
    Object.assign(s, patch, { lastRun: new Date().toISOString() });
    if (patch.status === 'live' || patch.status === 'test') s.lastOk = s.lastRun;
    if (patch.lastError) console.log(`  [${id}] ${patch.lastError}`);
    this.emit('change', 'sources');
  }

  upsertContest(c) {
    const prev = this.contests.get(c.id);
    const sig = JSON.stringify([c.choices, c.reportingDone, c.official, c.title]);
    if (prev && prev._sig === sig) return false;
    c._sig = sig; c.changedAt = new Date().toISOString();
    this.contests.set(c.id, c); this.dirty = true; this.emit('change', 'contests');
    this.contestEvent(prev, c);
    return true;
  }
  removeContests(pred) { let n = 0; for (const [k, v] of this.contests) if (pred(v)) { this.contests.delete(k); n++; } if (n) { this.dirty = true; this.emit('change', 'contests'); } }

  setIrev(t) {
    const before = this.irevPrev.get(t.id);
    if (before != null && t.uploaded > before) this.emit('event', { kind: 'UPLOAD', country: 'NGA', text: `IReV · ${t.name}: ${t.uploaded.toLocaleString('en-US')}/${t.expected.toLocaleString('en-US')} result sheets uploaded (+${t.uploaded - before}).`, url: t.portal, ref: t.id });
    if (t.uploaded != null) this.irevPrev.set(t.id, t.uploaded);
    this.irev.set(t.id, t); this.dirty = true; this.emit('change', 'irev');
  }

  // Real wire events. Suppressed during the first 2 minutes so a restart doesn't flood the wire.
  contestEvent(prev, c) {
    if (Date.now() - this.startedAt < 120000) return;
    const top = c.choices[0]; const tot = c.choices.reduce((a, x) => a + x.votes, 0);
    const share = top && tot ? ` ${top.name}${top.party ? ` (${top.party})` : ''} ${((top.votes / tot) * 100).toFixed(1)}%` : '';
    const where = [c.area, c.title].filter(Boolean).join(' · ');
    if (!prev) {
      const declared = c.official || c.declared || c.choices.some((x) => x.elected);
      const winner = c.choices.find((x) => x.elected);
      this.emit('event', { kind: declared ? 'DECLARATION' : 'STATISTICAL', country: c.country, text: declared && winner ? `Result: ${where} — ${winner.name}${winner.party ? ` (${winner.party})` : ''} elected.` : `New contest: ${where}.`, url: c.url, ref: c.id, ledger: declared ? { contest: c.id, title: where, winner: winner ? winner.name : null, party: winner ? winner.party : null, votes: Object.fromEntries(c.choices.map((x) => [x.name, x.votes])), source: c.source } : null, test: !!c.test });
      return;
    }
    if (prev.reportingDone !== c.reportingDone || prev._sig !== c._sig) {
      this.emit('event', { kind: 'STATISTICAL', country: c.country, text: `${where}: ${c.reportingDone.toLocaleString('en-US')}/${c.reportingTotal.toLocaleString('en-US')} ${c.reportingLabel || ''} —${share}.`, url: c.url, ref: c.id, test: !!c.test });
    }
  }

  addNews(items) {
    const seen = new Set(this.news.map((n) => n.url)); const fresh = items.filter((n) => n.url && !seen.has(n.url));
    if (!fresh.length) return [];
    this.news = fresh.concat(this.news).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 900);
    this.dirty = true; this.emit('news', fresh);
    return fresh;
  }

  // compact views for the API / SSE
  contestList(country) { return [...this.contests.values()].filter((c) => !country || c.country === country).map(({ _sig, ...c }) => c); }
  irevSummary() { return [...this.irev.values()].map(({ lgas, ...t }) => ({ ...t, lgaCount: lgas.length })); }
  sourceList() { return [...this.sources.values()].sort((a, b) => byCountryName(a.country, b.country) || String(a.name).localeCompare(String(b.name))); }
}
