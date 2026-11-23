// News: publisher RSS/Atom feeds + GDELT DOC 2.0 (free, keyless global news
// index). Stores headline, link, source and a short snippet only — readers
// click through to the publisher. Check each publisher's RSS terms before
// commercial use (some, e.g. RNZ and the BBC, say personal/non-commercial use).
import { get, getJson } from './http.js';

// Verified 22 Nov 2026. guardian.ng and thecable.ng feeds are behind Cloudflare bot checks (not usable).
export const DEFAULT_FEEDS = [
  { id: 'premiumtimes', country: 'NGA', name: 'Premium Times', url: 'https://www.premiumtimesng.com/feed', filter: true },
  { id: 'channels', country: 'NGA', name: 'Channels TV', url: 'https://www.channelstv.com/feed/', filter: true },
  { id: 'vanguard', country: 'NGA', name: 'Vanguard', url: 'https://www.vanguardngr.com/feed/', filter: true },
  { id: 'npr', country: 'USA', name: 'NPR Politics', url: 'https://feeds.npr.org/1014/rss.xml' },
  { id: 'politico', country: 'USA', name: 'Politico', url: 'https://rss.politico.com/politics-news.xml' },
  { id: 'abc-au', country: 'AUS', name: 'ABC News (AU)', url: 'https://www.abc.net.au/news/feed/51120/rss.xml', filter: true },
  { id: 'guardian-au', country: 'AUS', name: 'Guardian Australia — politics', url: 'https://www.theguardian.com/australia-news/australian-politics/rss' },
  { id: 'bbc-pol', country: 'GBR', name: 'BBC News — politics', url: 'https://feeds.bbci.co.uk/news/politics/rss.xml', terms: 'BBC: personal, non-commercial use' },
  { id: 'guardian-uk', country: 'GBR', name: 'Guardian — politics', url: 'https://www.theguardian.com/politics/rss' },
  { id: 'rnz-pol', country: 'NZL', name: 'RNZ — politics', url: 'https://www.rnz.co.nz/rss/political.xml', terms: 'RNZ: personal use only' },
];
// GDELT queries per country (English-language coverage from that country's media)
export const GDELT = {
  NGA: '(election OR INEC OR "polling unit" OR governorship) sourcecountry:nigeria',
  USA: '(election OR runoff OR "vote count" OR midterm) sourcecountry:unitedstates',
  AUS: '("Victorian election" OR VEC OR "state election") sourcecountry:australia',
  GBR: '(election OR "by-election" OR polling) sourcecountry:unitedkingdom',
  NZL: '(election OR "special votes" OR "Electoral Commission") sourcecountry:newzealand',
};
const KEYWORDS = /elect|inec|poll|vote|ballot|campaign|primar|candidate|governor|senat|assembly|parliament|party|apc|pdp|labour|tinubu|obi|atiku|vec|runoff|by-election|referend/i;

const ent = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'").replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const t1 = (s, t) => (s.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, 'i')) || [])[1];

export function parseFeed(xml, feed) {
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  const entries = items.length ? [] : [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
  const out = [];
  for (const it of items) out.push({ title: ent(t1(it, 'title')), url: ent(t1(it, 'link')) || ent(t1(it, 'guid')), date: t1(it, 'pubDate') || t1(it, 'dc:date'), summary: ent(t1(it, 'description')) });
  for (const it of entries) out.push({ title: ent(t1(it, 'title')), url: (it.match(/<link[^>]*href="([^"]+)"/) || [])[1], date: t1(it, 'updated') || t1(it, 'published'), summary: ent(t1(it, 'summary') || t1(it, 'content')) });
  return out.filter((x) => x.title && x.url && (!feed.filter || KEYWORDS.test(x.title + ' ' + x.summary))).map((x) => ({
    id: x.url, url: x.url, title: x.title.slice(0, 300), summary: x.summary.slice(0, 220), ts: new Date(Date.parse(x.date) || Date.now()).toISOString(),
    country: feed.country, source: feed.name, sourceId: feed.id, via: 'rss',
  }));
}

export function parseGdelt(j, country) {
  return (j?.articles || []).map((a) => {
    const s = a.seendate || ''; const ts = s.length >= 15 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z` : new Date().toISOString();
    return { id: a.url, url: a.url, title: String(a.title || '').slice(0, 300), summary: '', ts, country, source: a.domain || 'GDELT', sourceId: 'gdelt', via: 'gdelt', lang: a.language };
  }).filter((x) => x.url && x.title);
}

export function startNews(hub, cfg = {}) {
  let gdeltPausedUntil = 0; let gdeltStart = 0;
  const opt = { enabled: true, everyMin: 10, gdelt: true, ...cfg };
  opt.feeds = (Array.isArray(cfg.feeds) && cfg.feeds.length ? cfg.feeds : DEFAULT_FEEDS).filter((f) => f.enabled !== false && f.url);
  const queries = Object.entries({ ...GDELT, ...(cfg.gdeltQueries || {}) }).filter(([, q]) => q && q.trim());
  hub.source({ id: 'news', name: 'News feeds (RSS)', country: '*', kind: 'news', docs: '', note: `${opt.feeds.length} publisher feeds. Headlines + links only.`, terms: 'Check each publisher\'s RSS terms before commercial use.' });
  hub.source({ id: 'gdelt', name: 'GDELT news index', country: '*', kind: 'news', docs: 'https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/', note: 'Free, keyless global news search (15-minute updates).' });
  if (!opt.enabled) { hub.status('news', { status: 'off' }); hub.status('gdelt', { status: 'off' }); return; }
  const feedStatus = {};
  async function run() {
    let ok = 0;
    for (const f of opt.feeds) {
      try { const items = parseFeed(await get(f.url, { gapMs: 300, timeout: 15000 }), f); hub.addNews(items); feedStatus[f.id] = { ok: true, n: items.length }; ok++; }
      catch (e) { feedStatus[f.id] = { ok: false, error: e.message }; }
    }
    const bad = Object.entries(feedStatus).filter(([, v]) => !v.ok);
    hub.status('news', { status: ok ? 'live' : 'error', items: hub.news.filter((n) => n.via === 'rss').length, lastError: bad.length ? `${bad.length} feed(s) failing: ${bad.map(([k, v]) => `${k} (${v.error})`).join('; ')}` : null, detail: `${ok}/${opt.feeds.length} feeds OK`, feeds: feedStatus });
    if (opt.gdelt && Date.now() >= gdeltPausedUntil) {
      // GDELT's free API rate-limits shared IPs. Take the countries in rotation, one request
      // at a time, and if it says "too many requests" stop and wait 30 minutes rather than retrying.
      let gok = 0; let gerr = null; const order = queries.map((_, i) => queries[(i + gdeltStart) % queries.length]); gdeltStart = (gdeltStart + 1) % Math.max(1, queries.length);
      for (const [c, q] of order) {
        try {
          const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q + ' sourcelang:english')}&mode=ArtList&format=json&maxrecords=40&timespan=2d&sort=DateDesc`;
          hub.addNews(parseGdelt(await getJson(url, { gapMs: 15000, timeout: 30000, retries: 0 }), c)); gok++;
        } catch (e) {
          if (e.status === 429) { gdeltPausedUntil = Date.now() + 30 * 60000; gerr = `GDELT is rate-limiting this connection — pausing 30 min (${gok}/${queries.length} countries fetched this round)`; break; }
          gerr = `${c}: ${e.message}`;
        }
      }
      hub.status('gdelt', { status: gok ? 'live' : 'error', items: hub.news.filter((n) => n.via === 'gdelt').length, lastError: gerr, detail: `${gok}/${queries.length} country queries OK` });
    }
  }
  run(); setInterval(run, opt.everyMin * 60000).unref();
}
