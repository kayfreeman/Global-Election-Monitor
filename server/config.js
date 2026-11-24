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

// Every setting the server reads from .env, with a one-line explanation. ensureEnvFile() adds any that are missing
// from the user's .env as empty lines (NAME=) and never changes or reads out a line that is already there.
export const ENV_SPEC = [
  ['Server', [
    ['GP_PORT', 'Port the dashboard runs on (empty = 4380)'],
    ['HOST', 'Listen address (empty = 127.0.0.1, this computer only; 0.0.0.0 = your network, then also set ADMIN_TOKEN)'],
    ['ADMIN_TOKEN', 'Moderator password for changing settings from another device (any long random string)'],
    ['OPEN_BROWSER', 'Set to 1 to open the browser when the server starts'],
  ]],
  ['Results data', [
    ['ELECTION_API_KEY', 'Election.org developer key (free, read-only): https://election.org/api/developers'],
    ['DATAVERSE_API_TOKEN', "Harvard Dataverse API token (free): downloads MIT's full U.S. House 1976-2024 file"],
    ['AP_API_KEY', 'Associated Press Elections API key (paid licence)'],
    ['VEC_FEED_URL', 'Victorian Electoral Commission results feed URL (after the VEC approves access)'],
    ['VEC_CANDIDATES_URL', 'VEC candidates file URL (after approval)'],
  ]],
  ['Social (check cost and terms before using)', [
    ['X_BEARER_TOKEN', 'X (Twitter) API bearer token (paid tiers)'],
    ['REDDIT_CLIENT_ID', 'Reddit app client ID (https://www.reddit.com/prefs/apps)'],
    ['REDDIT_CLIENT_SECRET', 'Reddit app secret'],
  ]],
];
const ENV_HEADER = ['# Global Election Monitor: private settings for this computer.', '# Not committed to GitHub (.gitignore lists .env). Never paste these values into chats or code.', '# One setting per line: NAME=value, no quotes, no spaces around "=". Leave empty if you do not have it.', ''];
export function ensureEnvFile() {
  const f = path.join(ROOT, '.env');
  let text = ''; try { text = fs.readFileSync(f, 'utf8'); } catch { /* created below */ }
  const lines = text ? text.split(/\r?\n/) : [...ENV_HEADER];
  const known = ENV_SPEC.flatMap(([, keys]) => keys.map(([k]) => k)); let changed = false;
  for (let i = 0; i < lines.length; i++) { // "# NAME=" with nothing after it is an unfilled slot: uncomment it so a value typed there is read
    const m = lines[i].match(/^\s*#\s*([A-Z0-9_]+)\s*=\s*$/); if (m && known.includes(m[1])) { lines[i] = `${m[1]}=`; changed = true; }
  }
  const has = (k) => lines.some((l) => new RegExp(`^\\s*#?\\s*${k}\\s*=`).test(l));
  const add = [];
  for (const [section, keys] of ENV_SPEC) {
    const missing = keys.filter(([k]) => !has(k)); if (!missing.length) continue;
    add.push('', `# ----- ${section} -----`); for (const [k, help] of missing) add.push(`# ${help}`, `${k}=`);
  }
  if (!add.length && text && !changed) return [];
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  try { fs.writeFileSync(f, `${[...lines, ...add].join('\n')}\n`); } catch (e) { console.warn(`Could not update .env: ${e.message}`); return []; }
  return add.filter((l) => /^[A-Z]/.test(l)).map((l) => l.slice(0, -1));
}

export function loadConfig() {
  const added = ensureEnvFile(); if (added.length) console.log(`  .env: added empty lines for ${added.join(', ')} (fill in the ones you have)`);
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
export const SECRET_KEYS = ['ADMIN_TOKEN', 'ELECTION_API_KEY', 'DATAVERSE_API_TOKEN', 'AP_API_KEY', 'X_BEARER_TOKEN', 'REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'VEC_FEED_URL', 'VEC_CANDIDATES_URL'];
export function writeEnv(patch) {
  const f = path.join(ROOT, '.env');
  const lines = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/) : ['# Global Election Monitor: private settings for this computer.', '# Not committed to GitHub (.gitignore lists .env). Never paste these values into chats or code.', ''];
  for (const [k, v] of Object.entries(patch)) {
    if (!SECRET_KEYS.includes(k) && k !== 'GP_PORT' && k !== 'HOST') continue;
    const clean = String(v ?? '').replace(/[\r\n]/g, '').trim();
    const i = lines.findIndex((l) => l.match(new RegExp(`^\\s*#?\\s*${k}\\s*=`)));
    const line = `${k}=${clean}`;
    if (i >= 0) lines[i] = line; else lines.push(line);
    if (clean) process.env[k] = clean; else delete process.env[k];
  }
  fs.writeFileSync(f, lines.join('\n').replace(/\n{3,}/g, '\n\n'));
}
export function maskedSecrets() {
  return Object.fromEntries(['GP_PORT', 'HOST', ...SECRET_KEYS].map((k) => { const v = process.env[k]; return [k, v ? (/URL|HOST|PORT/.test(k) ? v : `set ••••${v.slice(-4)}`) : '']; }));
}
