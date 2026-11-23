// Multi-Camera Live Stream Wall (dark command theme): 2×2 / 3×2 / 1+5 focus
// layouts, hero solo audio, per-channel mute/solo/volume, and an editor for
// broadcaster stream URLs (saved to config.json on the server).
import { state, api, esc, chip, icon, def, hhmmss, toast, WIRE_TONE } from '../core.js';
import { embedHtml, setAudio, youtubeEmbed, isChannelUrl } from './streamutil.js';

export function mount(el) {
  let streams = []; let layout = 'focus'; let hero = null; let filter = ''; let audio = {}; let editing = false; let disposed = false;
  const live = {}; // stream id → { videoId, live, upcoming, title, embeddable, error, channelUrl }
  el.classList.add('wall');
  el.innerHTML = `<div class="dark min-h-full bg-void text-slate-200 p-4 space-y-3">
    <div class="flex flex-wrap items-center gap-3">
      <h2 class="font-bold text-[20px] flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>MULTI-CAMERA LIVE STREAM WALL</h2>
      <span id="wl-count" class="font-mono text-[11px] px-2 py-1 rounded border border-slate-700 text-slate-400"></span>
      <span class="flex-1"></span><span id="wl-filter" class="flex flex-wrap gap-1"></span>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span class="inline-flex rounded border border-slate-700 overflow-hidden">${[['2x2', '2×2'], ['3x2', '3×2'], ['focus', '1+5 focus']].map(([k, l]) => `<button data-layout="${k}" class="px-3 py-1.5 text-[12px] font-mono">${l}</button>`).join('')}</span>
      <button data-fs class="px-3 py-1.5 text-[12px] font-mono rounded border border-slate-700 hover:bg-elev">${icon('fullscreen', 'sm')} FULLSCREEN</button>
      <button data-muteall class="px-3 py-1.5 text-[12px] font-mono rounded border border-slate-700 hover:bg-elev">${icon('volume_off', 'sm')} MUTE ALL</button>
      <button data-edit class="px-3 py-1.5 text-[12px] font-mono rounded bg-sky-600 text-white hover:bg-sky-500">${icon('tune', 'sm')} CONFIGURE FEEDS</button>
    </div>
    <div id="wl-editor"></div>
    <div id="wl-grid"></div>
    <div class="grid grid-cols-12 gap-3">
      <section class="col-span-12 xl:col-span-7 rounded border border-elev bg-panel">
        <div class="flex items-center gap-3 px-3 py-2 border-b border-elev">${chip('Country wire', 'blue')}<b id="wl-wirehead" class="text-[13px] text-sky-300"></b><span class="flex-1"></span><span class="font-mono text-[10.5px] text-slate-500">NO CAPTION FEED CONNECTED</span></div>
        <div id="wl-wire" class="max-h-64 overflow-y-auto scroll-dark divide-y divide-elev"></div>
      </section>
      <section class="col-span-12 xl:col-span-5 rounded border border-elev bg-panel p-3">
        <div class="flex items-center gap-2 mb-2">${icon('graphic_eq', 'text-sky-400')}<b class="text-[15px]">AUDIO MATRIX</b><span class="flex-1"></span><span class="font-mono text-[10.5px] text-slate-500">YOUTUBE + VIDEO CONTROLLABLE</span></div>
        <div id="wl-audio" class="flex gap-2 overflow-x-auto scroll-dark pb-1"></div>
        <p class="text-[11px] text-slate-500 mt-2">Browsers block autoplay with sound: press a channel's speaker once to enable audio. Generic iframe players can't be controlled from here.</p>
      </section>
    </div></div>`;
  const $ = (s) => el.querySelector(s);
  const visible = () => streams.filter((s) => !filter || s.country === filter);

  function grid() {
    if (disposed) return;
    const list = visible();
    if (!hero || !list.find((s) => s.id === hero)) hero = (list.find((s) => s.url) || list[0] || {}).id;
    el.querySelectorAll('[data-layout]').forEach((b) => b.className = `px-3 py-1.5 text-[12px] font-mono ${b.dataset.layout === layout ? 'bg-sky-600 text-white' : 'hover:bg-elev'}`);
    $('#wl-count').textContent = `${streams.filter((s) => s.url && onAir(s) && (!isChan(s) || live[s.id])).length} ON AIR · ${streams.filter((s) => s.url).length} CHANNELS`;
    $('#wl-filter').innerHTML = [['', `ALL FEEDS (${streams.length})`]].concat(state.meta.order.map((c) => [c, c])).map(([k, l]) => `<button data-wf="${k}" class="px-2.5 py-1 text-[11.5px] font-mono rounded ${filter === k ? 'bg-sky-500 text-slate-900' : 'bg-elev text-slate-300 hover:bg-slate-700'}">${l}</button>`).join('');
    const tile = (s, big) => {
      const a = audio[s.id] || { muted: true, vol: 80 };
      return `<div class="relative rounded border ${s.id === hero ? 'border-red-500' : 'border-elev'} bg-panel overflow-hidden group ${big ? '' : 'cursor-pointer'}" data-tile="${esc(s.id)}">
        <div class="absolute top-2 left-2 z-10 flex items-center gap-1.5 pointer-events-none">
          ${!s.url ? chip('No feed', 'slate') : onAir(s) ? chip(`<span class="pulse"></span> ${s.id === hero ? 'On air // hero' : 'Live'}`, 'solidred') : chip(live[s.id] ? (live[s.id].upcoming ? 'Scheduled' : 'Off air') : 'Checking…', 'slate')}
          <span class="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-black/60 text-sky-300">${esc(s.country)} · ${esc(def(s.country).authorityShort)}</span>
          ${s.id === hero && !a.muted ? chip('Solo audio', 'blue') : ''}</div>
        <div class="aspect-video bg-black">${body(s)}</div>
        <div class="px-2.5 py-1.5 flex items-center gap-2 border-t border-elev"><b class="text-[13px] truncate flex-1" title="${esc(live[s.id]?.title || '')}">${esc(s.label || s.id)}</b>
          ${s.url ? `<a href="${esc(watchUrl(s))}" target="_blank" rel="noopener" class="text-[10.5px] font-mono text-sky-400 hover:underline shrink-0">YouTube ↗</a>` : ''}
          ${s.id !== hero ? `<button data-hero="${esc(s.id)}" class="text-[10.5px] font-mono px-2 py-0.5 rounded border border-slate-600 hover:bg-elev">FOCUS</button>` : ''}</div></div>`;
    };
    let html;
    if (layout === 'focus') {
      const h = list.find((s) => s.id === hero); const rest = list.filter((s) => s.id !== hero).slice(0, 5);
      html = `<div class="grid grid-cols-12 gap-3"><div class="col-span-12 lg:col-span-8">${h ? tile(h, true) : ''}</div><div class="col-span-12 lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-2 max-h-[80vh] overflow-y-auto scroll-dark">${rest.map((s) => tile(s, false)).join('')}</div></div>`;
    } else {
      const n = layout === '2x2' ? 4 : 6;
      html = `<div class="grid ${layout === '2x2' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'} gap-3">${list.slice(0, n).map((s) => tile(s, true)).join('')}</div>`;
    }
    $('#wl-grid').innerHTML = html;
    audioStrip(); wire();
  }

  const isChan = (s) => s.url && s.type === 'youtube' && isChannelUrl(s.url);
  const onAir = (s) => !isChan(s) || !!(live[s.id] && live[s.id].live);
  const watchUrl = (s) => { const r = live[s.id]; return r && r.videoId ? `https://www.youtube.com/watch?v=${r.videoId}` : isChan(s) ? `${(r && r.channelUrl) || s.url.replace(/\/live\/?$/, '')}/live` : s.url; };
  const msg = (ic, text, s) => `<div class="h-full flex flex-col items-center justify-center text-slate-400 gap-1.5 p-3 text-center">${icon(ic, 'lg')}<span class="text-[12.5px]">${text}</span>${s ? `<a href="${esc(watchUrl(s))}" target="_blank" rel="noopener" class="text-[11.5px] font-mono text-sky-400 hover:underline">Open on YouTube ↗</a>` : ''}</div>`;
  function body(s) {
    if (!s.url) return msg('videocam_off', 'Slot empty — use Configure feeds');
    if (!isChan(s)) return embedHtml(s, { muted: true, autoplay: true, domId: `pl-${s.id}` });
    const r = live[s.id];
    if (!r) return msg('hourglass_top', 'Looking up the live broadcast…');
    if (r.error) return msg('error', `Couldn't reach this channel (${esc(r.error)})`, s);
    if (!r.videoId) return msg('tv_off', 'Not live right now. The tile switches on automatically when the channel goes live.', s);
    if (!r.embeddable) return msg('block', 'This broadcaster doesn’t allow its live stream to be embedded.', s);
    if (r.upcoming) return msg('schedule', `Scheduled: ${esc(r.title)}`, s);
    return embedHtml(s, { muted: true, autoplay: true, domId: `pl-${s.id}`, videoId: r.videoId });
  }
  // Ask the server which video each channel is streaming now; re-render only when that changes.
  async function resolveAll() {
    let changed = false;
    await Promise.all(streams.filter(isChan).map(async (s) => {
      const r = await api.get(`/api/streams/resolve?url=${encodeURIComponent(s.url)}`).catch((e) => ({ error: e.message }));
      const prev = live[s.id];
      if (!prev || prev.videoId !== r.videoId || prev.live !== r.live || !!prev.error !== !!r.error) changed = true;
      live[s.id] = r;
    }));
    if (changed && !disposed) { if (!streams.find((x) => x.id === hero && onAir(x))) hero = (visible().find(onAir) || visible()[0] || {}).id; grid(); }
  }

  function audioStrip() {
    $('#wl-audio').innerHTML = visible().map((s, i) => {
      const a = audio[s.id] || (audio[s.id] = { muted: true, vol: 80 });
      return `<div class="shrink-0 w-24 rounded border ${s.id === hero ? 'border-emerald-400' : 'border-elev'} bg-void p-2 text-center ${s.url ? '' : 'opacity-40'}">
        <div class="font-mono text-[10px] text-sky-300 truncate">${esc(s.country)} · CH ${String(i + 1).padStart(2, '0')}</div>
        <div class="text-[11px] truncate text-slate-400">${esc(s.label)}</div>
        <input type="range" min="0" max="100" value="${a.vol}" data-vol="${esc(s.id)}" class="w-full mt-2 accent-sky-500" ${s.url ? '' : 'disabled'}/>
        <div class="font-mono text-[10.5px] ${a.muted ? 'text-red-400' : 'text-emerald-400'}">${a.muted ? 'MUTED' : a.vol + '%'}</div>
        <div class="flex justify-center gap-1 mt-1">
          <button data-mute="${esc(s.id)}" ${s.url ? '' : 'disabled'} class="msi sm w-7 h-6 rounded ${a.muted ? 'bg-red-900/60 text-red-300' : 'bg-elev'}">${a.muted ? 'volume_off' : 'volume_up'}</button>
          <button data-solo="${esc(s.id)}" ${s.url ? '' : 'disabled'} class="text-[10px] font-mono w-7 h-6 rounded bg-elev hover:bg-sky-700">S</button></div></div>`;
    }).join('');
  }

  function apply(id) { const a = audio[id]; setAudio(document.getElementById(`pl-${id}`), { muted: a.muted, volume: a.vol }); }

  function wire() {
    if (disposed) return;
    const h = streams.find((s) => s.id === hero); const c = h ? h.country : state.country;
    $('#wl-wirehead').textContent = `${def(c).name} — ${def(c).election.name}`;
    $('#wl-wire').innerHTML = state.wire.filter((w) => w.country === c).slice(0, 25).map((w) => `<div class="px-3 py-2 flex gap-3"><span class="font-mono text-[11px] text-sky-400 shrink-0">[${hhmmss(w.ts)}]</span><span class="text-[13px]">${chip(w.kind.toLowerCase(), WIRE_TONE[w.kind])} ${esc(w.text)}</span></div>`).join('') || '<div class="px-3 py-3 text-[12px] text-slate-500">Waiting for wire events…</div>';
  }

  function editor() {
    if (!editing) { $('#wl-editor').innerHTML = ''; return; }
    $('#wl-editor').innerHTML = `<div class="rounded border border-sky-700 bg-panel p-3">
      <div class="flex items-center gap-2 mb-2"><b>Configure feeds</b><span class="text-[12px] text-slate-400">Paste broadcaster live URLs. Only use streams you're allowed to embed. YouTube: paste a channel link (e.g. https://www.youtube.com/@channelstelevision) and the wall finds its current live broadcast automatically, or a single watch / youtu.be link.</span></div>
      <div class="space-y-1.5">${streams.map((s, i) => `<div class="grid grid-cols-12 gap-2 items-center" data-row="${i}">
        <input data-k="label" value="${esc(s.label)}" placeholder="Label" class="col-span-3 text-[12.5px] rounded bg-void border-slate-700 text-slate-200 py-1"/>
        <select data-k="country" class="col-span-1 text-[12.5px] rounded bg-void border-slate-700 text-slate-200 py-1">${state.meta.order.map((c) => `<option ${c === s.country ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <select data-k="type" class="col-span-2 text-[12.5px] rounded bg-void border-slate-700 text-slate-200 py-1">${['youtube', 'iframe', 'video'].map((t) => `<option ${t === s.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <input data-k="url" value="${esc(s.url)}" placeholder="https://…" class="col-span-5 text-[12.5px] rounded bg-void border-slate-700 text-slate-200 py-1"/>
        <button data-del="${i}" class="col-span-1 msi text-slate-500 hover:text-red-400">delete</button></div>`).join('')}</div>
      <div class="flex gap-2 mt-3"><button data-add class="px-3 py-1.5 text-[12px] rounded border border-slate-600">${icon('add', 'sm')} Add slot</button><button data-defaults class="px-3 py-1.5 text-[12px] rounded border border-slate-600">Restore broadcaster defaults</button><span class="flex-1"></span>
        <button data-cancel class="px-3 py-1.5 text-[12px] rounded border border-slate-600">Cancel</button><button data-save class="px-3 py-1.5 text-[12px] rounded bg-sky-600 text-white font-semibold">Save feeds</button></div></div>`;
  }
  function readEditor() {
    return [...el.querySelectorAll('[data-row]')].map((row, i) => {
      const o = { id: streams[i]?.id || `cam${Date.now().toString(36)}${i}` };
      row.querySelectorAll('[data-k]').forEach((inp) => { o[inp.dataset.k] = inp.value.trim(); });
      return o;
    });
  }

  el.addEventListener('click', async (e) => {
    const t = (s) => e.target.closest(s);
    if (t('[data-layout]')) { layout = t('[data-layout]').dataset.layout; grid(); return; }
    if (t('[data-wf]')) { filter = t('[data-wf]').dataset.wf; grid(); return; }
    if (t('[data-hero]')) { hero = t('[data-hero]').dataset.hero; grid(); return; }
    if (t('[data-fs]')) { $('#wl-grid').requestFullscreen?.(); return; }
    if (t('[data-muteall]')) { for (const id in audio) { audio[id].muted = true; apply(id); } audioStrip(); grid(); return; }
    if (t('[data-mute]')) { const id = t('[data-mute]').dataset.mute; audio[id].muted = !audio[id].muted; apply(id); audioStrip(); return; }
    if (t('[data-solo]')) { const id = t('[data-solo]').dataset.solo; for (const k in audio) { audio[k].muted = k !== id; apply(k); } if (layout === 'focus' && hero !== id) { hero = id; grid(); setTimeout(() => apply(id), 1500); } else audioStrip(); return; }
    if (t('[data-edit]')) { if (!state.meta.admin) { toast('Configuring feeds needs moderator access (this computer or token)', 'red'); return; } editing = !editing; editor(); return; }
    if (t('[data-defaults]')) { streams = await api.get('/api/streams/defaults'); editor(); return; }
    if (t('[data-cancel]')) { editing = false; editor(); return; }
    if (t('[data-add]')) { streams = readEditor(); streams.push({ id: `cam${streams.length + 1}-${Date.now().toString(36)}`, label: '', country: state.country, type: 'youtube', url: '' }); editor(); return; }
    if (t('[data-del]')) { streams = readEditor(); streams.splice(+t('[data-del]').dataset.del, 1); editor(); return; }
    if (t('[data-save]')) {
      const next = readEditor();
      const bad = next.find((s) => s.url && s.type === 'youtube' && youtubeEmbed(s.url).error);
      if (bad) { toast(`${bad.label || bad.id}: ${youtubeEmbed(bad.url).error}`, 'red'); return; }
      try { streams = await api.put('/api/streams', next); editing = false; editor(); grid(); resolveAll(); toast('Feeds saved', 'green'); } catch (err) { toast(err.message, 'red'); }
      return;
    }
    const tileEl = t('[data-tile]'); if (tileEl && layout === 'focus' && tileEl.dataset.tile !== hero && !t('iframe')) { hero = tileEl.dataset.tile; grid(); }
  });
  el.addEventListener('input', (e) => { const v = e.target.closest('[data-vol]'); if (v) { const a = audio[v.dataset.vol]; a.vol = +v.value; if (a.muted) a.muted = false; apply(v.dataset.vol); } });
  el.addEventListener('change', (e) => { if (e.target.closest('[data-vol]')) audioStrip(); });

  api.get('/api/streams').then((s) => { streams = s; hero = (s.find((x) => x.url && x.country === state.country) || s.find((x) => x.url) || s[0] || {}).id; grid(); resolveAll(); });
  const recheck = setInterval(() => { if (!document.hidden) resolveAll(); }, 180000);
  return { update(kind) { if (kind === 'tick') wire(); }, unmount() { disposed = true; clearInterval(recheck); el.classList.remove('wall'); } };
}
