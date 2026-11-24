// Boundary service: downloads open administrative boundaries from
// geoBoundaries (simplified GeoJSON) once, trims them, caches them in
// data/geo/, and serves them per country/level. ADM2 features get a
// `parent` (their ADM1 name) by centroid-in-polygon so the map can show
// only the counties/LGAs inside the state you drill into.
//   Licences: USA Census (public domain), NGA GRID3 (CC BY 4.0), AUS/CAN
//   (CC BY 4.0), GBR ONS (OGL v3). Attribution is returned with every file.
import fs from 'node:fs';
import path from 'node:path';
import { get, getJson } from './live/http.js';

const API = 'https://www.geoboundaries.org/api/current/gbOpen';
const inflight = new Map();

export function norm(s) {
  let x = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[’'`.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  if (/federal capital|^fct\b/.test(x)) return 'fct';
  x = x.replace(/^the /, '').replace(/ (state|region|province)$/, '');
  return ({ nassarawa: 'nasarawa', 'manawatu wanganui': 'manawatu whanganui', 'akwa lbom': 'akwa ibom' })[x] || x;
}

const round = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 1e4) / 1e4, Math.round(c[1] * 1e4) / 1e4] : c.map(round));

function ringCentroid(r) { // area-weighted centroid of a ring (shoelace)
  let a = 0, x = 0, y = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; x += (r[j][0] + r[i][0]) * f; y += (r[j][1] + r[i][1]) * f; }
  return a ? [x / (3 * a), y / (3 * a), Math.abs(a / 2)] : [r[0][0], r[0][1], 0];
}
function featureCentroid(g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  let best = null; for (const p of polys) { const c = ringCentroid(p[0]); if (!best || c[2] > best[2]) best = c; }
  return best;
}
function inRing(pt, r) { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { if ((r[i][1] > pt[1]) !== (r[j][1] > pt[1]) && pt[0] < ((r[j][0] - r[i][0]) * (pt[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins; } return ins; }
function inGeom(pt, g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some((p) => inRing(pt, p[0]) && !p.slice(1).some((h) => inRing(pt, h)));
}
function bbox(g) { let b = [Infinity, Infinity, -Infinity, -Infinity]; const walk = (c) => { if (typeof c[0] === 'number') { b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; } else c.forEach(walk); }; walk(g.coordinates); return b; }

export function tagParents(a1, a2) {
  const boxes = a1.features.map((f) => [f, bbox(f.geometry)]);
  for (const f of a2.features) {
    const c = featureCentroid(f.geometry); if (!c) { f.properties.parent = null; continue; }
    const hit = boxes.find(([p, b]) => c[0] >= b[0] && c[0] <= b[2] && c[1] >= b[1] && c[1] <= b[3] && inGeom(c, p.geometry));
    f.properties.parent = hit ? hit[0].properties.key : null;
  }
  return a2;
}

async function download(iso, adm) {
  const meta = await getJson(`${API}/${iso}/${adm}/`, { timeout: 30000 });
  const raw = await get(meta.simplifiedGeometryGeoJSON, { timeout: 120000 }); // github.com/raw → follows redirect to the LFS media host
  const gj = JSON.parse(raw);
  if (!gj.features) throw new Error('unexpected geometry file (Git LFS pointer?)');
  return {
    type: 'FeatureCollection',
    attribution: `Boundaries: ${meta.boundarySource} via geoBoundaries (${meta.boundaryLicense})`,
    level: meta.boundaryCanonical, year: meta.boundaryYearRepresented,
    features: gj.features.map((f) => ({ type: 'Feature', properties: { name: f.properties.shapeName, id: f.properties.shapeID, key: norm(f.properties.shapeName) }, geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } })),
  };
}

export function createGeo(dataDir) {
  const dir = path.join(dataDir, 'geo'); fs.mkdirSync(dir, { recursive: true });
  const mem = new Map();
  async function load(iso, adm) {
    const k = `${iso}-${adm}`; if (mem.has(k)) return mem.get(k);
    const file = path.join(dir, `${k}.json`);
    if (fs.existsSync(file)) { const d = JSON.parse(fs.readFileSync(file, 'utf8')); mem.set(k, d); return d; }
    if (inflight.has(k)) return inflight.get(k);
    const p = (async () => {
      console.log(`  [geo] downloading ${k} boundaries from geoBoundaries…`);
      const d = await download(iso, adm);
      if (adm === 'ADM2') tagParents(await load(iso, 'ADM1'), d); // tag each ADM2 with its ADM1 parent
      fs.writeFileSync(file, JSON.stringify(d)); mem.set(k, d);
      console.log(`  [geo] ${k}: ${d.features.length} boundaries cached (${(fs.statSync(file).size / 1048576).toFixed(1)} MB)`);
      return d;
    })().finally(() => inflight.delete(k));
    inflight.set(k, p); return p;
  }
  return {
    async get(iso, adm, parent) {
      const d = await load(iso, adm);
      if (!parent) return d;
      const pk = norm(parent);
      return { ...d, features: d.features.filter((f) => f.properties.parent === pk) };
    },
    // diagnostic: which data names have no boundary (logged once per level)
    report(iso, adm, names) {
      const d = mem.get(`${iso}-${adm}`); if (!d) return;
      const keys = new Set(d.features.map((f) => f.properties.key));
      const miss = names.filter((n) => !keys.has(norm(n)));
      if (miss.length) console.log(`  [geo] ${iso}-${adm}: no boundary matched for ${miss.join(', ')}`);
    },
  };
}
