// First-party crowd report form (modal). Reports land as UNVERIFIED and only
// enter the official ledger after a moderator verifies them.
import { api, esc, toast, state, def } from '../core.js';

const CATS = ['Queue / delay', 'Materials missing', 'Equipment fault', 'Intimidation / disruption', 'Result sheet / count concern', 'Accessibility', 'Other'];

export function openReportModal(nodeId, path) {
  const wrap = document.createElement('div');
  wrap.className = 'fixed inset-0 z-[90] bg-slate-900/40 flex items-center justify-center p-4';
  wrap.innerHTML = `
    <form class="card w-full max-w-lg p-5 space-y-3 bg-white" style="border-color:#94a3b8">
      <div class="flex items-center justify-between"><h3 class="font-bold text-lg">Submit a field report</h3><button type="button" data-x class="msi">close</button></div>
      <p class="text-[12.5px] text-slate-600">Reports are shown as <b>unverified</b> until a moderator checks them. Do not include personal data about voters or officials.</p>
      <div><div class="lbl mb-1">Location</div>
        <input name="q" placeholder="Search a ${esc(def(state.country).levels.slice(1).join(', ').toLowerCase())}…" class="w-full rounded border-slate-300 text-sm" value="${esc(path || '')}" autocomplete="off"/>
        <input type="hidden" name="nodeId" value="${esc(nodeId || '')}"/>
        <div data-res class="mt-1 max-h-40 overflow-y-auto scroll-thin"></div></div>
      <div><div class="lbl mb-1">Category</div><select name="category" class="w-full rounded border-slate-300 text-sm">${CATS.map((c) => `<option>${c}</option>`).join('')}</select></div>
      <div><div class="lbl mb-1">What did you see?</div><textarea name="text" rows="4" required minlength="10" maxlength="1000" class="w-full rounded border-slate-300 text-sm" placeholder="Time, what happened, how many people affected…"></textarea></div>
      <div><div class="lbl mb-1">Your name or alias (optional)</div><input name="reporter" maxlength="60" class="w-full rounded border-slate-300 text-sm"/></div>
      <div class="flex justify-end gap-2 pt-1"><button type="button" data-x class="px-3 py-1.5 rounded border border-slate-300 text-sm">Cancel</button><button class="px-3 py-1.5 rounded bg-sky-700 text-white text-sm font-semibold">Submit report</button></div>
    </form>`;
  document.body.appendChild(wrap);
  const f = wrap.querySelector('form'); const res = wrap.querySelector('[data-res]');
  const close = () => wrap.remove();
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-x]')) close(); });
  let t;
  f.q.addEventListener('input', () => {
    clearTimeout(t); f.nodeId.value = '';
    t = setTimeout(async () => {
      if (f.q.value.length < 2) { res.innerHTML = ''; return; }
      const r = await api.get(`/api/search?country=${state.country}&q=${encodeURIComponent(f.q.value)}`);
      res.innerHTML = r.map((x) => `<button type="button" data-pick="${esc(x.id)}" data-label="${esc(x.path + ' › ' + x.name)}" class="block w-full text-left px-2 py-1 text-[12.5px] hover:bg-sky-50"><b>${esc(x.name)}</b> <span class="text-slate-500">${esc(x.levelName)} · ${esc(x.path)}</span></button>`).join('') || '<div class="text-[12px] text-slate-400 px-2">No match</div>';
    }, 200);
  });
  res.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (!b) return; f.nodeId.value = b.dataset.pick; f.q.value = b.dataset.label; res.innerHTML = ''; });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.nodeId.value) { toast('Pick a location from the search results', 'red'); return; }
    try { await api.post('/api/reports', { nodeId: f.nodeId.value, category: f.category.value, text: f.text.value, reporter: f.reporter.value }); toast('Report submitted — awaiting moderation', 'green'); close(); }
    catch (err) { toast(err.message, 'red'); }
  });
}
