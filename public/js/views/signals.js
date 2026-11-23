// Intelligence & Social Signal Feed: merges official/wire events, first-party
// crowd reports and social posts, with rumour detection and a moderation queue.
import { state, api, esc, fmt, chip, icon, def, bar, statusChip, ago, hhmmss, WIRE_TONE, toast, throttle } from '../core.js';
import { openReportModal } from './crowd.js';

const PLAT = { x: ['X / Twitter', 'X', 'bg-slate-900 text-white'], nairaland: ['Nairaland', 'NL', 'bg-green-700 text-white'], reddit: ['Reddit', 'RD', 'bg-orange-600 text-white'], facebook: ['Facebook public', 'FB', 'bg-blue-700 text-white'] };
const TOPICS = ['Voting equipment', 'Queues & wait times', 'Ballot logistics', 'Turnout', 'Results claims'];

export function mount(el) {
  let src = 'all'; let topic = null; let q = ''; let scope = 'country'; let disposed = false;

  el.innerHTML = `<div class="p-4 max-w-[1800px] space-y-3">
    <section class="card p-4">
      <div class="flex flex-wrap items-start gap-4">
        <div class="flex-1 min-w-[280px]"><h2 class="font-bold text-[20px] flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>MULTI-PLATFORM INGESTION STREAM</h2>
          <p class="text-[13px] text-slate-600 mt-0.5">Live mode: real news, live wire and crowd reports. Social platforms (X, Reddit, Facebook, Nairaland) need keys or permission — see Settings. Synthetic posts appear only in simulation mode.</p></div>
        <div id="sg-kpis" class="flex flex-wrap gap-2"></div>
      </div>
      <div id="sg-plat" class="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3"></div>
    </section>
    <section class="card p-3 space-y-2">
      <div class="flex flex-wrap items-center gap-2"><span class="lbl w-28">Signal source:</span><span id="sg-src" class="flex flex-wrap gap-1.5"></span>
        <span class="flex-1"></span><span class="lbl">Scope</span>
        <select id="sg-scope" class="text-[12px] rounded border-slate-300 py-1"><option value="country">Selected country</option><option value="all">All five</option></select></div>
      <div class="flex flex-wrap items-center gap-2"><span class="lbl w-28">Topic cluster:</span><span id="sg-topics" class="flex flex-wrap gap-1.5"></span></div>
      <div class="flex flex-wrap items-center gap-3"><span class="lbl w-28">Search:</span>
        <div class="relative flex-1 max-w-md"><span class="msi sm absolute left-2 top-2 text-slate-400">search</span><input id="sg-q" class="w-full pl-8 rounded border-slate-300 text-sm py-1.5" placeholder="Filter by keyword or location…"/></div>
        <span id="sg-sent" class="font-mono text-[12px]"></span></div>
    </section>
    <div class="grid grid-cols-12 gap-4">
      <div class="col-span-12 xl:col-span-8 space-y-3"><div id="sg-banner"></div><div id="sg-feed" class="space-y-2.5"></div></div>
      <aside class="col-span-12 xl:col-span-4 space-y-3">
        <button data-newreport class="w-full py-2.5 rounded bg-sky-700 text-white font-semibold text-[14px] hover:bg-sky-800">${icon('campaign')} SUBMIT FIELD REPORT</button>
        <div class="card p-3"><div class="flex items-center justify-between mb-2"><h3 class="font-bold">Moderation queue</h3><span id="sg-qcount"></span></div><div id="sg-mod" class="space-y-2 max-h-[420px] overflow-y-auto scroll-thin"></div></div>
        <div class="card p-3"><h3 class="font-bold mb-2">Highest signal clusters</h3><div id="sg-clusters"></div></div>
        <div class="card p-3"><h3 class="font-bold mb-2 flex items-center justify-between">Automated triangulation ${icon('hub', 'text-sky-700')}</h3><div id="sg-tri" class="space-y-3"></div></div>
      </aside>
    </div></div>`;
  const $ = (s) => el.querySelector(s);
  const inScope = (c) => scope === 'all' || c === state.country;

  function render() {
    if (disposed) return;
    const posts = state.posts.filter((p) => inScope(p.country));
    const wire = state.wire.filter((w) => inScope(w.country));
    const reps = state.reports.filter((r) => inScope(r.country));
    const news = state.news.filter((n) => inScope(n.country));
    const v = state.velocity; const codes = scope === 'all' ? state.meta.order : [state.country];
    const perMin = codes.reduce((a, c) => a + (v[c]?.total || 0), 0);
    const since5 = Date.now() - 300000; const rumors = posts.filter((p) => p.rumor && Date.parse(p.ts) > since5);
    $('#sg-kpis').innerHTML = [['Total vol', `${perMin}/min`, ''], ['Rumour flags (5m)', rumors.length, rumors.length >= 3 ? 'text-red-600' : 'text-amber-700'], ['Dispatch latency', `${state.latency ?? '—'}ms`, 'text-sky-700']]
      .map(([l, val, cls]) => `<div class="px-3 py-1.5 rounded border border-slate-200 bg-slate-50"><div class="lbl">${l}</div><div class="num font-semibold text-[18px] ${cls}">${val}</div></div>`).join('');
    $('#sg-plat').innerHTML = Object.entries(PLAT).map(([k, [name, ab, cls]]) => {
      const n = codes.reduce((a, c) => a + (v[c]?.platforms[k] || 0), 0); const ad = state.adapters.find((a) => a.id === k);
      const max = Math.max(1, ...Object.keys(PLAT).map((kk) => codes.reduce((a, c) => a + (v[c]?.platforms[kk] || 0), 0)));
      return `<div class="rounded border border-slate-200 p-2.5"><div class="flex items-center gap-2"><span class="w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center ${cls}">${ab}</span><b class="text-[13.5px] flex-1">${name}</b><span class="num text-sky-700 text-[12.5px]">${n}/min</span></div>
        <div class="mt-2">${bar(n / max, '#0284c7', 'h-1')}</div><div class="mt-1.5 font-mono text-[10px] ${ad?.status === 'blocked' ? 'text-slate-400' : 'text-amber-700'}">${ad ? (ad.status === 'blocked' ? 'NO API ACCESS · SIM ONLY' : ad.status === 'needs_key' ? 'NEEDS KEY · SIM STANDS IN' : ad.status.toUpperCase()) : ''}</div></div>`;
    }).join('');
    const counts = { all: posts.length + wire.length + reps.length + news.length, wire: wire.length, crowd: reps.length, news: news.length, social: posts.length, rumor: posts.filter((p) => p.rumor).length };
    $('#sg-src').innerHTML = [['all', 'All signals'], ['wire', 'Official / wire'], ['crowd', 'Crowd reports'], ['news', 'News'], ['social', 'Social'], ['rumor', 'Rumour cluster']].map(([k, l]) =>
      `<button data-src="${k}" class="text-[12px] px-2.5 py-1 rounded border ${src === k ? 'bg-sky-700 text-white border-sky-700' : 'border-slate-300 hover:bg-slate-50'}">${l} <span class="font-mono text-[10.5px] ${src === k ? 'text-sky-100' : 'text-slate-500'}">${counts[k]}</span></button>`).join('');
    $('#sg-topics').innerHTML = TOPICS.map((t) => `<button data-topic="${t}" class="text-[12px] px-2.5 py-1 rounded-full border ${topic === t ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-300 hover:bg-slate-50'}">${t}</button>`).join('');
    const s = posts.reduce((a, p) => { a[p.sentiment]++; return a; }, { calm: 0, tension: 0, disputed: 0 }); const st = Math.max(1, s.calm + s.tension + s.disputed);
    $('#sg-sent').innerHTML = `FEED SENTIMENT: <span class="text-green-700">${Math.round(s.calm / st * 100)}% calm</span> / <span class="text-amber-700">${Math.round(s.tension / st * 100)}% tension</span> / <span class="text-red-600">${Math.round(s.disputed / st * 100)}% disputed</span>`;

    // rumour banner
    const hot = rumors[0];
    $('#sg-banner').innerHTML = rumors.length >= 2 ? `<div class="rounded border border-red-300 bg-red-50 p-3 flex items-start gap-3">${icon('warning', 'lg text-red-600')}
      <div class="flex-1"><b class="text-red-700">RUMOUR SPIKE DETECTED</b><p class="text-[13px] text-slate-700">${rumors.length} unverified claims in 5 minutes. Latest: “${esc(hot.text)}” — ${esc(hot.path)}</p><p class="text-[11px] text-slate-500 mt-0.5">Treat as unverified until matched by an official source or a verified crowd report.</p></div>${chip(`weight ${rumors.length}`, 'red')}</div>` : '';

    // merged feed
    let items = [];
    if (src === 'all' || src === 'wire') items = items.concat(wire.map((w) => ({ ts: w.ts, kind: 'wire', w })));
    if (src === 'all' || src === 'crowd') items = items.concat(reps.map((r) => ({ ts: r.ts, kind: 'crowd', r })));
    if (src === 'all' || src === 'news') items = items.concat(news.map((n) => ({ ts: n.ts, kind: 'news', n })));
    if (src === 'all' || src === 'social' || src === 'rumor') items = items.concat(posts.filter((p) => src !== 'rumor' || p.rumor).map((p) => ({ ts: p.ts, kind: 'post', p })));
    if (topic) items = items.filter((x) => x.kind === 'post' && x.p.topic === topic);
    if (q) { const ql = q.toLowerCase(); items = items.filter((x) => JSON.stringify(x).toLowerCase().includes(ql)); }
    items.sort((a, b) => b.ts.localeCompare(a.ts));
    $('#sg-feed').innerHTML = items.slice(0, 80).map(card).join('') || '<div class="card p-6 text-center text-slate-400 text-sm">No signals match these filters.</div>';

    // moderation queue
    const pend = reps.filter((r) => r.status === 'unverified');
    $('#sg-qcount').innerHTML = chip(`${pend.length} pending`, pend.length ? 'amber' : 'slate');
    $('#sg-mod').innerHTML = pend.slice(0, 30).map((r) => `<div class="rounded border border-slate-200 p-2">
      <div class="flex items-center gap-2"><b class="text-[13px] flex-1">${esc(r.category)}</b><span class="font-mono text-[10.5px] text-slate-500">${ago(r.ts)}</span></div>
      <p class="text-[12.5px] text-slate-700 mt-0.5">${esc(r.text)}</p><p class="text-[11px] text-slate-500 font-mono mt-0.5">${esc(r.path)} · ${r.confirmations} confirmations</p>
      <div class="flex gap-1.5 mt-1.5"><button data-mod="confirm" data-id="${r.id}" class="text-[11px] px-2 py-0.5 rounded border border-slate-300">+ I saw this too</button>
        ${state.meta.admin ? `<span class="flex-1"></span><button data-mod="reject" data-id="${r.id}" class="text-[11px] px-2 py-0.5 rounded border border-red-300 text-red-700">Reject</button><button data-mod="verify" data-id="${r.id}" class="text-[11px] px-2 py-0.5 rounded bg-green-700 text-white">Verify</button>` : ''}</div></div>`).join('') || '<p class="text-[12.5px] text-slate-400">No reports awaiting moderation.</p>';

    // clusters (by state/region-level area)
    const cl = {}; for (const p of posts) { const key = p.path.split(' › ').slice(0, p.country === 'NGA' ? 2 : 1).join(' › ') + ` (${p.country})`; cl[key] = (cl[key] || 0) + 1; }
    const top = Object.entries(cl).sort((a, b) => b[1] - a[1]).slice(0, 6); const mx = top[0]?.[1] || 1;
    $('#sg-clusters').innerHTML = top.map(([k, n], i) => `<div class="flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-0 text-[12.5px]"><span class="w-2 h-2 rounded-full ${i === 0 ? 'bg-red-500' : i < 3 ? 'bg-amber-500' : 'bg-green-500'}"></span><span class="flex-1 truncate">${esc(k)}</span><span class="w-16">${bar(n / mx, '#0284c7', 'h-1')}</span><span class="num text-sky-700 w-8 text-right">${n}</span></div>`).join('') || '<p class="text-[12.5px] text-slate-400">Collecting…</p>';

    // triangulation
    const corr = posts.filter((p) => p.verification === 'corroborated').length; const rum = posts.filter((p) => p.rumor).length;
    const ver = reps.filter((r) => r.status === 'verified').length; const dec = reps.filter((r) => r.status !== 'unverified').length;
    const tri = (l, val, txt, col) => `<div><div class="flex justify-between text-[12.5px]"><span>${l}</span><b class="num" style="color:${col}">${txt}</b></div><div class="mt-1">${bar(val, col)}</div></div>`;
    $('#sg-tri').innerHTML = tri('Social posts corroborated', posts.length ? corr / posts.length : 0, posts.length ? `${Math.round(corr / posts.length * 100)}%` : '—', '#16a34a') +
      tri('Disinformation flag rate', posts.length ? rum / posts.length : 0, posts.length ? `${(rum / posts.length * 100).toFixed(1)}%` : '—', '#ea580c') +
      tri('Crowd reports verified (of moderated)', dec ? ver / dec : 0, dec ? `${ver}/${dec}` : '—', '#0284c7') +
      `<p class="text-[11px] text-slate-500">“Corroborated” on simulated posts is synthetic. With live adapters this becomes a match against official results and verified crowd reports for the same unit.</p>`;
  }

  function card(x) {
    if (x.kind === 'news') { const n = x.n; return `<div class="card p-3 border-l-4 border-l-slate-400">
      <div class="flex items-center gap-2">${icon('newspaper', 'text-slate-600')}<b class="text-[14px]">${esc(n.source)}</b>${chip(n.via === 'gdelt' ? 'GDELT' : 'RSS', 'slate')}${chip(n.country, 'blue')}<span class="flex-1"></span><span class="font-mono text-[11px] text-slate-500">${ago(n.ts)}</span></div>
      <a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer" class="block text-[14px] mt-1.5 font-medium hover:text-sky-700">${esc(n.title)}</a>${n.summary ? `<p class="text-[12.5px] text-slate-600 mt-0.5">${esc(n.summary)}</p>` : ''}</div>`; }
    if (x.kind === 'wire') { const w = x.w; return `<div class="card p-3 border-l-4 ${w.kind === 'INCIDENT' ? 'border-l-red-500' : w.kind === 'CROWD' ? 'border-l-violet-500' : 'border-l-sky-600'}">
      <div class="flex items-center gap-2">${icon('verified', 'text-sky-700')}<b class="text-[14px]">${esc(def(w.country).authority)} wire</b>${chip(w.kind.toLowerCase(), WIRE_TONE[w.kind])}${w.simulated !== false ? chip('Simulated', 'amber') : ''}<span class="flex-1"></span><span class="font-mono text-[11px] text-slate-500">${hhmmss(w.ts)} UTC</span></div>
      <p class="text-[14px] mt-1.5">${esc(w.text)}</p>
      <div class="flex gap-3 mt-1.5 text-[11px] font-mono">${w.ledgerSeq ? `<a href="#/ledger" class="text-sky-700">ledger #${w.ledgerSeq}</a>` : ''}${w.nodeId ? `<a href="#/drilldown/${encodeURIComponent(w.nodeId)}" class="text-sky-700">open report →</a>` : ''}</div></div>`; }
    if (x.kind === 'crowd') { const r = x.r; return `<div class="card p-3 border-l-4 border-l-violet-500">
      <div class="flex items-center gap-2">${icon('campaign', 'text-violet-700')}<b class="text-[14px]">Crowd report</b><span class="text-[12px] text-slate-500">by ${esc(r.reporter)}</span>${statusChip(r.status)}<span class="flex-1"></span><span class="font-mono text-[11px] text-slate-500">${ago(r.ts)}</span></div>
      <p class="text-[14px] mt-1.5"><b>${esc(r.category)}:</b> ${esc(r.text)}</p>
      <div class="flex gap-3 mt-1.5 text-[11px] font-mono text-slate-500"><span>${icon('location_on', 'sm')} ${esc(r.country)} › ${esc(r.path)}</span><span>${r.confirmations} confirmations</span>${r.ledgerSeq ? `<a href="#/ledger" class="text-sky-700">ledger #${r.ledgerSeq}</a>` : ''}<a href="#/drilldown/${encodeURIComponent(r.nodeId)}" class="text-sky-700">open report →</a></div></div>`; }
    const p = x.p; const [name, ab, cls] = PLAT[p.platform];
    return `<div class="card p-3 ${p.rumor ? 'border-amber-300' : ''}">
      <div class="flex items-center gap-2"><span class="w-7 h-7 rounded text-[10px] font-bold flex items-center justify-center ${cls}">${ab}</span><div class="leading-tight"><b class="text-[13.5px]">@${esc(p.handle)}</b><div class="font-mono text-[10px] text-slate-500">${name.toUpperCase()} · SYNTHETIC POST</div></div>
        <span class="flex-1"></span>${p.rumor ? chip('Unconfirmed claim', 'amber') : statusChip(p.verification)}<span class="font-mono text-[11px] text-slate-500">${ago(p.ts)}</span></div>
      <p class="text-[14px] mt-1.5">${esc(p.text)}</p>
      <div class="flex flex-wrap gap-3 mt-1.5 text-[11px] font-mono text-slate-500"><span>${icon('location_on', 'sm')} ${esc(p.country)} › ${esc(p.path)}</span><span>${esc(p.topic)}</span><span>${icon('favorite', 'sm')} ${fmt(p.engagement)}</span>
        <span class="${p.sentiment === 'calm' ? 'text-green-700' : p.sentiment === 'tension' ? 'text-amber-700' : 'text-red-600'}">${p.sentiment}</span><a href="#/drilldown/${encodeURIComponent(p.nodeId)}" class="text-sky-700">open unit →</a></div></div>`;
  }

  el.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-src]'); if (s) { src = s.dataset.src; render(); return; }
    const t = e.target.closest('[data-topic]'); if (t) { topic = topic === t.dataset.topic ? null : t.dataset.topic; render(); return; }
    if (e.target.closest('[data-newreport]')) { openReportModal(); return; }
    const m = e.target.closest('[data-mod]');
    if (m) {
      let note = ''; if (m.dataset.mod !== 'confirm') note = prompt(`Moderator note for ${m.dataset.mod}:`, '') ?? null; if (note === null) return;
      try { await api.post(`/api/reports/${m.dataset.id}/${m.dataset.mod}`, { note }); toast(`Report ${m.dataset.mod === 'confirm' ? 'confirmed' : m.dataset.mod + 'd'}`, 'green'); } catch (err) { toast(err.message, 'red'); }
    }
  });
  $('#sg-q').addEventListener('input', (e) => { q = e.target.value.trim(); render(); });
  $('#sg-scope').addEventListener('change', (e) => { scope = e.target.value; render(); });
  render();
  const slow = throttle(render, 2000);
  return { update(kind) { if (kind === 'country' || kind === 'report') render(); else if (kind === 'tick' || kind === 'news') slow(); }, unmount() { disposed = true; } };
}
