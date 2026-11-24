// Starts every live source and registers the ones that are not reachable yet,
// so Sources Health always tells the truth.
import { startIrev } from './irev.js';
import { startLouisiana } from './louisiana.js';
import { startDemocracyClub } from './democracyclub.js';
import { startVec } from './vec.js';
import { startNews } from './news.js';

const PENDING = [
  { id: 'ap', name: 'AP Elections API', country: 'USA', kind: 'results', status: process.env.AP_API_KEY ? 'configured' : 'needs_key', docs: 'https://developer.ap.org/ap-elections-api/', note: 'Paid licence. Only national US source with race calls for every state.' },
  { id: 'us-states', name: 'Other US state portals', country: 'USA', kind: 'results', status: 'blocked', docs: '', note: 'Each state runs its own system; several (e.g. Kentucky) use bot protection. Add states one by one where a public JSON exists.' },
  { id: 'elections-canada', name: 'Elections Canada', country: 'CAN', kind: 'results', status: 'idle', docs: 'https://www.elections.ca/content.aspx?section=res&document=index&lang=e', note: 'Official results for general elections 2006–2025 load from the Election year list. Election-night results (enr.elections.ca) are only published during an election; none is scheduled.' },
  { id: 'aec', name: 'AEC Media Feed (federal)', country: 'AUS', kind: 'results', status: 'idle', docs: 'https://aec.gov.au/media/mediafeed', note: 'Federal elections only — none scheduled. Free registration via mediafeed@aec.gov.au.' },
  { id: 'x', name: 'X API', country: '*', kind: 'social', status: process.env.X_BEARER_TOKEN ? 'configured' : 'needs_key', docs: 'https://docs.x.com/x-api', note: 'Pay-per-use only — no free tier.' },
  { id: 'reddit', name: 'Reddit Data API', country: '*', kind: 'social', status: process.env.REDDIT_CLIENT_ID ? 'configured' : 'needs_key', docs: 'https://www.reddit.com/wiki/api', note: 'Free for approved non-commercial use only.' },
  { id: 'facebook', name: 'Meta Content Library', country: '*', kind: 'social', status: 'blocked', docs: 'https://developers.facebook.com/docs/content-library-and-api', note: 'Vetted researchers only.' },
  { id: 'nairaland', name: 'Nairaland', country: 'NGA', kind: 'social', status: 'blocked', docs: 'https://www.nairaland.com', note: 'No API; needs terms review / permission.' },
  { id: 'crowd', name: 'Native crowd reports', country: '*', kind: 'crowd', status: 'live', docs: '/api/reports', note: 'First-party reports, moderated.' },
];

export function startLive(hub, cfg = {}) {
  for (const p of PENDING) { const { status, ...d } = p; hub.source(d); hub.sources.get(p.id).status = status; }
  const run = (name, fn) => { try { fn(); } catch (e) { console.error(`  live source ${name} failed to start:`, e.message); } };
  run('irev', () => startIrev(hub, cfg.irev));
  run('louisiana', () => startLouisiana(hub, cfg.louisiana));
  run('democracyclub', () => startDemocracyClub(hub, cfg.democracyclub));
  run('vec', () => startVec(hub, cfg.vec));
  run('news', () => startNews(hub, cfg.news));
}
