// Loads config.json (if present) over defaults, plus a minimal .env reader.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath handles Windows drive letters and spaces ("Global Polls")
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.join(ROOT, 'data');

const DEFAULTS = {
  port: 4380, // 8080 is often taken (EDB Postgres, Tomcat, Jenkins…)
  host: '127.0.0.1',
  mode: 'live', // 'live' = real sources only (simulation off) · 'simulation' = demo data
  adminToken: '',
  sim: { tickMs: 2000, durationTicks: 450, speed: 1 },
  map: { basemap: 'esri-gray', customUrl: '', customAttribution: '' },
  live: {},
  streams: [], // empty → built-in broadcaster live channels (server/live/youtube.js)
};

function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function loadConfig() {
  loadEnv();
  const f = path.join(ROOT, 'config.json');
  let user = {};
  if (fs.existsSync(f)) { try { user = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error('config.json is not valid JSON:', e.message); } }
  const cfg = { ...DEFAULTS, ...user, sim: { ...DEFAULTS.sim, ...(user.sim || {}) }, map: { ...DEFAULTS.map, ...(user.map || {}) }, live: { ...(user.live || {}) } };
  if (process.env.GP_PORT) cfg.port = +process.env.GP_PORT; // own name: a system-wide PORT (e.g. from EDB Postgres) must not hijack the dashboard
  if (process.env.HOST) cfg.host = process.env.HOST;
  if (process.env.ADMIN_TOKEN) cfg.adminToken = process.env.ADMIN_TOKEN;
  return cfg;
}

export function saveConfigPatch(patch) {
  const f = path.join(ROOT, 'config.json');
  let user = {};
  if (fs.existsSync(f)) { try { user = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* overwrite */ } }
  Object.assign(user, patch);
  fs.writeFileSync(f, JSON.stringify(user, null, 2));
}

// Secrets live in .env (never in config.json, never sent back to the browser in full)
export const SECRET_KEYS = ['ADMIN_TOKEN', 'ELECTION_API_KEY', 'AP_API_KEY', 'X_BEARER_TOKEN', 'REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'VEC_FEED_URL', 'VEC_CANDIDATES_URL', 'AEC_FEED_HOST', 'ECNZ_FEED_URL'];
export function writeEnv(patch) {
  const f = path.join(ROOT, '.env');
  const lines = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/) : ['# Global Election Monitor: private settings for this computer.', '# Not committed to GitHub (.gitignore lists .env). Never paste these values into chats or code.', ''];
  for (const [k, v] of Object.entries(patch)) {
    if (!SECRET_KEYS.includes(k) && k !== 'GP_PORT' && k !== 'HOST') continue;
    const clean = String(v ?? '').replace(/[\r\n]/g, '').trim();
    const i = lines.findIndex((l) => l.match(new RegExp(`^\\s*#?\\s*${k}\\s*=`)));
    const line = clean ? `${k}=${clean}` : `# ${k}=`;
    if (i >= 0) lines[i] = line; else lines.push(line);
    if (clean) process.env[k] = clean; else delete process.env[k];
  }
  fs.writeFileSync(f, lines.join('\n').replace(/\n{3,}/g, '\n\n'));
}
export function maskedSecrets() {
  return Object.fromEntries(['GP_PORT', 'HOST', ...SECRET_KEYS].map((k) => { const v = process.env[k]; return [k, v ? (/URL|HOST|PORT/.test(k) ? v : `set ••••${v.slice(-4)}`) : '']; }));
}
