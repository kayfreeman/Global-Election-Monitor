// Audit Trail & Incident Ledger: incident register + SHA-256 hash-chained
// ledger with live integrity verification and CSV export.
import { state, api, esc, chip, icon, def, statusChip, hhmmss, SEV_TONE, throttle } from '../core.js';

export function mount(el) {
  let f = { country: '', status: '', q: '', severity: '' }; let page = 0; const PER = 12; let verify = null; let disposed = false;

  el.innerHTML = `<div class="p-4 max-w-[1800px] space-y-3">
    <div class="card px-4 py-2.5 flex flex-wrap items-center gap-3">
      ${icon('shield', 'text-sky-700')}<span class="font-mono font-semibold tracking-wider text-[13px]">LEDGER ROOT:</span>
      <span id="lg-head" class="font-mono text-[12px] px-2 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-800"></span>
      <span id="lg-verify" class="font-mono text-[12px]"></span>
      <span class="flex-1"></span>
      <button data-verify class="text-[12px] font-mono px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50">${icon('fact_check', 'sm')} VERIFY CHAIN</button>
      <a href="/api/ledger.csv" class="text-[12px] font-mono px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50">${icon('download', 'sm')} LEDGER CSV</a>
    </div>
    <div id="lg-kpis" class="grid grid-cols-2 xl:grid-cols-4 gap-3"></div>
    <div class="card p-3 flex flex-wrap items-center gap-2">
      <span class="lbl">Filter:</span><span id="lg-cty" class="flex flex-wrap gap-1.5"></span>
      <span class="lbl ml-3">Status:</span><select id="lg-st" class="text-[12.5px] rounded border-slate-300 py-1"><option value="">All statuses</option><option value="open">Open</option><option value="under_review">Under review</option><option value="resolved">Resolved</option></select>
      <select id="lg-sev" class="text-[12.5px] rounded border-slate-300 py-1"><option value="">All severities</option><option>high</option><option>medium</option><option>low</option></select>
      <div class="relative flex-1 min-w-[220px]"><span class="msi sm absolute left-2 top-2 text-slate-400">search</span><input id="lg-q" class="w-full pl-8 rounded border-slate-300 text-sm py-1.5" placeholder="Filter incident ID, place or category…"/></div>
    </div>
    <div class="grid grid-cols-12 gap-4">
      <section class="col-span-12 2xl:col-span-8 card overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200"><h3 class="font-bold text-[16px] flex items-center gap-2">${icon('receipt_long')} Incident & anomaly ledger</h3><span class="font-mono text-[11px] text-green-700 flex items-center gap-1.5"><span class="pulse"></span>LIVE</span></div>
        <div class="overflow-x-auto"><table class="w-full text-[13px]"><thead><tr>${['Severity / ID', 'Geographical hierarchy', 'Time & source', 'Issue', 'Status', ''].map((h) => `<th class="lbl text-left py-2 px-3 bg-slate-50 border-b border-slate-300">${h}</th>`).join('')}</tr></thead><tbody id="lg-rows"></tbody></table></div>
        <div id="lg-pager" class="flex items-center justify-between px-4 py-2 border-t border-slate-200 text-[12px] font-mono"></div>
      </section>
      <aside class="col-span-12 2xl:col-span-4 space-y-3">
        <div class="card p-3"><h3 class="font-bold flex items-center gap-2 mb-2">${icon('lan')} Data lineage</h3><div id="lg-lineage" class="space-y-2"></div></div>
        <div class="rounded-lg bg-slate-900 text-slate-200 p-3 font-mono text-[11.5px]"><div class="text-sky-400 font-semibold mb-1.5">LEDGER STREAM · LATEST ENTRIES</div><div id="lg-stream" class="space-y-1 max-h-72 overflow-y-auto scroll-dark"></div></div>
        <div class="card p-3"><h3 class="font-bold flex items-center gap-2 mb-2">${icon('rule')} Resolution workflow</h3>
          ${[['Opened', 'Incident logged against a unit; the unit is held out of the tally. Entry hashed into the ledger.'], ['Under review', 'Source triangulation: field observers, official logs, verified crowd reports for the same unit.'], ['Resolved', 'Unit released back to the count. Resolution entry hashed and linked to the opening entry.']].map(([t, d], i) => `
            <div class="flex gap-3 py-2 ${i ? 'border-t border-slate-100' : ''}"><span class="w-6 h-6 rounded-full bg-sky-50 border border-sky-300 text-sky-700 text-[12px] font-semibold flex items-center justify-center shrink-0">${i + 1}</span><div><b class="text-[13px]">${t}</b><p class="text-[12px] text-slate-600">${d}</p></div></div>`).join('')}
          <p class="text-[11px] text-slate-500 mt-1">The hash chain proves entries have not been altered after the fact. It does not by itself prove the underlying report is true.</p></div>
      </aside>
    </div></div>`;
  const $ = (s) => el.querySelector(s);

  async function loadRows() {
    if (disposed) return;
    const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), limit: PER, offset: page * PER });
    const r = await api.get(`/api/incidents?${qs}`);
    const c = r.counts;
    const kpi = (tone, title, n, sub, ic) => `<div class="card p-3 border-t-4 ${tone}"><div class="flex items-start justify-between"><span class="lbl">${title}</span>${icon(ic, 'text-slate-400')}</div><div class="num text-[34px] font-bold leading-tight mt-1">${n}</div><div class="text-[12px] text-slate-500 mt-1">${sub}</div></div>`;
    $('#lg-kpis').innerHTML = kpi('border-t-red-600', 'Critical / high (open)', c.high, 'Count disputes, upload mismatches, disruptions', 'gpp_maybe') +
      kpi('border-t-amber-500', 'Medium (open)', c.medium, 'Equipment, latency and logistics', 'schedule') +
      kpi('border-t-green-600', 'Low open · resolved', `${c.low} · ${c.resolved}`, 'Minor issues and closed incidents', 'task_alt') +
      kpi(verify && !verify.ok ? 'border-t-red-600' : 'border-t-sky-600', 'Chain integrity', verify ? (verify.ok ? 'VALID' : 'BROKEN') : '…', verify ? (verify.ok ? `${verify.entries} entries re-hashed` : `breaks at #${verify.brokenAt}: ${verify.reason}`) : 'verifying…', 'fingerprint');
    $('#lg-rows').innerHTML = r.items.map((i) => {
      const parts = i.path.split(' › ');
      return `<tr class="border-b border-slate-100 align-top hover:bg-slate-50">
        <td class="px-3 py-2.5">${chip(i.severity, SEV_TONE[i.severity])}<div class="font-mono text-[11.5px] mt-1">#${esc(i.id)}</div></td>
        <td class="px-3 py-2.5"><b>${esc(def(i.country).name)} › ${esc(parts[0] || '')}</b><div class="text-[12px] text-slate-500">${esc(parts.slice(1).join(' › '))}</div></td>
        <td class="px-3 py-2.5 font-mono text-[12px]">${hhmmss(i.ts)} UTC<div class="text-slate-500 font-sans">${esc(i.source)}</div></td>
        <td class="px-3 py-2.5">${esc(i.category)}${i.simulated ? `<div class="mt-1">${chip('Simulated', 'amber')}</div>` : ''}</td>
        <td class="px-3 py-2.5">${statusChip(i.status)}<div class="font-mono text-[10.5px] text-slate-500 mt-1">ledger ${i.ledgerSeqs.map((s) => '#' + s).join(' → ')}</div></td>
        <td class="px-3 py-2.5 text-right whitespace-nowrap"><a href="#/drilldown/${encodeURIComponent(i.nodeId)}" class="text-[12px] px-2 py-1 rounded border border-slate-300 hover:bg-white">Inspect</a></td></tr>`;
    }).join('') || `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400">No incidents match.</td></tr>`;
    const pages = Math.max(1, Math.ceil(r.total / PER));
    $('#lg-pager').innerHTML = `<span class="text-slate-500">SHOWING ${r.items.length} OF ${r.total} INCIDENTS</span><span class="flex items-center gap-2"><button data-page="-1" ${page ? '' : 'disabled'} class="px-2 py-0.5 rounded border border-slate-300 disabled:opacity-40">PREV</button>PAGE ${page + 1} / ${pages}<button data-page="1" ${page + 1 < pages ? '' : 'disabled'} class="px-2 py-0.5 rounded border border-slate-300 disabled:opacity-40">NEXT</button></span>`;
  }

  async function loadSide() {
    if (disposed) return;
    const L = await api.get(`/api/ledger?limit=25${f.country ? '&country=' + f.country : ''}`);
    $('#lg-stream').innerHTML = L.items.map((e) => `<div class="border-b border-slate-800 pb-1"><span class="text-slate-500">#${e.seq}</span> <span class="${e.type.includes('INCIDENT_OPENED') ? 'text-red-400' : e.type.includes('RESOLVED') || e.type.includes('VERIFIED') ? 'text-green-400' : 'text-sky-300'}">${esc(e.type)}</span> ${esc(e.country)} <span class="text-slate-400">${esc((e.nodeId || '').split('.').slice(-2).join('.'))}</span><div class="text-slate-500 truncate">sha256 ${esc(e.hash)}</div></div>`).join('') || '<div class="text-slate-500">No entries yet.</div>';
    $('#lg-lineage').innerHTML = state.adapters.map((a) => `<div class="rounded border border-slate-200 p-2"><div class="flex items-center gap-2 text-[12.5px]"><span class="w-2 h-2 rounded-full ${a.status === 'live' ? 'bg-green-500' : a.status === 'error' ? 'bg-red-500' : a.status === 'blocked' ? 'bg-slate-300' : 'bg-amber-500'}"></span><b class="flex-1">${esc(a.name)}</b><span class="font-mono text-[10.5px] text-slate-500">${esc(a.country)}</span></div><p class="text-[11px] text-slate-500 mt-0.5">${esc(a.note)}</p>${a.lastError ? `<p class="text-[11px] text-red-600 font-mono">${esc(a.lastError)}</p>` : ''}</div>`).join('');
  }
  async function runVerify() { verify = await api.get('/api/ledger/verify'); renderHead(); }
  function renderHead() {
    if (disposed) return;
    $('#lg-head').textContent = `${state.ledgerHead.hash.slice(0, 8)}…${state.ledgerHead.hash.slice(-4)}`;
    $('#lg-verify').innerHTML = `BLOCK #${state.ledgerHead.seq} ${verify ? (verify.ok ? '<span class="text-green-700">• CHAIN VERIFIED</span>' : `<span class="text-red-600">• CHAIN BROKEN AT #${verify.brokenAt}</span>`) : ''}`;
  }
  function filters() {
    $('#lg-cty').innerHTML = [['', 'All (5)']].concat(state.meta.order.map((c) => [c, `${c} (${def(c).authorityShort})`])).map(([k, l]) => `<button data-fc="${k}" class="text-[12px] font-mono px-2.5 py-1 rounded border ${f.country === k ? 'bg-sky-700 text-white border-sky-700' : 'border-slate-300 hover:bg-slate-50'}">${l}</button>`).join('');
  }

  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-fc]'); if (c) { f.country = c.dataset.fc; page = 0; filters(); loadRows(); loadSide(); return; }
    const p = e.target.closest('[data-page]'); if (p) { page += +p.dataset.page; loadRows(); return; }
    if (e.target.closest('[data-verify]')) { verify = null; renderHead(); runVerify().then(loadRows); }
  });
  $('#lg-st').addEventListener('change', (e) => { f.status = e.target.value; page = 0; loadRows(); });
  $('#lg-sev').addEventListener('change', (e) => { f.severity = e.target.value; page = 0; loadRows(); });
  let qt; $('#lg-q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value.trim(); page = 0; loadRows(); }, 250); });

  filters(); renderHead(); runVerify().then(loadRows); loadSide();
  const slow = throttle(() => { renderHead(); loadRows(); loadSide(); }, 3000);
  const vt = setInterval(runVerify, 30000);
  return { update(kind) { if (kind === 'tick') slow(); }, unmount() { disposed = true; clearInterval(vt); } };
}
