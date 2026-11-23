// Poll store + transparent weighted average.
// weight = sqrt(sample/1000) * 0.5^(ageDays/halfLife) * modeFactor
// Seed entries are DEMO placeholders (demo:true) — replace them with real,
// sourced polls via the Polls panel or POST /api/polls.
import { COUNTRIES } from './model/countries.js';

export const HALF_LIFE_DAYS = 14;
const MODE_FACTOR = { phone: 1, online: 0.9, 'face-to-face': 1, mixed: 1, smartphone: 0.7, other: 0.8 };

export function seedPolls() {
  const out = []; const today = new Date();
  const d = (n) => new Date(today.getTime() - n * 86400000).toISOString().slice(0, 10);
  for (const [code, def] of Object.entries(COUNTRIES)) {
    [3, 9, 17].forEach((age, i) => {
      const shares = {}; let rem = 100;
      def.parties.forEach((p, j) => {
        const v = j === def.parties.length - 1 ? rem : Math.max(1, Math.round(p.w * 100 + (i - 1) * (j % 2 ? -1 : 1)));
        shares[p.code] = v; rem -= v;
      });
      out.push({
        id: `demo-${code}-${i + 1}`, country: code, pollster: `Demo Pollster ${'ABC'[i]}`, fieldStart: d(age + 3), fieldEnd: d(age),
        sample: [1200, 900, 2000][i], mode: ['online', 'phone', 'mixed'][i], shares, source: '', demo: true,
      });
    });
  }
  return out;
}

export function validatePoll(p) {
  const def = COUNTRIES[p.country];
  if (!def) return 'unknown country';
  if (!p.pollster || typeof p.pollster !== 'string') return 'pollster required';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fieldEnd || '')) return 'fieldEnd must be YYYY-MM-DD';
  if (!(p.sample > 0)) return 'sample must be > 0';
  if (!p.shares || typeof p.shares !== 'object') return 'shares required';
  for (const k of Object.keys(p.shares)) if (!def.parties.some((x) => x.code === k)) return `unknown party ${k}`;
  const sum = Object.values(p.shares).reduce((a, b) => a + Number(b), 0);
  if (sum < 90 || sum > 110) return `shares should total ~100 (got ${sum})`;
  return null;
}

export function average(polls, country, now = Date.now()) {
  const def = COUNTRIES[country];
  const rows = polls.filter((p) => p.country === country);
  if (!rows.length) return { country, n: 0, shares: {}, rows: [] };
  let wsum = 0; const acc = Object.fromEntries(def.parties.map((p) => [p.code, 0]));
  const weighted = rows.map((p) => {
    const age = Math.max(0, (now - Date.parse(p.fieldEnd)) / 86400000);
    const w = Math.sqrt(p.sample / 1000) * Math.pow(0.5, age / HALF_LIFE_DAYS) * (MODE_FACTOR[p.mode] ?? 0.8);
    wsum += w; for (const k in acc) acc[k] += w * (Number(p.shares[k]) || 0);
    return { ...p, weight: w, ageDays: +age.toFixed(1) };
  });
  const shares = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, wsum ? v / wsum : 0]));
  const n = weighted.reduce((a, p) => a + p.sample, 0);
  // rough MOE of the average using effective sample size (ignores house effects)
  const moe = 1.96 * Math.sqrt(0.25 / Math.max(1, n)) * 100;
  return { country, n: rows.length, totalSample: n, moe: +moe.toFixed(2), demoOnly: rows.every((r) => r.demo), shares, rows: weighted.sort((a, b) => b.fieldEnd.localeCompare(a.fieldEnd)), method: `sqrt(sample/1000) × 0.5^(age/${HALF_LIFE_DAYS}d) × mode factor` };
}
