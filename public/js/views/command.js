// Global Command Center: five country cards, focus stream, verification wire,
// polling-aggregate vs actual returns.
import { state, api, esc, fmt, fmtK, pct, chip, icon, def, bar, party, leaderLabel, hhmmss, WIRE_TONE, setCountry, throttle, ago, isLive, yearFor, yearsFor, yearSelect, archiveFor, CUR_YEAR } from '../core.js';
import { embedHtml, isChannelUrl } from './streamutil.js';

export function mount(el) {
  let streams = []; let focusId = null; const onair = {}; let shownKey = ''; let averages = {}; let disposed = false;
  const arch = {}; // country → results for its selected year
  el.innerHTML = `
  <div class="p-4 space-y-4 max-w-[1800px]">
    <div class="flex flex-wrap items-center gap-2">
      ${isLive() ? chip('<span class="pulse"></span> Live mode · real public sources', 'green') : chip(`${icon('science', 'sm')} Operational theater: simulation exercise`, 'red')}
      <span id="cc-strip" class="font-mono text-[11px] text-slate-500 flex items-center gap-3"></span><span id="cc-year"></span>
      <span class="flex-1"></span>
      <a href="#/ledger" class="text-[12px] font-mono px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50">${icon('verified_user', 'sm')} LEDGER INTEGRITY</a>
      <a href="#/wall" class="text-[12px] font-mono px-3 py-1.5 rounded bg-sky-700 text-white hover:bg-sky-800">${icon('videocam', 'sm')} STREAM WALL</a>
    </div>
    <div id="cc-cards" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3"></div>
    <div class="grid grid-cols-12 gap-4">
      <section class="col-span-12 xl:col-span-8 card overflow-hidden">
        <div id="cc-stream-head" class="flex items-center gap-3 px-3 py-2 border-b border-slate-200"></div>
        <div id="cc-stream" class="aspect-video bg-slate-900"></div>
        <div id="cc-switch" class="flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-slate-200 bg-slate-50"></div>
      </section>
      <section class="col-span-12 xl:col-span-4 card flex flex-col max-h-[640px]">
        <div class="flex items-center justify-between px-3 py-2 border-b border-slate-200">
          <h3 class="font-semibold text-[16px] flex items-center gap-2">${icon('rss_feed')} Verification wire</h3>
          <select id="cc-wire-f" class="text-[11.5px] font-mono rounded border-slate-300 py-0.5"><option value="">All countries</option>${state.meta.order.map((c) => `<option>${c}</option>`).join('')}</select>
        </div>
        <div id="cc-wire" class="flex-1 overflow-y-auto scroll-thin divide-y divide-slate-100"></div>
      </section>
    </div>
    <div class="grid grid-cols-12 gap-4">
      <section class="col-span-12 xl:col-span-6 card"><div class="flex items-center justify-between px-3 py-2 border-b border-slate-200"><h3 id="cc-live-h" class="font-semibold text-[16px] flex items-center gap-2"><span class="text-green-600"><span class="pulse"></span></span> Live results — real sources</h3><a href="#/live" class="text-sky-700 text-[12px] font-mono">all results →</a></div><div id="cc-live" class="divide-y divide-slate-100"></div></section>
      <section class="col-span-12 xl:col-span-6 card"><div class="flex items-center justify-between px-3 py-2 border-b border-slate-200"><h3 class="font-semibold text-[16px] flex items-center gap-2">${icon('newspaper')} Latest headlines</h3><a href="#/news" class="text-sky-700 text-[12px] font-mono">news wire →</a></div><div id="cc-news" class="divide-y divide-slate-100"></div></section>
    </div>
    <section class="card">
      <div class="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-slate-200">
        <div><h3 class="font-bold text-[18px] flex items-center gap-2">${icon('monitoring')} Polling aggregate vs actual returns</h3>
        <p class="text-[13px] text-slate-500">Weighted poll average (sample size × recency × mode) against the current tally in each jurisdiction.</p></div>
        <span id="cc-polls-note"></span>
      </div>
      <div class="grid grid-cols-12 gap-4 p-4">
        <div class="col-span-12 lg:col-span-5"><div class="lbl mb-2">Leader margin: poll average vs tally (pts)</div><div id="cc-moe"></div></div>
        <div class="col-span-12 lg:col-span-7 overflow-x-auto"><table class="w-full text-[13px]" id="cc-polls"></table></div>
      </div>
    </section>
  </div>`;

  const $ = (s) => el.querySelector(s);

  // headline result for a country's selected year (declared/official archive + live)
  function headline(a) {
    const cs = (a?.contests || []).filter((x) => !x.test);
    const overall = cs.filter((x) => !x.electionId || x.id === x.electionId);
    const tot = (x) => x.choices.reduce((s, y) => s + y.votes, 0);
    return overall.find((x) => x.level === 'national') || overall.slice().sort((p, q) => tot(q) - tot(p))[0] || null;
  }
  function yearCard(c) {
    const d = def(c); const y = yearFor(c); const a = arch[c];
    const h = headline(a); const n = (a?.contests || []).filter((x) => !x.test && (!x.electionId || x.id === x.electionId)).length;
    const head = `<div class="flex items-center gap-2 mb-1"><span class="font-bold text-[18px]">${c}</span>${chip(String(y), 'blue')}<span class="flex-1"></span>${h ? chip(h.declared ? 'Declared' : h.official ? 'Official' : 'Results', 'green') : chip(a ? 'No results' : 'Loading…', 'slate')}</div>`;
    if (!h) return `<a href="#/live/${c}" class="card text-left p-3 hover:border-sky-400 block ${c === state.country ? 'ring-1 ring-sky-500' : ''}">${head}<div class="text-[12.5px] text-slate-500 mt-2 h-[120px] overflow-hidden">${a ? esc((a.notes || []).join(' ') || `No results found for ${y}.`) : `Loading ${y}…`}</div></a>`;
    const t = h.choices.reduce((s, x) => s + x.votes, 0); const top = h.choices.slice(0, 2);
    return `<a href="#/live/${c}" class="card text-left p-3 hover:border-sky-400 block ${c === state.country ? 'ring-1 ring-sky-500' : ''}">${head}
      <div class="text-[12.5px] text-slate-600 leading-tight h-8 overflow-hidden">${esc(h.electionTitle || (h.area && !String(h.title).includes(h.area) ? `${h.title} — ${h.area}` : h.title))}</div>
      ${top.map((x) => `<div class="mt-1.5"><div class="flex items-center gap-1.5 text-[12.5px]"><span class="w-2 h-2 rounded-sm shrink-0" style="background:${party(c, x.partyCode).color}"></span><span class="truncate flex-1 ${x.elected ? 'font-semibold' : ''}">${esc(x.name)} <span class="text-slate-500">${esc(x.party || '')}</span></span><span class="num">${t ? pct(x.votes / t, 1) : '—'}</span></div><div class="mt-0.5">${bar(t ? x.votes / t : 0, party(c, x.partyCode).color, 'h-1')}</div></div>`).join('')}
      <dl class="mt-2 grid grid-cols-2 gap-y-0.5 text-[11px] font-mono"><dt class="text-slate-500">VOTES</dt><dd class="text-right">${fmt(t)}</dd><dt class="text-slate-500">ELECTIONS / CONTESTS</dt><dd class="text-right">${fmt(n)}</dd></dl></a>`;
  }
  async function loadArch(c) {
    const y = yearFor(c); if (arch[c] && arch[c].year !== y) { delete arch[c]; cards(); liveStrip(); }
    let a; try { a = await archiveFor(c, y); } catch (e) { a = { year: y, contests: [], notes: [e.message] }; }
    if (yearFor(c) !== y) return; // a newer year was picked while this one loaded
    arch[c] = { ...a, year: y }; if (!disposed) { cards(); liveStrip(); }
  }
  function loadAllArch() { for (const c of state.meta.order) loadArch(c); }

  function liveCard(c) {
    if (yearFor(c) !== CUR_YEAR || headline(arch[c]) || !state.summary[c]?.live?.count) return yearCard(c);
    const s = state.summary[c]; const d = def(c); const L = (s && s.live) || {};
    const tone = L.status === 'live' ? 'green' : L.status === 'test' ? 'amber' : L.status === 'error' ? 'red' : 'slate';
    const col = { green: '#16a34a', amber: '#d97706', red: '#dc2626', slate: '#94a3b8' }[tone];
    return `<a href="#/live/${c}" class="card text-left p-3 hover:border-sky-400 block ${c === state.country ? 'ring-1 ring-sky-500' : ''}">
      <div class="flex items-center gap-2 mb-1"><span class="font-bold text-[18px]">${c}</span>${chip(esc(L.source || d.authorityShort), 'blue')}<span class="flex-1"></span>${chip(({ live: 'Live', test: 'Test data', error: 'Error', none: 'No source' })[L.status] || 'No source', tone)}</div>
      <div class="text-[12.5px] text-slate-600 leading-tight h-8 overflow-hidden">${esc(L.title || d.election.name)}</div>
      ${L.count ? `<div class="flex items-end justify-between mt-1"><span class="num text-[30px] font-semibold leading-none" style="color:${col}">${pct(L.pct || 0, L.pct > 0.99 && L.pct < 1 ? 2 : 1)}</span><span class="num text-[10.5px] text-slate-500 text-right">${esc(L.metric || '')}</span></div><div class="mt-2">${bar(L.pct || 0, col)}</div>`
        : `<div class="mt-2 text-[12px] text-slate-500 h-[46px] overflow-hidden">${esc(L.detail || 'No reachable public results source.')}</div>`}
      <p class="mt-2 text-[12px] leading-snug text-slate-700 h-[34px] overflow-hidden">${L.count ? esc(L.detail || '') : ''}</p>
      <dl class="mt-1 grid grid-cols-2 gap-y-0.5 text-[11px] font-mono">
        <dt class="text-slate-500">${esc((L.unit || 'items').toUpperCase())}</dt><dd class="text-right">${fmt(L.count || 0)}</dd>
        <dt class="text-slate-500">UPDATED</dt><dd class="text-right">${L.updatedAt ? ago(L.updatedAt) : '—'}</dd>
      </dl></a>`;
  }

  function cards() {
    if (disposed) return;
    if (isLive()) {
      $('#cc-cards').innerHTML = state.meta.order.map(liveCard).join('');
      const n = state.meta.order.reduce((a, c) => a + (state.summary[c]?.live?.count || 0), 0);
      $('#cc-strip').innerHTML = `<span>LATENCY: <b class="text-slate-800">${state.latency ?? '—'}ms</b></span><span>LIVE ITEMS: <b class="text-slate-800">${fmt(n)}</b></span><span>LEDGER: <b class="text-slate-800">#${state.ledgerHead.seq}</b></span>`;
      return;
    }
    $('#cc-cards').innerHTML = state.meta.order.map((c) => {
      const s = state.summary[c]; const d = def(c); if (!s) return '';
      const col = s.highIncidents ? '#dc2626' : s.pct >= 1 ? '#16a34a' : '#0284c7';
      return `<button data-go="${c}" class="card text-left p-3 hover:border-sky-400 ${c === state.country ? 'ring-1 ring-sky-500' : ''}">
        <div class="flex items-center gap-2 mb-1"><span class="font-bold text-[18px]">${c}</span>${chip(esc(d.authorityShort), 'blue')}<span class="flex-1"></span>${s.running ? '<span class="text-green-600"><span class="pulse"></span></span>' : chip('paused', 'slate')}</div>
        <div class="text-[12.5px] text-slate-600 leading-tight h-8 overflow-hidden">${esc(d.election.name)}</div>
        <div class="flex items-end justify-between mt-1"><span class="num text-[30px] font-semibold leading-none" style="color:${col}">${pct(s.pct)}</span><span class="num text-[10.5px] text-slate-500">${fmtK(s.cast)} cast</span></div>
        <div class="mt-2">${bar(s.pct, col)}</div>
        <div class="mt-1.5">${(() => { const tot = Object.values(s.votes).reduce((a, b) => a + b, 0); return tot ? `<div class="w-full h-1.5 flex rounded-sm overflow-hidden">${d.parties.map((p) => `<div style="width:${s.votes[p.code] / tot * 100}%;background:${p.color}"></div>`).join('')}</div>` : ''; })()}</div>
        <dl class="mt-2 grid grid-cols-2 gap-y-0.5 text-[11px] font-mono">
          <dt class="text-slate-500">LEADING</dt><dd class="text-right">${leaderLabel(c, s)}</dd>
          <dt class="text-slate-500">${esc(d.unitWord.toUpperCase())}</dt><dd class="text-right">${fmt(s.reported)} / ${fmt(s.leafCount)}</dd>
          <dt class="text-slate-500">TURNOUT</dt><dd class="text-right">${pct(s.turnout)}</dd>
          <dt class="text-slate-500">OPEN FLAGS</dt><dd class="text-right ${s.openIncidents ? 'text-red-600 font-semibold' : ''}">${s.openIncidents}${s.highIncidents ? ` (${s.highIncidents} high)` : ''}</dd>
        </dl></button>`;
    }).join('');
    const total = state.meta.order.reduce((a, c) => a + (state.summary[c]?.reported || 0), 0);
    $('#cc-strip').innerHTML = `<span>LATENCY: <b class="text-slate-800">${state.latency ?? '—'}ms</b></span><span>UNITS IN: <b class="text-slate-800">${fmt(total)}</b></span><span>LEDGER: <b class="text-slate-800">#${state.ledgerHead.seq}</b></span>`;
  }

  function wire() {
    const f = $('#cc-wire-f').value;
    const rows = state.wire.filter((w) => !f || w.country === f).slice(0, 60);
    $('#cc-wire').innerHTML = rows.length ? rows.map((w) => `
      <div class="px-3 py-2.5 hover:bg-slate-50">
        <div class="flex items-center gap-2 mb-1">${chip(w.kind === 'DECLARATION' ? 'Provisional declaration' : w.kind.toLowerCase(), WIRE_TONE[w.kind])}<span class="font-mono text-[10.5px] text-slate-500">${w.country}</span><span class="flex-1"></span><span class="font-mono text-[10.5px] text-slate-500">${hhmmss(w.ts)} UTC</span></div>
        <p class="text-[13px] leading-snug">${esc(w.text)}</p>
        <div class="flex items-center gap-3 mt-1 text-[10.5px] font-mono">
          ${w.live ? `<span class="text-emerald-700">${w.test ? 'TEST FEED' : 'LIVE SOURCE'}</span>` : w.simulated !== false ? '<span class="text-amber-700">SIMULATED</span>' : '<span class="text-violet-700">FIRST-PARTY</span>'}
          ${w.url ? `<a class="text-sky-700" href="${esc(w.url)}" target="_blank" rel="noopener">source ↗</a>` : ''}
          ${w.ledgerSeq ? `<a class="text-sky-700" href="#/ledger">ledger #${w.ledgerSeq}</a>` : ''}
          ${w.nodeId ? `<a class="text-sky-700" href="#/drilldown/${encodeURIComponent(w.nodeId)}">open report →</a>` : ''}${w.live ? `<a class="text-sky-700" href="#/live/${w.country}">live results →</a>` : ''}
        </div></div>`).join('') : `<div class="p-4 text-sm text-slate-400">${isLive() ? 'Live wire: new declarations, count updates and IReV uploads appear here as sources change (quiet between elections).' : 'Waiting for wire events…'}</div>`;
  }

  // YouTube channel links are resolved by the server to the video that channel is streaming now
  const isChan = (x) => x.url && x.type === 'youtube' && isChannelUrl(x.url);
  const isOn = (x) => !!x.url && (!isChan(x) || !!onair[x.id]?.live);
  const watch = (x) => { const r = onair[x.id]; return r?.videoId ? `https://www.youtube.com/watch?v=${r.videoId}` : isChan(x) ? `${(r && r.channelUrl) || x.url}/live` : x.url; };
  async function resolveStreams() {
    await Promise.all(streams.filter(isChan).map(async (x) => { onair[x.id] = await api.get(`/api/streams/resolve?url=${encodeURIComponent(x.url)}`).catch((e) => ({ error: e.message })); }));
    if (!disposed) streamArea();
  }
  function streamArea() {
    if (disposed) return;
    const country = state.country;
    const list = streams.filter((x) => x.url);
    const pinned = streams.find((x) => x.id === focusId);
    const focus = pinned || list.find((x) => x.country === country && isOn(x)) || list.find(isOn) || list.find((x) => x.country === country) || list[0];
    focusId = pinned ? pinned.id : null; const fid = focus?.id;
    const r = focus ? onair[focus.id] : null; const chan = focus && isChan(focus);
    const status = !focus ? 'none' : !chan ? 'on' : !r ? 'checking' : r.error ? 'error' : r.live && r.embeddable !== false ? 'on' : r.upcoming ? 'scheduled' : r.videoId && r.embeddable === false ? 'blocked' : 'off';
    $('#cc-stream-head').innerHTML = focus
      ? `${status === 'on' ? chip('<span class="pulse"></span> On air', 'solidred') : chip({ checking: 'Checking…', off: 'Off air', scheduled: 'Scheduled', blocked: 'Embedding blocked', error: 'Unreachable' }[status], 'slate')}<b class="text-[15px]">${esc(focus.label)}</b><span class="font-mono text-[11px] text-slate-500 truncate">${focus.country}${r?.title ? ` · ${esc(r.title)}` : ''}</span><span class="flex-1"></span><a href="${esc(watch(focus))}" target="_blank" rel="noopener" class="text-[11.5px] font-mono text-sky-700 shrink-0">YouTube ↗</a>`
      : `${chip('No feed', 'slate')}<b class="text-[15px]">No live streams configured</b>`;
    const key = `${fid}|${status}|${r?.videoId || ''}`;
    if (key !== shownKey) { // only rebuild the player when what should play has changed
      shownKey = key;
      const msg = (ic, t) => `<div class="h-full flex flex-col items-center justify-center text-slate-400 gap-2 p-6 text-center">${icon(ic, 'lg')}<p class="text-sm">${t}</p>${focus ? `<a href="${esc(watch(focus))}" target="_blank" rel="noopener" class="text-sky-400 text-sm underline">Open on YouTube ↗</a>` : ''}</div>`;
      $('#cc-stream').innerHTML = !focus ? `<div class="h-full flex flex-col items-center justify-center text-slate-400 gap-2 p-6 text-center">${icon('videocam_off', 'lg')}<p class="text-sm">Add broadcaster stream URLs on the Stream Wall.</p><a href="#/wall" class="text-sky-400 text-sm underline">Configure streams →</a></div>`
        : status === 'on' ? embedHtml(focus, { muted: true, autoplay: true, videoId: chan ? r.videoId : null })
        : status === 'checking' ? msg('hourglass_top', 'Looking up the live broadcast…')
        : status === 'error' ? msg('error', `Couldn't reach this channel (${esc(r.error)}).`)
        : status === 'blocked' ? msg('block', 'This broadcaster doesn’t allow its stream to be embedded.')
        : status === 'scheduled' ? msg('schedule', `Scheduled: ${esc(r.title || '')}`)
        : msg('tv_off', 'This channel is not live right now — pick another feed below.');
    }
    $('#cc-switch').innerHTML = `<span class="lbl mr-1">Feed switcher:</span>` + streams.filter((x) => x.url).map((x) => `<button data-focus="${x.id}" class="text-[11px] font-mono px-2 py-1 rounded border ${x.id === fid ? 'bg-sky-700 text-white border-sky-700' : isOn(x) ? 'bg-white border-slate-300 hover:bg-slate-100' : 'bg-slate-100 border-slate-200 text-slate-400'}">${isOn(x) ? '● ' : ''}${esc(x.label)}${isChan(x) && onair[x.id] && !isOn(x) ? ' (off air)' : ''}</button>`).join('');
  }

  function polls() {
    if (disposed) return;
    const rows = state.meta.order.map((c) => {
      const a = averages[c]; const s = state.summary[c]; const d = def(c);
      if (!a || !a.n) return { c, d, a: null, s };
      const ranked = Object.entries(a.shares).sort((x, y) => y[1] - x[1]);
      const pollLead = ranked[0]; const pollMargin = ranked[0][1] - (ranked[1]?.[1] || 0);
      const actualShare = s.ranked.find((r) => r.code === pollLead[0]);
      // tally margin of the poll leader vs its strongest rival (negative = trailing)
      const others = s.ranked.filter((r) => r.code !== pollLead[0]).map((r) => r.share * 100);
      const actualMargin = s.ranked.length ? (actualShare ? actualShare.share * 100 : 0) - Math.max(...others) : null;
      return { c, d, a, s, pollLead, pollMargin, actualShare: actualShare ? actualShare.share * 100 : null, actualMargin };
    });
    const demo = rows.some((r) => r.a && r.a.demoOnly);
    $('#cc-polls-note').innerHTML = demo ? chip('Seed polls are DEMO placeholders — add real polls', 'amber') : '';
    $('#cc-polls').innerHTML = `<thead><tr class="text-left">${['Jurisdiction', 'Poll leader (avg)', 'Tally share', 'Variance', 'Polls', 'Tally in'].map((h, i) => `<th class="lbl py-2 px-2 bg-slate-50 border-b border-slate-300 ${i > 1 ? 'text-right' : ''}">${h}</th>`).join('')}</tr></thead><tbody>` +
      rows.map((r, i) => {
        if (!r.a) return `<tr><td class="px-2 py-2 font-semibold">${r.c}</td><td colspan="5" class="px-2 text-slate-400">No polls loaded</td></tr>`;
        const p = party(r.c, r.pollLead[0]); const v = r.actualShare != null && r.s.reported ? r.actualShare - r.pollLead[1] : null;
        return `<tr class="${i % 2 ? 'bg-slate-50' : ''} border-b border-slate-100">
          <td class="px-2 py-2"><b>${r.c}</b> <span class="text-slate-500 text-[12px]">${esc(r.d.election.name.split('(')[0])}</span></td>
          <td class="px-2 font-mono" style="color:${p.color}">${esc(p.code)} ${r.pollLead[1].toFixed(1)}%</td>
          <td class="px-2 font-mono text-right">${r.s.reported ? r.actualShare.toFixed(1) + '%' : '—'}</td>
          <td class="px-2 font-mono text-right ${v == null ? '' : Math.abs(v) <= r.a.moe ? 'text-green-700' : 'text-amber-700'}">${v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1)}${v == null ? '' : Math.abs(v) <= r.a.moe ? ' (in band)' : ' (skew)'}</td>
          <td class="px-2 font-mono text-right">${r.a.n}${r.a.demoOnly ? ' <span class="text-amber-600">demo</span>' : ''}</td>
          <td class="px-2 font-mono text-right">${pct(r.s.pct, 0)}</td></tr>`;
      }).join('') + '</tbody>';
    // margin dot chart
    const W = 460, rowH = 34, H = rows.length * rowH + 34, x0 = 60, x1 = W - 16, span = 30;
    const X = (v) => x0 + ((Math.max(-span, Math.min(span, v)) + span) / (2 * span)) * (x1 - x0);
    $('#cc-moe').innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="w-full">
      <line x1="${X(0)}" x2="${X(0)}" y1="4" y2="${H - 26}" stroke="#94a3b8" stroke-dasharray="3 3"/>
      ${[-30, -15, 0, 15, 30].map((t) => `<text x="${X(t)}" y="${H - 10}" font-size="10" text-anchor="middle" fill="#64748b" font-family="JetBrains Mono">${t > 0 ? '+' : ''}${t}</text>`).join('')}
      ${rows.map((r, i) => { const y = 18 + i * rowH; if (!r.a) return `<text x="0" y="${y + 4}" font-size="11" fill="#94a3b8" font-family="JetBrains Mono">${r.c}</text>`;
        const pm = r.pollMargin, am = r.actualMargin;
        return `<text x="0" y="${y + 4}" font-size="11" font-weight="600" fill="#0f172a" font-family="JetBrains Mono">${r.c}</text>
          <rect x="${X(pm - r.a.moe * 2)}" y="${y - 7}" width="${Math.max(2, X(pm + r.a.moe * 2) - X(pm - r.a.moe * 2))}" height="14" rx="3" fill="#bae6fd" opacity=".7"/>
          <circle cx="${X(pm)}" cy="${y}" r="5" fill="#0284c7"/>
          ${am != null && r.s.reported ? `<circle cx="${X(am)}" cy="${y}" r="5" fill="#ea580c" stroke="#fff" stroke-width="1.5"/>` : ''}`; }).join('')}
    </svg>
    <div class="flex gap-4 text-[11px] font-mono text-slate-600 mt-1"><span><span class="inline-block w-2.5 h-2.5 rounded-full bg-sky-600 align-middle"></span> poll-average margin (band ≈ ±2× MOE)</span><span><span class="inline-block w-2.5 h-2.5 rounded-full bg-orange-600 align-middle"></span> tally margin for same party</span></div>
    <p class="text-[11px] text-slate-500 mt-2">Method: ${esc(Object.values(averages)[0]?.method || '')}. MOE ignores house effects; treat as a rough band.</p>`;
  }

  function liveStrip() {
    if (disposed) return;
    const c = state.country;
    let html = '';
    if (c === 'NGA') html = state.live.irev.slice(0, 4).map((t) => `<a href="#/live/NGA" class="flex items-center gap-3 px-3 py-2 hover:bg-slate-50">${chip('IReV', 'green')}<span class="flex-1 text-[13px] truncate">${esc(t.name)}</span><span class="w-28">${bar(t.pct, '#16a34a', 'h-1')}</span><span class="num text-[12px] w-24 text-right">${fmt(t.uploaded)}/${fmt(t.expected)}</span></a>`).join('');
    const y = yearFor(c); const hh = $('#cc-live-h'); if (hh) hh.innerHTML = `${y === CUR_YEAR ? '<span class="text-green-600"><span class="pulse"></span></span>' : ''} Results ${y} — ${esc(def(c).name)}`;
    const pool = (arch[c]?.contests || state.live.contests.filter((x) => x.country === c)).filter((x) => !x.test && (!x.electionId || x.id === x.electionId));
    if (c === 'NGA' && (y !== CUR_YEAR || !html)) html = '';
    if (c === 'NGA' && pool.length) html = pool.slice().sort((a, b) => (a.level === 'national' ? -1 : 1) - (b.level === 'national' ? -1 : 1) || String(a.area).localeCompare(String(b.area))).slice(0, 8).map((x) => { const tot = x.choices.reduce((a, y2) => a + y2.votes, 0); const top = x.choices[0];
      return `<a href="#/live/NGA" class="flex items-center gap-3 px-3 py-2 hover:bg-slate-50">${chip(x.declared ? 'Declared' : 'Official', 'green')}<span class="flex-1 text-[13px] truncate">${esc(x.electionTitle || x.title)}</span><span class="text-[12.5px] truncate max-w-[40%]" style="color:${party(c, top?.partyCode).color}">${top ? `${esc(top.name)} ${tot ? pct(top.votes / tot) : ''}` : ''}</span></a>`; }).join('') + html;
    else if (c !== 'NGA') html = pool.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.officeLevel || 999) - (b.officeLevel || 999)).slice(0, 5).map((x) => { const tot = x.choices.reduce((a, y) => a + y.votes, 0); const top = x.choices[0];
      return `<a href="#/live/${c}" class="flex items-center gap-3 px-3 py-2 hover:bg-slate-50">${x.test ? chip('Test', 'amber') : x.official ? chip('Official', 'green') : chip('Unofficial', 'blue')}<span class="flex-1 text-[13px] truncate">${esc(x.title)} <span class="text-slate-500">${esc(x.area || '')}</span></span><span class="text-[12.5px] truncate max-w-[40%]" style="color:${party(c, top?.partyCode).color}">${top ? `${esc(top.name)} ${tot ? pct(top.votes / tot) : ''}${top.elected ? ' ✓' : ''}` : ''}</span></a>`; }).join('');
    $('#cc-live').innerHTML = html || `<div class="p-3 text-[13px] text-slate-500">${arch[c] ? `No results for ${esc(def(c).name)} in ${y}.` : `Loading ${y}…`} See <a href="#/live/${c}" class="text-sky-700">Results</a> for source status.</div>`;
    yearsFor(c).then((ys) => { const b = $('#cc-year'); if (b && !b.contains(document.activeElement)) b.innerHTML = yearSelect(c, ys); });
    const news = state.news.filter((n) => n.country === c).slice(0, 7);
    $('#cc-news').innerHTML = news.map((n) => `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer" class="block px-3 py-2 hover:bg-slate-50"><div class="text-[13.5px] font-medium leading-snug">${esc(n.title)}</div><div class="font-mono text-[10.5px] text-slate-500 mt-0.5">${esc(n.source)} · ${ago(n.ts)}</div></a>`).join('') || '<div class="p-3 text-[13px] text-slate-500">Fetching headlines…</div>';
  }

  async function loadStreams() { streams = await api.get('/api/streams').catch(() => []); streamArea(); resolveStreams(); }
  async function loadPolls() { averages = await api.get('/api/polls/average').catch(() => ({})); polls(); }

  el.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]'); if (go) { setCountry(go.dataset.go); location.hash = `#/drilldown/${go.dataset.go}`; return; }
    const f = e.target.closest('[data-focus]'); if (f) { focusId = f.dataset.focus; streamArea(); }
  });
  $('#cc-wire-f').addEventListener('change', wire);

  cards(); wire(); liveStrip(); loadStreams(); loadPolls(); if (isLive()) loadAllArch();
  const slow = throttle(() => { cards(); polls(); }, 1500);
  const pollTimer = setInterval(loadPolls, 30000);
  const streamTimer = setInterval(() => { if (!document.hidden) resolveStreams(); }, 180000);
  return {
    update(kind, d) {
      if (kind === 'tick' || kind === 'hello') { slow(); wire(); }
      if (kind === 'country') { cards(); streamArea(); liveStrip(); }
      if (kind === 'live' || kind === 'news') liveStrip();
      if (kind === 'year' && isLive()) loadAllArch();
    },
    unmount() { disposed = true; clearInterval(pollTimer); clearInterval(streamTimer); },
  };
}
