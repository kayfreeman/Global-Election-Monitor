import { byCountryName } from '../model/countries.js';
// Free, keyless YouTube live lookup: given a channel URL (@handle, /channel/UC…
// or /c/…), fetch the public "/live" page and read which video is live now.
// No API key or quota. Cached for 3 minutes per channel.
import { get } from './http.js';

const DEFAULT_STREAMS_RAW = [ // handles checked Nov 2026 (each resolves to the broadcaster's channel)
  { id: 'ng-channels', label: 'Channels Television (Lagos)', country: 'NGA', type: 'youtube', url: 'https://www.youtube.com/@channelstelevision' },
  { id: 'ng-tvc', label: 'TVC News (Lagos)', country: 'NGA', type: 'youtube', url: 'https://www.youtube.com/@TVCNewsNigeria' },
  { id: 'us-nbc', label: 'NBC News NOW', country: 'USA', type: 'youtube', url: 'https://www.youtube.com/@NBCNews' },
  { id: 'us-livenow', label: 'LiveNOW from FOX', country: 'USA', type: 'youtube', url: 'https://www.youtube.com/@LiveNOWFOX' },
  { id: 'gb-sky', label: 'Sky News (UK)', country: 'GBR', type: 'youtube', url: 'https://www.youtube.com/@SkyNews' },
  { id: 'gb-gbnews', label: 'GB News', country: 'GBR', type: 'youtube', url: 'https://www.youtube.com/@GBNewsOnline' },
  { id: 'au-abc', label: 'ABC News Australia', country: 'AUS', type: 'youtube', url: 'https://www.youtube.com/@abcnewsaustralia' },
  { id: 'au-9news', label: '9News Australia', country: 'AUS', type: 'youtube', url: 'https://www.youtube.com/@9NewsAUS' },
  { id: 'ca-cbc', label: 'CBC News', country: 'CAN', type: 'youtube', url: 'https://www.youtube.com/@CBCNews' },
  { id: 'ca-ctv', label: 'CTV News', country: 'CAN', type: 'youtube', url: 'https://www.youtube.com/@CTVNews' },
  { id: 'ca-global', label: 'Global News', country: 'CAN', type: 'youtube', url: 'https://www.youtube.com/@globalnews' },
  { id: 'ca-cpac', label: 'CPAC', country: 'CAN', type: 'youtube', url: 'https://www.youtube.com/@CPAC' },
];
// Alphabetical by country name (Australia, Canada, Nigeria, United Kingdom, United States), then by name
export const DEFAULT_STREAMS = [...DEFAULT_STREAMS_RAW].sort((a, b) => byCountryName(a.country, b.country) || String(a.name || a.label).localeCompare(String(b.name || b.label)));

const cache = new Map();

/** Channel URL → base channel path, or null if the URL already names one video. */
export function channelBase(url) {
  try {
    const u = new URL(url); const host = u.hostname.replace(/^www\.|^m\./, '');
    if (!host.endsWith('youtube.com')) return null;
    const m = u.pathname.match(/^\/(@[\w.\-]+|channel\/UC[\w-]{20,}|c\/[\w.\-]+|user\/[\w.\-]+)/);
    return m ? `https://www.youtube.com/${m[1]}` : null;
  } catch { return null; }
}

/** Parse a YouTube /live page. Exported for tests. */
export function parseLivePage(html) {
  const canon = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
  const vid = (canon.match(/[?&]v=([\w-]{11})/) || [])[1] || null;
  const title = ((html.match(/<meta name="title" content="([^"]*)"/) || [])[1] || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  const liveNow = /"isLiveNow":true/.test(html) || /"isLive":true/.test(html);
  const upcoming = /"isUpcoming":true/.test(html) || /"upcomingEventData"/.test(html);
  const channelId = (html.match(/"(?:channelId|externalId)":"(UC[\w-]{22})"/) || [])[1] || null;
  const notEmbeddable = /"playableInEmbed":false/.test(html);
  return { videoId: vid, live: !!vid && liveNow && !upcoming, upcoming: !!vid && upcoming, title, channelId, embeddable: !notEmbeddable };
}

export async function resolveLive(url) {
  const base = channelBase(url);
  if (!base) return { error: 'Not a YouTube channel URL' };
  const hit = cache.get(base);
  if (hit && Date.now() - hit.at < 180000) return hit.data;
  let data;
  try {
    const html = await get(`${base}/live`, { timeout: 15000, gapMs: 400, retries: 1, headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36', 'accept-language': 'en-US,en;q=0.9', cookie: 'CONSENT=YES+cb; SOCS=CAI' } });
    data = { ...parseLivePage(html), channelUrl: base, checkedAt: new Date().toISOString() };
  } catch (e) { data = { error: e.message, channelUrl: base, checkedAt: new Date().toISOString() }; }
  cache.set(base, { at: Date.now(), data });
  return data;
}
