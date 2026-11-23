// Polite HTTP client for public sources: identifies itself, times out,
// spaces requests per host and backs off after errors.
const UA = 'GlobalPolls/0.3 (election dashboard; contact via your operator)';
const lastHit = new Map(); // host -> timestamp

async function spaced(host, minGapMs) {
  const wait = (lastHit.get(host) || 0) + minGapMs - Date.now();
  lastHit.set(host, Date.now() + Math.max(0, wait));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retries busy/overloaded responses (429, 5xx) and timeouts with back-off.
export async function get(url, opts = {}) {
  const { retries = 2 } = opts;
  for (let attempt = 0; ; attempt++) {
    try { return await once(url, opts); }
    catch (e) {
      const transient = e.status === 429 || (e.status >= 500 && e.status <= 504) || e.name === 'TimeoutError' || e.name === 'AbortError' || /fetch failed|ECONNRESET|ETIMEDOUT/.test(e.message);
      if (!transient || attempt >= retries) throw e;
      await sleep(e.status === 429 ? 20000 * (attempt + 1) : 4000 * (attempt + 1));
    }
  }
}

async function once(url, { timeout = 20000, gapMs = 700, headers = {}, as = 'text' } = {}) {
  const host = new URL(url).host;
  await spaced(host, gapMs);
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*', ...headers }, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
  if (!res.ok) { const e = new Error(`HTTP ${res.status} ${res.statusText} — ${host}`); e.status = res.status; throw e; }
  if (as === 'json') return res.json();
  if (as === 'buffer') return Buffer.from(await res.arrayBuffer());
  return res.text();
}
export const getJson = (url, o = {}) => get(url, { ...o, as: 'json' });
