// Electoral-district boundaries (the level below state/province/nation), downloaded once from official open map
// services, simplified, and cached in data/geo/. Each feature carries { name, key, parent } so the map can join it to
// the district results we already hold:
//   GBR  650 Westminster constituencies (July 2024) — Office for National Statistics, Open Government Licence v3
//   AUS  150 Commonwealth Electoral Divisions (ASGS 2025) — Australian Bureau of Statistics, CC BY 4.0
//   USA  435 congressional districts (116th/119th/120th Congress) — US Census Bureau TIGERweb, public domain
//   CAN  338/343 federal electoral districts (2013/2023 representation orders) — Open North "Represent" API,
//        redistributing Elections Canada / Statistics Canada boundaries (Open Government Licence – Canada)
import fs from 'node:fs';
import path from 'node:path';
import { getJson } from './live/http.js';
import { norm } from './geo.js';

const round = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 1e4) / 1e4, Math.round(c[1] * 1e4) / 1e4] : c.map(round));
const feat = (name, key, parent, geometry) => ({ type: 'Feature', properties: { name, key, parent: norm(parent) }, geometry: { type: geometry.type, coordinates: round(geometry.coordinates) } });

export const US_FIPS = { '01': 'Alabama', '02': 'Alaska', '04': 'Arizona', '05': 'Arkansas', '06': 'California', '08': 'Colorado', '09': 'Connecticut', '10': 'Delaware', '11': 'District of Columbia', '12': 'Florida', '13': 'Georgia', '15': 'Hawaii', '16': 'Idaho', '17': 'Illinois', '18': 'Indiana', '19': 'Iowa', '20': 'Kansas', '21': 'Kentucky', '22': 'Louisiana', '23': 'Maine', '24': 'Maryland', '25': 'Massachusetts', '26': 'Michigan', '27': 'Minnesota', '28': 'Mississippi', '29': 'Missouri', '30': 'Montana', '31': 'Nebraska', '32': 'Nevada', '33': 'New Hampshire', '34': 'New Jersey', '35': 'New Mexico', '36': 'New York', '37': 'North Carolina', '38': 'North Dakota', '39': 'Ohio', '40': 'Oklahoma', '41': 'Oregon', '42': 'Pennsylvania', '44': 'Rhode Island', '45': 'South Carolina', '46': 'South Dakota', '47': 'Tennessee', '48': 'Texas', '49': 'Utah', '50': 'Vermont', '51': 'Virginia', '53': 'Washington', '54': 'West Virginia', '55': 'Wisconsin', '56': 'Wyoming' };
const CA_PROV = { 10: 'Newfoundland and Labrador', 11: 'Prince Edward Island', 12: 'Nova Scotia', 13: 'New Brunswick', 24: 'Quebec', 35: 'Ontario', 46: 'Manitoba', 47: 'Saskatchewan', 48: 'Alberta', 59: 'British Columbia', 60: 'Yukon', 61: 'Northwest Territories', 62: 'Nunavut' };

// The district key used to join boundaries and results. US districts are keyed "<state>|<number>" (0 = at-large),
// because result sources name them differently ("California — District 12", "California U.S. House District 12").
export function usDistrictKey(state, area) {
  const a = String(area || ''); if (/at[- ]large/i.test(a)) return `${norm(state)}|0`;
  const m = a.match(/district\s*(\d+)/i); return m ? `${norm(state)}|${+m[1]}` : null;
}

const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer';
// Which congressional map to draw for an election year, and how exact it is.
function usMap(year) {
  if (year >= 2026) return { layer: 0, field: 'CD120', congress: 120, exact: true };
  if (year === 2024) return { layer: 4, field: 'CD119', congress: 119, exact: true };
  if (year === 2022) return { layer: 4, field: 'CD119', congress: 119, exact: false, why: 'District lines used in 2022 (118th Congress) are not in the Census map service, so the 2024 lines (119th) are drawn. Alabama, Georgia, Louisiana, New York and North Carolina redrew lines between the two elections, so shapes there may not match the 2022 results.' };
  if (year === 2018) return { layer: 12, field: 'CD116', congress: 116, exact: true };
  if (year >= 2012 && year <= 2020) return { layer: 12, field: 'CD116', congress: 116, exact: false, why: `Drawn with the lines used in 2018 (116th Congress). Some states redrew lines between 2012 and 2020 (for example Florida, North Carolina and Virginia in 2016, and Pennsylvania in 2018), so shapes there may not match the ${year} results.` };
  return null;
}

export function createDistricts(dataDir) {
  const dir = path.join(dataDir, 'geo'); fs.mkdirSync(dir, { recursive: true });
  const mem = new Map(); const inflight = new Map();
  async function cachedFc(k, build) {
    if (mem.has(k)) return mem.get(k);
    const file = path.join(dir, `${k}.json`);
    if (fs.existsSync(file)) { const d = JSON.parse(fs.readFileSync(file, 'utf8')); mem.set(k, d); return d; }
    if (inflight.has(k)) return inflight.get(k);
    const p = (async () => {
      console.log(`  [districts] downloading ${k}…`);
      const d = await build(); if (!d.features.length) throw new Error(`${k}: the boundary service returned no districts`);
      fs.writeFileSync(file, JSON.stringify(d)); mem.set(k, d);
      console.log(`  [districts] ${k}: ${d.features.length} districts cached (${(fs.statSync(file).size / 1048576).toFixed(1)} MB)`);
      return d;
    })().finally(() => inflight.delete(k));
    inflight.set(k, p); return p;
  }
  const arcgis = async (url, params) => {
    const out = []; let offset = 0;
    for (let guard = 0; guard < 20; guard++) {
      const q = new URLSearchParams({ where: '1=1', outFields: '*', outSR: '4326', f: 'geojson', geometryPrecision: '4', resultOffset: String(offset), resultRecordCount: '1000', ...params });
      const j = await getJson(`${url}/query?${q}`, { timeout: 90000, retries: 2, gapMs: 400 });
      if (j.error) throw new Error(j.error.message || 'map service error');
      const fs2 = (j.features || []).filter((f) => f.geometry); out.push(...fs2);
      if (!j.exceededTransferLimit && !(j.properties && j.properties.exceededTransferLimit) || !(j.features || []).length) break; offset += (j.features || []).length;
    }
    return out;
  };

  const builders = {
    GBR: async () => {
      const url = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Westminster_Parliamentary_Constituencies_July_2024_Boundaries_UK_BUC/FeatureServer/0';
      const fs2 = await arcgis(url, { outFields: 'PCON24CD,PCON24NM', maxAllowableOffset: '0.001' });
      const nation = { E: 'England', W: 'Wales', S: 'Scotland', N: 'Northern Ireland' };
      return { attribution: 'Constituencies: Office for National Statistics (July 2024), Open Government Licence v3.0', level: 'Constituencies',
        features: fs2.map((f) => feat(f.properties.PCON24NM, norm(f.properties.PCON24NM), nation[String(f.properties.PCON24CD)[0]] || '', f.geometry)) };
    },
    AUS: async () => {
      const url = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2025/CED/MapServer/0';
      const fs2 = await arcgis(url, { maxAllowableOffset: '0.003' });
      const pick = (p, re) => p[Object.keys(p).find((k) => re.test(k))];
      return { attribution: 'Divisions: Australian Bureau of Statistics, ASGS Edition 3 (2025), CC BY 4.0', level: 'Divisions',
        features: fs2.map((f) => ({ name: pick(f.properties, /^ced_name/i), st: pick(f.properties, /^state_name/i), g: f.geometry }))
          .filter((x) => x.name && !/no usual address|migratory|offshore|shipping/i.test(x.name))
          .map((x) => feat(x.name, norm(x.name), x.st, x.g)) };
    },
  };

  async function usa(year, parent) {
    const m = usMap(year); if (!m) return null;
    const fips = Object.keys(US_FIPS).find((k) => norm(US_FIPS[k]) === norm(parent)); if (!fips) return null;
    const d = await cachedFc(`dist-USA-${m.congress}-${fips}`, async () => {
      const fs2 = await arcgis(`${TIGER}/${m.layer}`, { where: `STATE='${fips}'`, outFields: `STATE,${m.field},BASENAME`, maxAllowableOffset: '0.002' });
      return { attribution: `Congressional districts (${m.congress}th Congress): US Census Bureau TIGERweb, public domain`, level: 'Congressional districts',
        features: fs2.map((f) => { const n = +f.properties[m.field]; const st = US_FIPS[fips]; const at = n === 0 || n === 98 || /at large/i.test(f.properties.BASENAME || '');
          return feat(at ? `${st} — at-large` : `${st} — District ${n}`, `${norm(st)}|${at ? 0 : n}`, st, f.geometry); }) };
    });
    return { ...d, exact: m.exact, note: m.why || '' };
  }

  // Represent's set names aren't guessable, so read its list of boundary sets once and pick the federal one whose
  // representation order fits the election (2023 order → 2025 election; 2013 order → 2015, 2019, 2021).
  let caSets = null;
  async function canSet(year) {
    if (!caSets) {
      const j = await getJson('https://represent.opennorth.ca/boundary-sets/?limit=1000', { timeout: 60000, retries: 1 });
      caSets = (j.objects || []).filter((o) => /federal electoral district/i.test(`${o.name} ${o.url}`))
        .map((o) => ({ slug: String(o.url || '').split('/').filter(Boolean).pop(), name: o.name, y: +(String(`${o.name} ${o.url}`).match(/(20\d\d)/) || [])[1] || 0 }));
      console.log(`  [districts] Represent federal sets: ${caSets.map((x) => `${x.slug} (${x.name})`).join(', ') || 'none'}`);
    }
    const want = year >= 2025 ? 2023 : year >= 2015 ? 2013 : 0; if (!want) return null;
    return caSets.find((x) => x.y === want) || (want === 2013 ? caSets.find((x) => !x.y) : null) || null;
  }
  async function can(year) {
    const set = await canSet(year); if (!set) return null;
    return cachedFc(`dist-CAN-${set.slug}`, async () => {
      const base = `https://represent.opennorth.ca/boundaries/${set.slug}/`;
      const meta = await getJson(`${base}?limit=1000`, { timeout: 60000, retries: 1 });
      const objs = meta.objects || []; if (!objs.length) throw new Error(`Represent: no boundaries in ${set.slug}`);
      const out = [];
      for (const o of objs) { // Represent allows about 60 requests a minute: one shape per second, cached after the first run
        const id = String(o.external_id || ''); const prov = CA_PROV[+id.slice(0, 2)] || '';
        const g = await getJson(`https://represent.opennorth.ca${o.url}simple_shape`, { timeout: 30000, retries: 2, gapMs: 1100 });
        if (g && g.type) out.push(feat(o.name, norm(o.name), prov, g));
      }
      return { attribution: `Electoral districts (${set.name}): Elections Canada / Statistics Canada via Open North Represent, Open Government Licence – Canada`, level: 'Electoral districts', features: out };
    });
  }

  return {
    // → FeatureCollection for the districts inside `parent` (a state / province / nation), or null when no map fits the year
    async get(country, year, parent) {
      let d;
      if (country === 'USA') d = await usa(year, parent);
      else if (country === 'CAN') d = await can(year);
      else if (country === 'GBR' && year >= 2024) d = await cachedFc('dist-GBR-2024', builders.GBR);
      else if (country === 'AUS' && year >= 2025) d = await cachedFc('dist-AUS-2025', builders.AUS);
      if (!d) return null;
      const pk = norm(parent); const features = parent ? d.features.filter((f) => f.properties.parent === pk) : d.features;
      return { type: 'FeatureCollection', ...d, features };
    },
  };
}
