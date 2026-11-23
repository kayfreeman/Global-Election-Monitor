// News — publisher RSS feeds + GDELT. Headlines and links only.
import { state, esc, chip, icon, def, ago, throttle } from '../core.js';

export function mount(el) {
  let country = ''; let src = ''; let q = ''; let disposed = false;
  el.innerHTML = `<div class="p-4 max-w-[1500px] space-y-3">
    <div class="card p-4"><div class="flex flex-wrap items-center gap-3">
      <h2 class="font-bold text-[20px] flex items-center gap-2">${icon('newspaper')} ELECTION NEWS WIRE</h2>
      <span class="text-[13px] text-slate-500">Real headlines from publisher RSS feeds and the GDELT global news index. Click through to read on the publisher's site.</span></div>
      <div class="flex flex-wrap items-center gap-2 mt-3"><span class="lbl">Country</span><span id="nw-c" class="flex flex-wrap gap-1.5"></span>
        <span class="lbl ml-2">Source</span><select id="nw-s" class="text-[12.5px] py-1"></select>
        <div class="relative flex-1 min-w-[220px]"><span class="msi sm absolute left-2 top-2 text-slate-400">search</span><input id="nw-q" class="w-full pl-8 text-sm" placeholder="Search headlines…"/></div></div></div>
    <div class="grid grid-cols-12 gap-4"><div id="nw-list" class="col-span-12 xl:col-span-9 card divide-y divide-slate-100"></div>
      <aside class="col-span-12 xl:col-span-3 card p-3"><h3 class="font-bold mb-2">Feed health</h3><div id="nw-feeds" class="space-y-1 text-[12px]"></div></aside></div></div>`;
  const $ = (s) => el.querySelector(s);

  function render() {
    if (disposed) return;
    $('#nw-c').innerHTML = [['', 'All']].concat(state.meta.order.map((c) => [c, c])).map(([k, l]) => `<button data-nc="${k}" class="text-[12px] font-mono px-2.5 py-1 rounded border ${country === k ? 'bg-sky-700 text-white border-sky-700' : 'border-slate-300 hover:bg-slate-50'}">${l} <span class="${country === k ? 'text-sky-100' : 'text-slate-400'}">${state.news.filter((n) => !k || n.country === k).length}</span></button>`).join('');
    const sources = [...new Set(state.news.filter((n) => !country || n.country === country).map((n) => n.source))].sort();
    $('#nw-s').innerHTML = `<option value="">All sources (${sources.length})</option>` + sources.map((s) => `<option ${s === src ? 'selected' : ''}>${esc(s)}</option>`).join('');
    const list = state.news.filter((n) => (!country || n.country === country) && (!src || n.source === src) && (!q || (n.title + ' ' + n.summary).toLowerCase().includes(q)));
    $('#nw-list').innerHTML = list.slice(0, 200).map((n) => `<article class="p-3 hover:bg-slate-50">
      <div class="flex items-center gap-2 text-[11px] font-mono text-slate-500">${chip(n.country, 'blue')}<b class="text-slate-700">${esc(n.source)}</b>${n.via === 'gdelt' ? chip('GDELT', 'slate') : chip('RSS', 'slate')}<span class="flex-1"></span>${ago(n.ts)}</div>
      <a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer" class="block mt-1 font-semibold text-[15px] leading-snug hover:text-sky-700">${esc(n.title)}</a>
      ${n.summary ? `<p class="text-[13px] text-slate-600 mt-0.5">${esc(n.summary)}</p>` : ''}</article>`).join('') || `<div class="p-6 text-slate-400 text-sm">${state.news.length ? 'No headlines match.' : 'Fetching feeds — headlines appear within a minute of starting the server.'}</div>`;
    const rss = state.adapters.find((a) => a.id === 'news'); const gd = state.adapters.find((a) => a.id === 'gdelt');
    $('#nw-feeds').innerHTML = (rss && rss.feeds ? Object.entries(rss.feeds).map(([k, v]) => `<div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full ${v.ok ? 'bg-green-500' : 'bg-red-500'}"></span><span class="flex-1">${esc(k)}</span><span class="font-mono text-slate-500" title="${esc(v.error || '')}">${v.ok ? v.n : 'error'}</span></div>`).join('') : '<div class="text-slate-400">Waiting for first fetch…</div>') +
      (gd ? `<div class="flex items-center gap-2 pt-1 mt-1 border-t border-slate-100"><span class="w-2 h-2 rounded-full ${gd.status === 'live' ? 'bg-green-500' : 'bg-red-500'}"></span><span class="flex-1">GDELT</span><span class="font-mono text-slate-500">${esc(gd.detail || gd.status)}</span></div>` : '') +
      `<p class="text-[11px] text-slate-500 pt-2">Headlines and links only. Check each publisher's RSS terms (some are personal/non-commercial use) before public or commercial deployment.</p>`;
  }
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-nc]'); if (b) { country = b.dataset.nc; src = ''; render(); } });
  $('#nw-s').addEventListener('change', (e) => { src = e.target.value; render(); });
  $('#nw-q').addEventListener('input', (e) => { q = e.target.value.toLowerCase(); render(); });
  render();
  const slow = throttle(render, 3000);
  return { update(kind) { if (kind === 'news' || kind === 'live') slow(); }, unmount() { disposed = true; } };
}
