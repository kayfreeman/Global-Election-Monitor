// Append-only, SHA-256 hash-chained audit ledger.
// hash_n = sha256(hash_{n-1} + canonical JSON of entry n). Tampering with any
// stored entry breaks every hash after it, which /api/ledger/verify detects.
// Persisted as JSON Lines in data/ledger.jsonl.
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const GENESIS = '0'.repeat(64);
export const SIM_TYPES = new Set(['INCIDENT_OPENED', 'INCIDENT_RESOLVED', 'DECLARATION', 'SIM_RESET']); // written by the simulation engine
const body = (e) => JSON.stringify({ seq: e.seq, ts: e.ts, type: e.type, country: e.country, nodeId: e.nodeId, payload: e.payload });
const sha = (s) => createHash('sha256').update(s).digest('hex');

export class Ledger {
  constructor(file) {
    this.file = file; this.entries = [];
    if (file && fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) if (line.trim()) { try { this.entries.push(JSON.parse(line)); } catch { /* skip corrupt line; verify() will flag the gap */ } }
    }
  }
  get head() { return this.entries.length ? this.entries[this.entries.length - 1].hash : GENESIS; }
  append(type, country, nodeId, payload) {
    const e = { seq: this.entries.length + 1, ts: new Date().toISOString(), type, country, nodeId: nodeId || null, payload };
    e.prevHash = this.head; e.hash = sha(e.prevHash + body(e));
    this.entries.push(e);
    if (this.file) fs.appendFileSync(this.file, JSON.stringify(e) + '\n');
    return e;
  }
  verify() {
    let prev = GENESIS;
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (e.seq !== i + 1) return { ok: false, brokenAt: e.seq, reason: 'sequence gap' };
      if (e.prevHash !== prev) return { ok: false, brokenAt: e.seq, reason: 'prevHash mismatch' };
      if (sha(prev + body(e)) !== e.hash) return { ok: false, brokenAt: e.seq, reason: 'hash mismatch (entry altered)' };
      prev = e.hash;
    }
    return { ok: true, entries: this.entries.length, head: prev };
  }
  list({ country, type, limit = 100, offset = 0, excludeSim = false } = {}) {
    let arr = this.entries;
    if (excludeSim) arr = arr.filter((e) => !SIM_TYPES.has(e.type));
    if (country) arr = arr.filter((e) => e.country === country);
    if (type) arr = arr.filter((e) => e.type === type);
    return { total: arr.length, items: arr.slice().reverse().slice(offset, offset + limit) };
  }
  csv() {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return ['seq,ts,type,country,nodeId,payload,prevHash,hash']
      .concat(this.entries.map((e) => [e.seq, e.ts, e.type, e.country, e.nodeId, JSON.stringify(e.payload), e.prevHash, e.hash].map(q).join(','))).join('\n');
  }
}
