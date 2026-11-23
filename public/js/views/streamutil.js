// Stream embedding helpers. Supports YouTube (live or VOD), any embeddable
// iframe player URL, and direct video files (MP4; HLS .m3u8 plays natively
// in Safari only). YouTube volume/mute is controlled via the IFrame API
// postMessage protocol (enablejsapi=1), so no external script is required.
import { esc } from '../core.js';

export function youtubeEmbed(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else if (/^\/(live|embed|shorts)\//.test(u.pathname)) id = u.pathname.split('/')[2];
      else if (u.pathname.startsWith('/channel/')) return { src: `https://www.youtube.com/embed/live_stream?channel=${u.pathname.split('/')[2]}` };
      else if (u.pathname.startsWith('/embed/live_stream')) return { src: url };
      else if (/^\/(@|c\/|user\/)/.test(u.pathname)) return { channel: true };
    }
    if (id && /^[\w-]{6,}$/.test(id)) return { src: `https://www.youtube.com/embed/${id}` };
    return { error: 'Unrecognised YouTube URL.' };
  } catch { return { error: 'Invalid URL.' }; }
}

// A YouTube channel link (@handle, /channel/UC…, /c/…) — the server looks up
// which video is live on it right now.
export function isChannelUrl(url) {
  try { const u = new URL(url); return /youtube\.com$/.test(u.hostname) && /^\/(@|channel\/|c\/|user\/)/.test(u.pathname); } catch { return false; }
}

export function embedHtml(s, { muted = true, autoplay = true, domId = '', videoId = null } = {}) {
  if (!s || !s.url) return '';
  if (videoId) s = { ...s, url: `https://www.youtube.com/watch?v=${videoId}` };
  if (s.type === 'video') {
    return `<video ${domId ? `id="${domId}"` : ''} data-stream="${esc(s.id)}" src="${esc(s.url)}" class="w-full h-full object-contain bg-black" ${autoplay ? 'autoplay' : ''} ${muted ? 'muted' : ''} playsinline controls></video>`;
  }
  let src = s.url; let err = null;
  if (s.type === 'youtube') {
    const y = youtubeEmbed(s.url); if (y.error) err = y.error; else if (y.channel) err = 'Looking up the live broadcast…'; else {
      const sep = y.src.includes('?') ? '&' : '?';
      src = `${y.src}${sep}enablejsapi=1&playsinline=1&rel=0&autoplay=${autoplay ? 1 : 0}&mute=${muted ? 1 : 0}&origin=${encodeURIComponent(location.origin)}`;
    }
  }
  if (err) return `<div class="w-full h-full flex items-center justify-center text-amber-300 text-sm p-4 text-center">${esc(err)}</div>`;
  return `<iframe ${domId ? `id="${domId}"` : ''} data-stream="${esc(s.id)}" data-type="${esc(s.type)}" src="${esc(src)}" class="w-full h-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="${esc(s.label)}"></iframe>`;
}

// Mute/unmute/volume for a mounted player element
export function setAudio(el, { muted, volume }) {
  if (!el) return;
  if (el.tagName === 'VIDEO') { if (muted != null) el.muted = muted; if (volume != null) el.volume = volume / 100; return; }
  if (el.dataset.type !== 'youtube' || !el.contentWindow) return; // generic iframes can't be controlled
  const cmd = (func, args = []) => el.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  if (muted === true) cmd('mute'); if (muted === false) cmd('unMute');
  if (volume != null) cmd('setVolume', [volume]);
}
