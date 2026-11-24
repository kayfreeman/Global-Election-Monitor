// Live Results — real data only. Nigeria: INEC IReV tracker (election ›
// LGA › ward › polling unit with result-sheet links). Other countries:
// official contest results from the public sources that are reachable.
import { state, api, esc, fmt, pct, chip, icon, def, bar, party, ago, setCountry, throttle, yearFor, yearsFor, yearSelect, archiveFor, CUR_YEAR } from '../core.js';

const STATUS_TONE = { live: 'green', test: 'amber', error: 'red', blocked: 'slate', needs_key: 'amber', configured: 'blue', idle: 'slate', off: 'slate' };

export function mount(el, param) {
  let country = (param || '').split('/')[0] || state.country; let q = ''; let disposed = false; let office = ''; let stateSel = '';
  let irevSel = null; let irevData = null; let lgaSel = null; let wardData = null;
  let arch = null; let archErr = null; let elecSel = null; let years = [];

  el.innerHTML = `<div class="p-4 max-w-[1800px] space-y-3">
    <div class="card p-4 flex flex-wrap items-center gap-3">
      <h2 class="font-bold text-[20px] flex items-center gap-2"><span class="text-green-600"><span class="pulse"></span></span> RESULTS — OFFICIAL PUBLIC SOURCES</h2><span id="lv-year"></span>
      <span class="text-[13px] text-slate-500">Real data only — live feeds, official archives and INEC declared results. Test feeds are labelled TEST DATA.</span>
      <span class="flex-1"></span><span id="lv-tabs" class="flex flex-wrap gap-1.5"></span>
    </div>
    <div id="lv-sources" class="flex flex-wrap gap-2"></div>
    <div id="lv-body" class="space-y-3"></div>
  </div>`;
  const $ = (s) => el.querySelector(s);

  async function loadArch() {
    const y = yearFor(country); const cty = country; archErr = null;
    let a = null; try { a = await archiveFor(cty, y); } catch (e) { archErr = e.message; }
    if (yearFor(cty) !== y || country !== cty) return; // superseded by a newer choice
    arch = a;
    if (arch && elecSel && !arch.contests.some((c) => c.electionId === elecSel)) elecSel = null;
  }
  async function loadYears() { years = await yearsFor(country); const b = $('#lv-year'); if (b) b.innerHTML = yearSelect(country, years); }
  function header() {
    $('#lv-tabs').innerHTML = state.meta.order.map((c) => {
      const n = c === 'NGA' ? state.live.irev.length : state.live.contests.filter((x) => x.country === c).length;
      return `<button data-lc="${c}" class="text-[12px] font-mono px-2.5 py-1 rounded border ${c === country ? 'bg-sky-700 text-white border-sky-700' : 'border-slate-300 hover:bg-slate-50'}">${c} <span class="${c === country ? 'text-sky-100' : 'text-slate-400'}">${n}</span></button>`;
    }).join('');
    const srcs = state.adapters.filter((a) => a.country === country && a.kind === 'results');
    $('#lv-sources').innerHTML = srcs.map((a) => `<div class="card px-3 py-2 text-[12.5px] max-w-md">
      <div class="flex items-center gap-2"><b>${esc(a.name)}</b>${chip((({ live: 'Live', test: 'Test data', error: 'Error', blocked: 'No access', needs_key: 'Needs key', configured: 'Key set', idle: 'Idle', off: 'Off' })[a.status] || a.status), STATUS_TONE[a.status] || 'slate')}
        ${a.lastOk ? `<span class="font-mono text-[10.5px] text-slate-500">ok ${ago(a.lastOk)}</span>` : ''}${a.docs ? `<a href="${esc(a.docs)}" target="_blank" rel="noopener" class="text-sky-700 text-[11px]">source ↗</a>` : ''}</div>
      <div class="text-slate-600 mt-0.5">${esc(a.detail || a.note || '')}</div>${a.lastError ? `<div class="text-red-600 font-mono text-[11px] mt-0.5">${esc(a.lastError)}</div>` : ''}</div>`).join('');
  }

  // ---------------- Nigeria / IReV ----------------
  async function loadIrev() {
    if (!irevSel && state.live.irev.length) irevSel = state.live.irev[0].id;
    if (irevSel) irevData = await api.get(`/api/live/irev/${irevSel}`).catch(() => null);
    if (lgaSel && wardData) wardData = await api.get(`/api/live/irev/${irevSel}/ward/${wardData.id}`).catch(() => wardData);
  }
  // ---------------- declared results (Nigeria) ----------------
  function declaredView() {
    const y = yearFor(country);
    if (!arch) return `<div class="card p-4 text-sm text-slate-500">${archErr ? `Couldn't load ${y}: ${esc(archErr)}` : `Loading ${y}…`}</div>`;
    const overall = arch.contests.filter((c) => c.declared && c.id === c.electionId).sort((a, b) => (a.officeType === 'PRES' ? -1 : 1) - (b.officeType === 'PRES' ? -1 : 1) || a.area.localeCompare(b.area));
    const irevNote = arch.irev.length ? `<div class="text-[12.5px] text-slate-600">IReV result-sheet uploads for ${y}: ${arch.irev.map((e) => `<a href="${esc(e.portal)}" target="_blank" rel="noopener" class="text-sky-700">${esc(e.type === 'PRES' ? 'Presidential' : e.state + ' governorship')} ↗</a>`).join(' · ')}</div>` : '';
    if (!overall.length) return `<div class="card p-4"><h3 class="font-semibold">No declared results loaded for ${y}</h3><p class="text-[13px] text-slate-600 mt-1">${esc(arch.notes.join(' '))} Moderators can add a declared result from Settings.</p>${irevNote}</div>`;
    if (!elecSel) elecSel = overall[0].electionId;
    const sel = overall.find((c) => c.electionId === elecSel) || overall[0];
    const areas = arch.contests.filter((c) => c.electionId === sel.electionId && c.id !== sel.electionId);
    const inAreas = new Set(areas.flatMap((a) => a.choices.map((x) => x.partyCode)));
    const cols = sel.choices.filter((x) => x.partyCode !== 'OTH' && (!areas.length || inAreas.has(x.partyCode))).slice(0, 4);
    const tot = (c) => c.choices.reduce((a, x) => a + x.votes, 0);
    const table = areas.length ? `<div class="overflow-x-auto"><table class="w-full text-[13px]"><thead><tr><th class="lbl text-left py-2 px-2 bg-slate-50 border-b border-slate-300">${sel.officeType === 'PRES' ? 'State' : 'LGA'}</th>${cols.map((x) => `<th class="lbl text-right py-2 px-2 bg-slate-50 border-b border-slate-300"><span class="inline-block w-2 h-2 rounded-sm mr-1" style="background:${party('NGA', x.partyCode).color}"></span>${esc(x.party)}</th>`).join('')}<th class="lbl text-right py-2 px-2 bg-slate-50 border-b border-slate-300">Others</th><th class="lbl text-right py-2 px-2 bg-slate-50 border-b border-slate-300">Total</th><th class="lbl text-left py-2 px-2 bg-slate-50 border-b border-slate-300">Won by</th></tr></thead><tbody>
      ${areas.map((a, i) => { const t = tot(a); const win = a.choices[0]; const v = (pc) => a.choices.find((x) => x.partyCode === pc)?.votes || 0; const others = t - cols.reduce((s, x) => s + v(x.partyCode), 0);
        return `<tr class="${i % 2 ? 'bg-slate-50' : ''} h-9"><td class="px-2 font-medium">${esc(a.area)}</td>${cols.map((x) => `<td class="px-2 text-right num ${win.partyCode === x.partyCode ? 'font-semibold' : ''}">${fmt(v(x.partyCode))} <span class="text-slate-400 text-[11px]">${t ? pct(v(x.partyCode) / t, 1) : ''}</span></td>`).join('')}<td class="px-2 text-right num text-slate-500">${fmt(others)}</td><td class="px-2 text-right num">${fmt(t)}</td><td class="px-2"><span class="inline-block w-2 h-2 rounded-sm mr-1" style="background:${party('NGA', win.partyCode).color}"></span>${esc(win.party || win.name)}</td></tr>`; }).join('')}</tbody></table></div>`
      : `<p class="text-[13px] text-slate-500 p-4">Only the overall declared result is available for this election — no ${sel.officeType === 'PRES' ? 'state' : 'LGA'} breakdown was published in the source.</p>`;
    return `<div class="space-y-3">
      <div class="flex flex-wrap gap-2">${overall.map((c) => `<button data-elec="${esc(c.electionId)}" class="px-3 py-1.5 rounded border text-[12.5px] ${c.electionId === sel.electionId ? 'bg-sky-700 text-white border-sky-700' : 'border-slate-300 hover:bg-slate-50'}">${esc(c.officeType === 'PRES' ? 'Presidential' : c.area)}</button>`).join('')}</div>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-3"><div>${card(sel)}</div>
        <div class="xl:col-span-2 card"><div class="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2"><h3 class="font-bold text-[15px]">${esc(sel.electionTitle)} — results by ${sel.officeType === 'PRES' ? 'state' : 'LGA'}</h3><span class="flex-1"></span>${sel.url ? `<a href="${esc(sel.url)}" target="_blank" rel="noopener" class="text-[12px] text-sky-700">Source ↗</a>` : ''}</div>${table}
          <p class="text-[11.5px] text-slate-500 px-4 py-2 border-t border-slate-100">${esc(sel.sourceNote || '')} ${sel.check === 'single-source' ? '<b class="text-amber-700">Single source — verify against INEC before publishing.</b>' : sel.check ? '<span class="text-green-700">Cross-checked: ' + (sel.check === 'lga-sums' ? 'area totals add up to the declared result.' : 'summary box and results table agree.') + '</span>' : ''}</p></div></div>
      ${irevNote}</div>`;
  }

  function irevView() {
    const list = state.live.irev;
    if (!list.length) return '';
    const cards = list.map((t) => `<button data-irev="${esc(t.id)}" class="card p-3 text-left ${t.id === irevSel ? 'ring-2 ring-sky-500' : 'hover:border-sky-400'}">
      <div class="flex items-center gap-2">${chip('INEC IReV', 'green')}<span class="font-mono text-[10.5px] text-slate-500">${t.date ? String(t.date).slice(0, 10) : ''}</span></div>
      <div class="font-semibold text-[14px] mt-1 leading-snug">${esc(t.name)}</div>
      <div class="flex items-end justify-between mt-1"><span class="num text-[26px] font-semibold text-sky-700">${pct(t.pct, 2)}</span><span class="num text-[11px] text-slate-500">${fmt(t.uploaded)} / ${fmt(t.expected)} PUs</span></div>
      <div class="mt-1.5">${bar(t.pct, '#16a34a')}</div>
      <div class="font-mono text-[10.5px] text-slate-500 mt-1.5">${t.latestUpload ? `last upload ${ago(t.latestUpload.at)} · PU ${esc(t.latestUpload.puCode)}` : ''}</div></button>`).join('');
    let detail = '<div class="card p-6 text-slate-400 text-sm">Loading election structure…</div>';
    if (irevData) {
      const t = irevData;
      const crumbs = `<a data-crumb="election" class="text-sky-700 cursor-pointer">${esc(t.state || 'State')}</a>${lgaSel ? ` › <a data-crumb="lga" class="text-sky-700 cursor-pointer">${esc(t.lgas.find((l) => l.id === lgaSel)?.name || '')} LGA</a>` : ''}${wardData ? ` › <b>${esc(wardData.name)}</b>` : ''}`;
      let table;
      if (wardData) {
        table = `<table class="w-full text-[13px]"><thead><tr>${['PU code', 'Polling unit', 'Result sheet', 'Uploaded', ''].map((h, i) => `<th class="lbl py-2 px-2 bg-slate-50 border-b border-slate-300 ${i > 2 ? 'text-right' : 'text-left'}">${h}</th>`).join('')}</tr></thead><tbody>` +
          (wardData.pus || []).map((p, i) => `<tr class="${i % 2 ? 'bg-slate-50' : ''} h-10"><td class="px-2 num">${esc(p.code)}</td><td class="px-2">${esc(p.name)}${p.supplements ? ` ${chip(`${p.supplements} older upload(s)`, 'amber')}` : ''}</td>
            <td class="px-2">${p.uploaded ? chip('Uploaded', 'green') : chip('Not uploaded', 'red')}</td><td class="px-2 text-right font-mono text-[11.5px] text-slate-500">${p.at ? new Date(p.at).toLocaleString() : '—'}</td>
            <td class="px-2 text-right">${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener" class="text-sky-700 font-mono text-[11.5px]">View EC8A sheet ↗</a>` : ''}</td></tr>`).join('') + '</tbody></table>' +
          `<p class="text-[11.5px] text-slate-500 p-2">Sheets are images uploaded from BVAS. Vote figures are not machine-readable on IReV; transcription/OCR is the next step.</p>`;
      } else if (lgaSel) {
        const l = t.lgas.find((x) => x.id === lgaSel);
        table = rows(l.wards, 'Ward', 'ward');
      } else table = rows(t.lgas, 'LGA', 'lga');
      detail = `<div class="card">
        <div class="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-200"><h3 class="font-bold text-[16px]">${esc(t.name)}</h3><span class="flex-1"></span>
          <span class="font-mono text-[11px] text-slate-500">${t.crawledWards || 0}/${t.totalWards || 0} wards indexed · stats ${t.statsAt ? ago(t.statsAt) : '—'}</span>
          <a href="${esc(t.portal)}" target="_blank" rel="noopener" class="text-[12px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">Open on IReV ↗</a></div>
        <div class="px-4 py-2 text-[13px] border-b border-slate-100">${crumbs}</div>
        <div class="overflow-x-auto">${table}</div></div>`;
    }
    return `<div class="grid grid-cols-1 md:grid-cols-3 gap-3">${cards}</div>${detail}`;
  }
  function rows(list, label, kind) {
    return `<table class="w-full text-[13px]"><thead><tr>${[label, 'Polling units', 'Uploaded', 'Upload progress', ''].map((h, i) => `<th class="lbl py-2 px-2 bg-slate-50 border-b border-slate-300 ${i && i < 3 ? 'text-right' : 'text-left'}">${h}</th>`).join('')}</tr></thead><tbody>` +
      list.map((x, i) => { const p = x.total ? x.uploaded / x.total : null; return `<tr class="${i % 2 ? 'bg-slate-50' : ''} h-10 hover:bg-sky-50 cursor-pointer" data-${kind}="${esc(x.id)}">
        <td class="px-2 font-medium">${esc(x.name)}${kind === 'lga' && x.crawled < x.wards.length ? ` <span class="font-mono text-[10.5px] text-slate-400">${x.crawled || 0}/${x.wards.length} wards indexed</span>` : ''}</td>
        <td class="px-2 num text-right">${x.total != null ? fmt(x.total) : '…'}</td><td class="px-2 num text-right">${x.uploaded != null ? fmt(x.uploaded) : '…'}</td>
        <td class="px-2 w-64">${p != null ? `<div class="flex items-center gap-2"><div class="flex-1">${bar(p, p >= 1 ? '#16a34a' : p > 0.9 ? '#0284c7' : '#d97706')}</div><span class="num text-[11px] w-12 text-right">${pct(p, 1)}</span></div>` : '<span class="text-slate-400 text-[12px]">indexing…</span>'}</td>
        <td class="px-2 text-right text-sky-700 font-mono text-[11.5px]">Open →</td></tr>`; }).join('') + '</tbody></table>';
  }

  // ---------------- contests (US / UK / AUS / NZ) ----------------
  function contestsView() {
    const y = yearFor(country);
    if (!arch) return `<div class="card p-4 text-sm text-slate-500">${archErr ? `Couldn't load ${y}: ${esc(archErr)}` : `Loading ${y} results… (past years are fetched once from the official archive, then cached)`}</div>`;
    const all = arch.contests;
    let list = all.slice();
    if (q) list = list.filter((c) => (c.title + ' ' + c.area + ' ' + c.choices.map((x) => x.name + ' ' + x.party).join(' ')).toLowerCase().includes(q));
    if (!all.length) return emptyState(country) + (arch.notes.length ? `<p class="text-[12px] text-slate-500 mt-2">${esc(arch.notes.join(' '))}</p>` : '');
    // Office segments: President / Senate / House / Governor… (nationwide), plus single-state feeds such as Louisiana
    const OFF = { PRES: 'President', SEN: 'Senate', HOUSE: 'House', GOV: 'Governor' };
    const segOf = (c) => (c.stateFeed ? 'STATEFEED' : OFF[c.officeType] ? c.officeType : 'OTHER');
    const segs = [...new Set(all.map(segOf))].sort((a, b) => ['PRES', 'SEN', 'HOUSE', 'GOV', 'OTHER', 'STATEFEED'].indexOf(a) - ['PRES', 'SEN', 'HOUSE', 'GOV', 'OTHER', 'STATEFEED'].indexOf(b));
    const segLabel = (k) => (k === 'STATEFEED' ? `${all.find((c) => c.stateFeed)?.area || 'State'} only` : k === 'OTHER' ? 'Other' : OFF[k]);
    const useSegs = segs.length > 1;
    if (useSegs && !segs.includes(office)) office = segs[0];
    if (useSegs) list = list.filter((c) => segOf(c) === office);
    const dists = list.filter((c) => c.level === 'district' && c.parent); const statesInSeg = dists.length >= 30 ? [...new Set(dists.map((c) => c.parent))].sort() : []; // House seats, Canadian ridings, UK constituencies…
    if (!statesInSeg.includes(stateSel)) stateSel = '';
    if (stateSel) list = list.filter((c) => c.level === 'national' || c.parent === stateSel || c.area === stateSel);
    const segBar = useSegs || statesInSeg.length ? `<div class="flex flex-wrap items-center gap-2">${!useSegs ? '' : segs.map((k) => `<button data-office="${k}" class="px-3 py-1.5 rounded border text-[12.5px] ${k === office ? 'bg-sky-700 text-white border-sky-700' : 'border-slate-300 hover:bg-slate-50'}">${esc(segLabel(k))} <span class="opacity-70 font-mono text-[11px]">${all.filter((c) => segOf(c) === k).length}</span></button>`).join('')}
      ${statesInSeg.length ? `<select id="lv-state" class="text-[13px] py-1 ml-auto"><option value="">${country === 'CAN' ? 'All provinces and territories' : country === 'GBR' ? 'All nations' : country === 'AUS' ? 'All states and territories' : 'All states'}</option>${statesInSeg.map((x) => `<option ${x === stateSel ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}</div>` : '';
    const test = all.some((c) => c.test);
    const LV = { national: 0, state: 1 };
    list.sort((a, b) => (LV[a.level] ?? 2) - (LV[b.level] ?? 2) || (b.date || '').localeCompare(a.date || '') || (a.officeLevel || 999) - (b.officeLevel || 999));
    const eo = all.some((c) => c.source === 'electionorg');
    return `${test ? `<div class="rounded border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800">${icon('science', 'sm')} <b>TEST DATA</b> — this is the VEC's public sample feed, replayed to prove the parser. Real Victorian results replace it once VEC feed access is approved.</div>` : ''}
      ${segBar}
      <div class="card p-3 flex items-center gap-3"><span class="msi text-slate-400">search</span><input id="lv-q" value="${esc(q)}" class="flex-1 text-sm" placeholder="Filter contests, places or candidates…"/><span class="font-mono text-[11px] text-slate-500">${list.length} of ${all.length}</span></div>
      ${eo ? `<p class="text-[12px] text-slate-500">Historical certified results: <a href="https://election.org" target="_blank" rel="noopener" class="text-sky-700">Data via Election.org</a> (original sources: FEC, House Clerk, national electoral bodies). Each card links to its record. Summary cards first; use the filter to find a seat.</p>` : ''}
      ${arch.notes.length ? `<div class="rounded border border-sky-200 bg-sky-50 p-3 text-[13px] text-sky-900">${arch.notes.map(esc).join('<br>')}</div>` : ''}
      ${(() => { // nationwide results first, then single-state feeds (e.g. Louisiana) under their own heading
        const nat = list.filter((c) => !c.stateFeed); const st = list.filter((c) => c.stateFeed);
        const grid = (xs) => `<div class="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">${xs.slice(0, stateSel || q ? 500 : 120).map(card).join('')}</div>${xs.length > (stateSel || q ? 500 : 120) ? `<p class="text-[12px] text-slate-500">Showing the first ${stateSel || q ? 500 : 120} of ${xs.length} — pick a state or use the filter to narrow.</p>` : ''}`;
        return (nat.length ? (st.length ? `<h3 class="font-bold text-[15px] pt-1">Nationwide</h3>` : '') + grid(nat) : '')
          + (st.length ? `<h3 class="font-bold text-[15px] pt-2">${esc(st[0].area)} only <span class="font-normal text-[12.5px] text-slate-500">— state results from the ${esc(st[0].area)} Secretary of State</span></h3>` + grid(st) : '');
      })()}`;
  }
  function card(c) {
    const tot = c.choices.reduce((a, x) => a + x.votes, 0); const rp = c.reportingTotal ? c.reportingDone / c.reportingTotal : 0;
    return `<div class="card p-3">
      <div class="flex flex-wrap items-center gap-1.5">${c.test ? chip('Test data', 'amber') : c.official ? chip('Official', 'green') : chip('Unofficial', 'blue')}${c.declared ? chip('Declared', 'green') : ''}<span class="font-mono text-[10.5px] text-slate-500">${esc(c.area || '')} · ${esc(c.date || '')}</span></div>
      <div class="font-semibold text-[15px] mt-1 leading-snug">${esc(c.title)}</div>
      ${c.reportingTotal ? `<div class="flex items-center gap-2 mt-1.5"><div class="flex-1">${bar(rp, rp >= 1 ? '#16a34a' : '#0284c7', 'h-1')}</div><span class="font-mono text-[10.5px] text-slate-500">${fmt(c.reportingDone)}/${fmt(c.reportingTotal)} ${esc(c.reportingLabel || '')}</span></div>` : ''}
      <div class="mt-2 space-y-1.5">${c.choices.slice(0, 6).map((x) => { const col = party(c.country, x.partyCode).color; return `
        <div><div class="flex items-center gap-2 text-[13px]"><span class="w-2 h-2 rounded-sm" style="background:${col}"></span><span class="truncate flex-1 ${x.elected ? 'font-semibold' : ''}">${esc(x.name)} <span class="text-slate-500 text-[11.5px]">${esc(x.party || '')}</span></span>${x.elected ? `<span class="text-green-700 text-[11px] font-mono">✓ ${c.declared ? 'DECLARED WINNER' : 'ELECTED'}</span>` : ''}<span class="num">${fmt(x.votes)}</span><span class="num text-[11.5px] text-slate-500 w-12 text-right">${tot ? pct(x.votes / tot) : '—'}</span></div>
        <div class="mt-0.5">${bar(tot ? x.votes / tot : 0, col, 'h-1')}</div></div>`; }).join('')}
        ${c.choices.length > 6 ? `<div class="text-[11px] text-slate-400">+${c.choices.length - 6} more</div>` : ''}</div>
      ${c.note || c.choices.some((x) => x.note) ? `<div class="mt-2 text-[11.5px] text-amber-800 bg-amber-50 rounded px-2 py-1">${esc([c.note, ...c.choices.filter((x) => x.note).map((x) => `${x.name}: ${x.note}`)].filter(Boolean).join(' · '))}</div>` : ''}
      ${c.twoCP && c.twoCP.length ? `<div class="mt-2 pt-2 border-t border-slate-100 text-[12px]"><span class="lbl">Two-candidate preferred</span> ${c.twoCP.map((x) => `<span class="ml-2">${esc(x.name)} <b class="num">${fmt(x.votes)}</b></span>`).join('')}</div>` : ''}
      <div class="flex items-center justify-between mt-2 text-[11px] font-mono text-slate-500"><span>${c.ballots ? `${fmt(c.ballots)} ballots` : ''}${c.registered ? ` · ${fmt(c.registered)} registered` : ''}</span>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener" class="text-sky-700">source ↗</a>` : ''}</div></div>`;
  }
  function emptyState(c) {
    const srcs = state.adapters.filter((a) => a.country === c && a.kind === 'results');
    return `<div class="card p-6"><h3 class="font-semibold">No live results for ${esc(def(c).name)} yet</h3>
      <p class="text-[13px] text-slate-600 mt-1">${srcs.map((a) => `<b>${esc(a.name)}:</b> ${esc(a.lastError || a.note || a.status)}`).join('<br>') || 'No source configured.'}</p>
      <p class="text-[12px] text-slate-500 mt-2">Sources fetch in the background — first results usually appear within a minute of starting the server.</p></div>`;
  }

  function render() {
    if (disposed) return;
    header();
    if (country === 'NGA') {
      const tracker = yearFor('NGA') === CUR_YEAR ? irevView() : '';
      $('#lv-body').innerHTML = declaredView() + (tracker ? `<h3 class="font-bold text-[15px] pt-2">INEC IReV — result-sheet upload tracker</h3>${tracker}` : '');
    } else $('#lv-body').innerHTML = contestsView();
    const ss = $('#lv-state'); if (ss) ss.addEventListener('change', (e) => { stateSel = e.target.value; render(); });
    const inp = $('#lv-q'); if (inp) { inp.addEventListener('input', (e) => { q = e.target.value.toLowerCase(); const pos = e.target.selectionStart; render(); const n = $('#lv-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }); }
  }

  el.addEventListener('click', async (e) => {
    const t = (s) => e.target.closest(s);
    if (t('[data-lc]')) { country = t('[data-lc]').dataset.lc; setCountry(country); q = ''; arch = null; elecSel = null; history.replaceState(null, '', `#/live/${country}`); render(); loadYears(); await loadArch(); render(); return; }
    if (t('[data-office]')) { office = t('[data-office]').dataset.office; stateSel = ''; render(); return; }
    if (t('[data-elec]')) { elecSel = t('[data-elec]').dataset.elec; render(); return; }
    if (t('[data-irev]')) { irevSel = t('[data-irev]').dataset.irev; lgaSel = null; wardData = null; irevData = null; render(); await loadIrev(); render(); return; }
    if (t('[data-lga]')) { lgaSel = t('[data-lga]').dataset.lga; wardData = null; render(); el.parentElement.scrollTop = 0; return; }
    if (t('[data-ward]')) { wardData = await api.get(`/api/live/irev/${irevSel}/ward/${t('[data-ward]').dataset.ward}`); render(); el.parentElement.scrollTop = 0; return; }
    const c = t('[data-crumb]'); if (c) { if (c.dataset.crumb === 'election') { lgaSel = null; wardData = null; } else wardData = null; render(); }
  });

  render(); loadYears(); loadArch().then(render); if (country === 'NGA') loadIrev().then(render);
  const slow = throttle(async () => { if (country === 'NGA') await loadIrev(); if (yearFor(country) === CUR_YEAR) await loadArch(); if (document.activeElement?.id !== 'lv-q' && !document.activeElement?.matches?.('#lv-year select, #lv-state')) render(); else header(); }, 4000);
  return {
    update(kind, d) {
      if (kind === 'live') slow();
      if (kind === 'year' || kind === 'country') { if (kind === 'country' && state.country !== country) { country = state.country; elecSel = null; } arch = null; render(); loadYears(); loadArch().then(render); }
    },
    unmount() { disposed = true; },
  };
}
