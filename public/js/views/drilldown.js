// Regional Cascading Drilldown: every node of every hierarchy is a report;
// its children are the sub-reports. Country -> zone/state -> LGA -> ward -> unit.
import { state, api, esc, fmt, pct, chip, icon, def, bar, party, statusChip, simBadge, leaderLabel, hhmmss, SEV_TONE, setCountry, ago, isLive } from '../core.js';
import { openReportModal } from './crowd.js';

export function mount(el, param) {
  if (isLive()) return liveNotice(el);
  let nodeId = param || state.country; let data = null; let expanded = new Map(); let sort = { k: 'name', dir: 1 };
  let timer = null; let disposed = false;

  el.innerHTML = `<div class="p-4 max-w-[1800px] space-y-3">
    <div id="dd-crumbs" class="flex flex-wrap items-center gap-2"></div>
    <div class="grid grid-cols-12 gap-4">
      <aside class="col-span-12 lg:col-span-4 2xl:col-span-3 space-y-3">
        <div class="card p-3">
          <div class="flex items-center justify-between mb-2"><h3 class="font-semibold flex items-center gap-2">${icon('account_tree')} Jurisdiction explorer</h3><span id="dd-units" class="font-mono text-[10.5px] text-slate-500"></span></div>
          <div class="relative"><span class="msi sm absolute left-2 top-2 text-slate-400">search</span>
            <input id="dd-q" class="w-full pl-8 rounded border-slate-300 text-sm py-1.5" placeholder="Filter any LGA, ward, county, electorate…" autocomplete="off"/>
            <div id="dd-qres" class="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-300 rounded shadow-lg max-h-72 overflow-y-auto scroll-thin hidden"></div></div>
          <div id="dd-counts" class="grid grid-cols-3 gap-1.5 mt-2"></div>
        </div>
        <div id="dd-tree" class="space-y-1.5"></div>
      </aside>
      <section class="col-span-12 lg:col-span-8 2xl:col-span-9 space-y-3">
        <div id="dd-head" class="card p-4"></div>
        <div id="dd-kpis" class="grid grid-cols-1 sm:grid-cols-3 gap-3"></div>
        <div class="grid grid-cols-12 gap-3">
          <div id="dd-results" class="col-span-12 xl:col-span-7 card p-4"></div>
          <div id="dd-side" class="col-span-12 xl:col-span-5 card p-4"></div>
        </div>
        <div id="dd-dispatch" class="card p-4"></div>
        <div id="dd-sub" class="card"></div>
      </section>
    </div></div>`;
  const $ = (s) => el.querySelector(s);

  async function load() {
    try {
      data = await api.get(`/api/node/${encodeURIComponent(nodeId)}`);
      for (const id of expanded.keys()) expanded.set(id, await api.get(`/api/node/${encodeURIComponent(id)}`).catch(() => null));
      if (!disposed) render();
    } catch (e) { $('#dd-head').innerHTML = `<p class="text-red-600">Could not load ${esc(nodeId)}: ${esc(e.message)}</p>`; }
  }

  function render() {
    const { node: n, ancestors, children, parties } = data; const c = n.country; const d = def(c);
    // breadcrumb
    $('#dd-crumbs').innerHTML = `<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-slate-300 bg-white text-[13px]"><b>${esc(d.name)}</b>${chip(esc(d.authorityShort), 'amber')}</span>` +
      ancestors.slice(1).map((a) => `<span class="text-slate-300">/</span><a href="#/drilldown/${encodeURIComponent(a.id)}" class="text-[13px] text-slate-600 hover:text-sky-700">${esc(a.name)}</a>`).join('') +
      (n.level ? `<span class="text-slate-300">/</span><span class="px-2 py-1 rounded border border-sky-300 bg-sky-50 text-sky-800 text-[13px] font-semibold">● ${esc(n.name)}</span>` : '') +
      `<span class="flex-1"></span>
       <span class="font-mono text-[11px] px-2 py-1 rounded border border-slate-200 bg-slate-50 text-slate-600">GEOMETRY ID: <b>${esc(n.id)}</b></span>
       <a href="#/map/${encodeURIComponent(n.leaf ? (ancestors[ancestors.length - 1]?.id || c) : n.id)}" class="text-[12px] px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50">${icon('map', 'sm')} Map</a>
       ${n.leaf ? '' : `<a href="/api/node/${encodeURIComponent(n.id)}/children.csv" class="text-[12px] px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50">${icon('download', 'sm')} Sub-report CSV</a>`}
       <button data-report class="text-[12px] px-2 py-1 rounded bg-sky-700 text-white hover:bg-sky-800">${icon('campaign', 'sm')} Report from here</button>`;

    // header
    $('#dd-head').innerHTML = `<div class="flex flex-wrap items-start gap-4">
      <div class="flex-1 min-w-[260px]">
        <div class="flex flex-wrap items-center gap-2 mb-1">${chip(esc(n.levelName), 'blue')}${statusChip(n.status)}${simBadge()}${n.synthetic ? chip('Synthetic unit', 'slate', 'title="Placeholder geography until real boundary/roster data is loaded"') : ''}</div>
        <h2 class="text-[28px] font-bold tracking-tight leading-tight">${esc(n.name)}</h2>
        <p class="text-[13px] text-slate-600">${ancestors.slice(1).map((a) => `${esc(a.name)} ${esc(a.levelName)}`).reverse().join(' • ') || esc(d.election.name)}</p>
      </div>
      <div class="text-right">
        <div class="lbl">Last update</div><div class="font-mono text-[13px]">${n.updatedAt ? hhmmss(new Date(n.updatedAt).toISOString()) + ' UTC' : '—'}</div>
        <div class="mt-2 text-[11.5px] text-slate-500 max-w-[260px]">Provenance: <b class="text-amber-700">${esc(n.provenance.kind)}</b> — ${esc(n.provenance.source)}</div>
      </div></div>`;

    // KPIs
    const k = (label, ic, main, sub, val, col, foot) => `<div class="card p-3"><div class="flex items-center justify-between"><span class="lbl">${label}</span>${icon(ic, 'sm text-slate-400')}</div>
      <div class="mt-2 num text-[22px] font-semibold">${main} <span class="text-[13px] text-slate-500 font-normal">${sub}</span></div><div class="mt-2">${bar(val, col)}</div><div class="mt-1.5 font-mono text-[10.5px] text-slate-500">${foot}</div></div>`;
    $('#dd-kpis').innerHTML = n.leaf
      ? k('Registered / cast', 'how_to_reg', fmt(n.cast), `/ ${fmt(n.registered)}`, n.registered ? n.cast / n.registered : 0, '#0284c7', `${pct(n.registered ? n.cast / n.registered : 0)} turnout`) +
        k('Valid / invalid', 'fact_check', fmt(n.valid), `${fmt(n.invalid)} invalid`, n.cast ? n.valid / n.cast : 0, '#16a34a', `${pct(n.cast ? n.valid / n.cast : 0)} valid ballot rate`) +
        k('Unit status', 'flag', (({ pending: 'Pending', reported: 'Reported', disputed: 'Held' })[n.status] || n.status), '', n.status === 'reported' ? 1 : 0, n.status === 'disputed' ? '#dc2626' : '#16a34a', n.status === 'disputed' ? 'held from tally pending review' : 'result entered in tally')
      : k(`${d.unitWord} ${d.metricWord.toLowerCase()}`, 'checklist', fmt(n.reported), `/ ${fmt(n.leafCount)}`, n.pct, '#0284c7', `${pct(n.pct)} of ${d.unitWord}`) +
        k('Ballots counted', 'ballot', fmt(n.cast), `${fmt(n.invalid)} invalid`, n.cast ? n.valid / n.cast : 0, '#16a34a', `${pct(n.cast ? n.valid / n.cast : 0)} valid ballot rate`) +
        k('Turnout (reported units)', 'groups', pct(n.turnout), `of ${fmt(n.registered)} reg.`, n.turnout, '#7c3aed', n.disputed ? `<span class="text-red-600">${n.disputed} unit(s) held for review</span>` : 'no units held');

    // party results
    const tot = n.valid;
    $('#dd-results').innerHTML = `<div class="flex items-center justify-between mb-3"><h3 class="font-semibold flex items-center gap-2">${icon('how_to_vote')} ${n.leaf ? 'Unit tally' : 'Aggregated tally'}</h3><span class="font-mono text-[11px] text-slate-500">TOTAL VALID ${fmt(tot)}</span></div>` +
      (tot ? parties.slice().sort((a, b) => n.votes[b.code] - n.votes[a.code]).map((p) => `
        <div class="py-2 border-b border-slate-100 last:border-0">
          <div class="flex items-center gap-2 text-[13.5px]"><span class="w-2.5 h-2.5 rounded-sm" style="background:${p.color}"></span><b>${esc(p.code)}</b><span class="text-slate-500 truncate">${esc(p.name)}</span><span class="flex-1"></span><span class="num font-semibold">${fmt(n.votes[p.code])}</span><span class="num text-[12px] text-slate-500 w-14 text-right">${pct(n.votes[p.code] / tot)}</span></div>
          <div class="mt-1.5">${bar(n.votes[p.code] / tot, p.color)}</div></div>`).join('')
        : `<p class="text-sm text-slate-400 py-6 text-center">No returns ${n.leaf ? 'for this unit' : 'in this area'} yet.</p>`);

    // side panel: leaf → result sheet slot; area → sub-unit status mix + leader map
    if (n.leaf) {
      $('#dd-side').innerHTML = `<h3 class="font-semibold flex items-center gap-2 mb-2">${icon('document_scanner')} Result sheet</h3>
        <div class="aspect-[4/3] rounded border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-center p-4 text-slate-500">
          ${icon('image_not_supported', 'lg')}<p class="text-[13px] mt-2">${c === 'NGA' ? 'The IReV Form EC8A image for this polling unit will appear here once INEC result-sheet ingestion is connected.' : 'The official result document for this unit will appear here once the results adapter is connected.'}</p></div>
        <p class="text-[11.5px] text-slate-500 mt-2">Next step: OCR the sheet, compare with the entered tally and flag any mismatch automatically.</p>`;
    } else {
      const mix = { complete: 0, counting: 0, awaiting: 0, flagged: 0 }; children.forEach((x) => mix[x.status]++);
      const leaders = {}; children.forEach((x) => { if (x.leader) leaders[x.leader] = (leaders[x.leader] || 0) + 1; });
      $('#dd-side').innerHTML = `<h3 class="font-semibold flex items-center gap-2 mb-3">${icon('donut_small')} ${esc(n.childLevelName)} status</h3>
        ${[['complete', 'Complete', '#16a34a'], ['counting', 'Counting', '#d97706'], ['awaiting', 'Awaiting', '#94a3b8'], ['flagged', 'Flagged', '#dc2626']].map(([kk, l, col]) => `
          <div class="flex items-center gap-2 text-[13px] py-1"><span class="w-24">${l}</span><div class="flex-1">${bar(children.length ? mix[kk] / children.length : 0, col)}</div><span class="num w-10 text-right">${mix[kk]}</span></div>`).join('')}
        <div class="lbl mt-4 mb-2">${esc(n.childLevelName)}s led</div>
        <div class="flex flex-wrap gap-1.5">${Object.entries(leaders).sort((a, b) => b[1] - a[1]).map(([p, v]) => `<span class="px-2 py-1 rounded text-[12px] font-mono text-white" style="background:${party(c, p).color}">${esc(p)} ${v}</span>`).join('') || '<span class="text-sm text-slate-400">none yet</span>'}</div>`;
    }

    // dispatches: incidents + crowd reports in this subtree
    const items = data.incidents.map((i) => ({ ts: i.ts, html: `<div class="flex gap-3 py-2.5 border-b border-slate-100 last:border-0">${icon(i.status === 'resolved' ? 'check_circle' : 'error', `${i.status === 'resolved' ? 'text-green-600' : 'text-red-600'}`)}
      <div class="flex-1"><p class="text-[13.5px]"><b>${esc(i.category)}</b> — ${esc(i.path)}</p><p class="text-[11px] font-mono text-slate-500">${esc(i.id)} · ${esc(i.source)} · ledger ${i.ledgerSeqs.map((s) => '#' + s).join(', ')}</p></div>
      <div class="text-right shrink-0">${chip(i.severity, SEV_TONE[i.severity])}<div class="mt-1">${statusChip(i.status)}</div><div class="font-mono text-[10.5px] text-slate-500 mt-1">${hhmmss(i.ts)} UTC</div></div></div>` }))
      .concat(data.reports.map((r) => ({ ts: r.ts, html: `<div class="flex gap-3 py-2.5 border-b border-slate-100 last:border-0">${icon('campaign', 'text-violet-600')}
      <div class="flex-1"><p class="text-[13.5px]"><b>${esc(r.category)}</b> — ${esc(r.text)}</p><p class="text-[11px] font-mono text-slate-500">${esc(r.id)} · crowd report by ${esc(r.reporter)} · ${esc(r.path)}</p></div>
      <div class="text-right shrink-0">${statusChip(r.status)}<div class="font-mono text-[10.5px] text-slate-500 mt-1">${ago(r.ts)}</div></div></div>` })))
      .sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 12);
    $('#dd-dispatch').innerHTML = `<div class="flex items-center justify-between mb-1"><h3 class="font-bold flex items-center gap-2">${icon('assignment')} Field dispatches & incidents</h3><span class="font-mono text-[11px] text-slate-500">${items.length} IN SCOPE</span></div>` +
      (items.map((x) => x.html).join('') || '<p class="text-sm text-slate-400 py-3">No incidents or crowd reports in this area.</p>');

    renderTree(); renderSub(); renderCounts();
  }

  function renderCounts() {
    const ch = data.children; const m = { complete: 0, counting: 0, flagged: 0 }; ch.forEach((x) => { if (m[x.status] != null) m[x.status]++; });
    $('#dd-units').textContent = data.node.leaf ? 'LOWEST LEVEL' : `${ch.length} ${(data.node.childLevelName || '').toUpperCase()}S`;
    $('#dd-counts').classList.toggle('hidden', data.node.leaf);
    if (data.node.leaf) return;
    $('#dd-counts').innerHTML = [['Complete', m.complete, 'green'], ['Counting', m.counting, 'amber'], ['Flagged', m.flagged, 'red']].map(([l, v, t]) =>
      `<div class="text-center rounded border px-1 py-1.5 ${t === 'green' ? 'bg-green-50 border-green-200 text-green-700' : t === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700'}"><div class="font-mono text-[10px] tracking-wider">${l.toUpperCase()}</div><div class="num font-semibold">${v} / ${ch.length}</div></div>`).join('');
  }

  function renderTree() {
    const n = data.node; const c = n.country;
    if (n.leaf) { $('#dd-tree').innerHTML = `<div class="card p-3 text-[13px] text-slate-500">This is a ${esc(n.levelName.toLowerCase())} — the lowest level. Use the breadcrumb to go up.</div>`; return; }
    $('#dd-tree').innerHTML = data.children.map((ch) => {
      const ex = expanded.get(ch.id);
      const tone = ch.status === 'complete' ? 'border-green-200' : ch.status === 'flagged' ? 'border-red-300' : 'border-slate-200';
      return `<div class="card ${ex ? 'border-sky-400 border-l-4' : tone}">
        <div class="flex items-start gap-2 p-2.5">
          ${ch.leaf ? icon('location_on', 'sm text-slate-400 mt-0.5') : `<button data-exp="${esc(ch.id)}" class="msi sm text-slate-500 mt-0.5 hover:text-sky-700">${ex ? 'folder_open' : 'folder'}</button>`}
          <a href="#/drilldown/${encodeURIComponent(ch.id)}" class="flex-1 min-w-0">
            <div class="flex items-center gap-2"><span class="font-semibold text-[13.5px] truncate hover:text-sky-700">${esc(ch.name)}</span><span class="flex-1"></span>${statusChip(ch.status)}</div>
            <div class="flex items-center justify-between font-mono text-[10.5px] text-slate-500 mt-1"><span>${ch.leaf ? fmt(ch.registered) + ' registered' : `${fmt(ch.reported)}/${fmt(ch.leafCount)} ${esc(def(c).unitWord)}`}</span><span>${leaderLabel(c, ch)}</span></div>
            ${ch.leaf ? '' : `<div class="mt-1.5">${bar(ch.pct, ch.status === 'flagged' ? '#dc2626' : '#0284c7', 'h-1')}</div>`}
          </a></div>
        ${ex ? `<div class="border-t border-slate-100 py-1">${ex.children.slice(0, 40).map((g) => `
          <a href="#/drilldown/${encodeURIComponent(g.id)}" class="flex items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-sky-50">
            <span class="w-2 h-2 rounded-full ${g.status === 'reported' || g.status === 'complete' ? 'bg-green-500' : g.status === 'disputed' || g.status === 'flagged' ? 'bg-red-500' : g.status === 'counting' ? 'bg-amber-500' : 'bg-slate-300'}"></span>
            <span class="flex-1 truncate">${esc(g.name)}</span><span class="font-mono text-[10.5px] text-slate-500">${g.leaf ? statusChip(g.status) : pct(g.pct, 0)}</span></a>`).join('')}
          ${ex.children.length > 40 ? `<div class="px-3 py-1 text-[11px] text-slate-400">+${ex.children.length - 40} more — open the report</div>` : ''}</div>` : ''}
      </div>`;
    }).join('');
  }

  function renderSub() {
    const n = data.node; const c = n.country; const d = def(c);
    if (n.leaf) { $('#dd-sub').innerHTML = ''; return; }
    const val = (x) => ({ name: x.name, units: x.leafCount, pct: x.pct, registered: x.registered, cast: x.cast, turnout: x.turnout, margin: x.marginPct, status: x.status }[sort.k]);
    const rows = data.children.slice().sort((a, b) => { const A = val(a), B = val(b); return (typeof A === 'string' ? A.localeCompare(B) : A - B) * sort.dir; });
    const th = (k, l, r) => `<th data-sort="${k}" class="lbl py-2 px-2 bg-slate-50 border-b border-slate-300 ${r ? 'text-right' : 'text-left'}">${l}${sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    $('#dd-sub').innerHTML = `<div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200">
        <div><h3 class="font-bold text-[16px]">${esc(n.name).toUpperCase()} — ${esc(n.childLevelName).toUpperCase()} SUB-REPORTS</h3><p class="text-[12.5px] text-slate-500">Each row is a report in its own right; open it to see its own sub-reports.</p></div>
        <a href="/api/node/${encodeURIComponent(n.id)}/children.csv" class="text-[12px] px-3 py-1.5 rounded bg-sky-700 text-white">${icon('download', 'sm')} Download CSV</a></div>
      <div class="overflow-x-auto"><table class="w-full text-[13px]"><thead><tr>
        ${th('name', `${n.childLevelName}`)}${th('units', d.unitWord, 1)}${th('pct', d.metricWord, 1)}${th('registered', 'Registered', 1)}${th('cast', 'Cast', 1)}${th('turnout', 'Turnout', 1)}${th('margin', 'Leader', 1)}${th('status', 'Status')}<th class="bg-slate-50 border-b border-slate-300"></th></tr></thead>
        <tbody>${rows.map((x, i) => `<tr class="${i % 2 ? 'bg-slate-50' : 'bg-white'} hover:bg-slate-100 h-10 ${x.status === 'flagged' || x.status === 'disputed' ? 'border-l-2 border-l-red-500' : ''}">
          <td class="px-2 font-medium">${esc(x.name)}</td><td class="px-2 num text-right">${fmt(x.leafCount)}</td><td class="px-2 num text-right">${pct(x.pct, 0)}</td>
          <td class="px-2 num text-right">${fmt(x.registered)}</td><td class="px-2 num text-right">${fmt(x.cast)}</td><td class="px-2 num text-right">${x.reported ? pct(x.turnout) : '—'}</td>
          <td class="px-2 text-right">${leaderLabel(c, x)}</td><td class="px-2">${statusChip(x.status)}</td>
          <td class="px-2 text-right"><a href="#/drilldown/${encodeURIComponent(x.id)}" class="text-sky-700 font-mono text-[11.5px] whitespace-nowrap">Drill →</a></td></tr>`).join('')}</tbody></table></div>`;
  }

  // search
  let qt;
  $('#dd-q').addEventListener('input', (e) => {
    clearTimeout(qt); const q = e.target.value.trim(); const box = $('#dd-qres');
    if (q.length < 2) { box.classList.add('hidden'); return; }
    qt = setTimeout(async () => {
      const r = await api.get(`/api/search?country=${data ? data.node.country : state.country}&q=${encodeURIComponent(q)}`);
      box.innerHTML = r.map((x) => `<a href="#/drilldown/${encodeURIComponent(x.id)}" class="block px-3 py-1.5 text-[12.5px] hover:bg-sky-50"><b>${esc(x.name)}</b> <span class="text-slate-500">${esc(x.levelName)} · ${esc(x.path)}</span></a>`).join('') || '<div class="px-3 py-2 text-[12px] text-slate-400">No matches</div>';
      box.classList.remove('hidden');
    }, 200);
  });
  el.addEventListener('click', async (e) => {
    if (!e.target.closest('#dd-qres') && !e.target.closest('#dd-q')) $('#dd-qres').classList.add('hidden');
    const ex = e.target.closest('[data-exp]');
    if (ex) { e.preventDefault(); const id = ex.dataset.exp; if (expanded.has(id)) expanded.delete(id); else expanded.set(id, await api.get(`/api/node/${encodeURIComponent(id)}`)); renderTree(); return; }
    const s = e.target.closest('th[data-sort]'); if (s) { sort = { k: s.dataset.sort, dir: sort.k === s.dataset.sort ? -sort.dir : 1 }; renderSub(); return; }
    if (e.target.closest('[data-report]')) openReportModal(data.node.id, [...data.ancestors.slice(1).map((a) => a.name), data.node.name].join(' › '));
  });

  function setParam(p) {
    nodeId = p || state.country; expanded = new Map(); $('#dd-q').value = '';
    const c = nodeId.split('.')[0]; if (c !== state.country && state.meta.countries[c]) setCountry(c);
    el.parentElement.scrollTop = 0; load();
  }
  setParam(param);
  timer = setInterval(() => { if (!document.hidden) load(); }, 3000);
  return {
    setParam,
    update(kind) { if (kind === 'country' && data && data.node.country !== state.country) location.hash = `#/drilldown/${state.country}`; },
    unmount() { disposed = true; clearInterval(timer); },
  };
}

// In live mode this simulated drilldown is replaced by real hierarchies on the Live Results tab.
function liveNotice(el) {
  const c = state.country; const t = (state.live.irev || [])[0];
  el.innerHTML = `<div class="p-6 max-w-3xl space-y-3"><div class="card p-5">
    <h2 class="text-[20px] font-bold">Regional drilldown — live mode</h2>
    <p class="text-[14px] text-slate-600 mt-1">The cascading drilldown here was built on simulated tallies, so it is hidden in live mode. Real cascading reports are on <b>Live Results</b>:</p>
    <ul class="text-[14px] mt-3 space-y-2">
      <li>${icon('account_tree', 'sm text-sky-700')} <b>Nigeria</b> — INEC IReV: election › LGA › ward › polling unit, with each EC8A result sheet${t ? ` (e.g. ${esc(t.name)})` : ''}. <a class="text-sky-700" href="#/live/NGA">Open →</a></li>
      <li>${icon('how_to_vote', 'sm text-sky-700')} <b>USA</b> — Louisiana races with precincts reporting. <a class="text-sky-700" href="#/live/USA">Open →</a></li>
      <li>${icon('how_to_vote', 'sm text-sky-700')} <b>UK</b> — declared council by-elections (Democracy Club). <a class="text-sky-700" href="#/live/GBR">Open →</a></li>
      <li>${icon('how_to_vote', 'sm text-sky-700')} <b>Australia</b> — VEC feed (test data until access is approved). <a class="text-sky-700" href="#/live/AUS">Open →</a></li></ul>
    <p class="text-[12.5px] text-slate-500 mt-3">To explore the full simulated drilldown, switch the data mode in <a class="text-sky-700" href="#/settings">Settings</a>.</p></div></div>`;
  return { update() {} };
}
