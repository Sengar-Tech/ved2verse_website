// Mobile menu
const btn = document.querySelector('.menu-btn');
const links = document.getElementById('links');
btn.addEventListener('click', () => {
  const open = links.classList.toggle('open');
  btn.setAttribute('aria-expanded', open);
});
links.addEventListener('click', e => {
  if (e.target.closest('a')) { links.classList.remove('open'); btn.setAttribute('aria-expanded', false); }
});

// Side-scroll rails: arrows, progress bar, keyboard scrolling
const ARROW = d => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
function initRail(scroller, label) {
  const rail = document.createElement('div');
  rail.className = 'rail';
  scroller.parentNode.insertBefore(rail, scroller);
  scroller.tabIndex = 0;
  scroller.setAttribute('role', 'region');
  scroller.setAttribute('aria-label', label + ' (scroll sideways)');
  const mkBtn = (cls, text, path) => {
    const b = document.createElement('button');
    b.className = 'rail-btn ' + cls; b.type = 'button';
    b.setAttribute('aria-label', text); b.innerHTML = ARROW(path);
    return b;
  };
  const prev = mkBtn('rail-prev', 'Previous', 'M15 5l-7 7 7 7');
  const next = mkBtn('rail-next', 'Next', 'M9 5l7 7-7 7');
  const bar = document.createElement('div');
  bar.className = 'rail-progress'; bar.innerHTML = '<span></span>';
  rail.append(prev, scroller, next, bar);
  const fill = bar.firstChild;
  const step = () => Math.max(scroller.clientWidth * 0.8, 200);
  const update = () => {
    const max = scroller.scrollWidth - scroller.clientWidth;
    prev.disabled = scroller.scrollLeft < 8;
    next.disabled = scroller.scrollLeft > max - 8;
    bar.hidden = max < 8;
    fill.style.transform = `scaleX(${Math.min(1, (scroller.scrollLeft + scroller.clientWidth) / scroller.scrollWidth)})`;
  };
  prev.addEventListener('click', () => scroller.scrollBy({ left: -step(), behavior: 'smooth' }));
  next.addEventListener('click', () => scroller.scrollBy({ left: step(), behavior: 'smooth' }));
  scroller.addEventListener('scroll', update, { passive: true });
  scroller.addEventListener('keydown', e => {
    if (e.target !== scroller) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev.click(); }
  });
  new MutationObserver(update).observe(scroller, { childList: true });
  new ResizeObserver(update).observe(scroller);
  scroller.addEventListener('load', update, true);
  update();
}
initRail(document.querySelector('#gallery .grid'), 'Photo gallery');
initRail(document.querySelector('.reels'), 'Reels');

// Pause reels that scroll out of view
const pauser = new IntersectionObserver(es => es.forEach(en => {
  if (!en.isIntersecting && en.target.tagName === 'VIDEO') en.target.pause();
}), { threshold: 0.25 });
const watchVideos = () => document.querySelectorAll('.reels video').forEach(v => pauser.observe(v));
watchVideos();

const CFG = window.V2V || {};
const API = CFG.SUPABASE_URL ? CFG.SUPABASE_URL + '/rest/v1/' : null;
const apiHeaders = { apikey: CFG.SUPABASE_KEY, 'Content-Type': 'application/json' };

// Lightbox
const box = document.getElementById('lightbox');
const boxImg = box.querySelector('img');
function bindTile(t) {
  t.addEventListener('click', () => {
    boxImg.src = t.dataset.src;
    boxImg.alt = t.dataset.alt;
    box.showModal();
  });
}
document.querySelectorAll('.tile').forEach(bindTile);
box.querySelector('.close').addEventListener('click', () => box.close());
box.addEventListener('click', e => { if (e.target === box) box.close(); });

// Only one reel plays at a time
function bindVideos() {
  const vids = document.querySelectorAll('.reels video');
  vids.forEach(v => v.addEventListener('play', () => vids.forEach(o => { if (o !== v) o.pause(); })));
}
bindVideos();

// Load gallery + reels from the database (static markup stays as a fallback)
function embedUrl(item) {
  if (item.kind === 'youtube') {
    const m = item.url.match(/(?:youtu\.be\/|[?&]v=|shorts\/|embed\/)([\w-]{11})/);
    return m && 'https://www.youtube-nocookie.com/embed/' + m[1];
  }
  if (item.kind === 'instagram') {
    const m = item.url.match(/instagram\.com\/(p|reel|tv)\/([\w-]+)/i);
    return m && `https://www.instagram.com/${m[1].toLowerCase()}/${m[2]}/embed`;
  }
  return null;
}
function mk(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}
async function loadMedia() {
  if (!API) return;
  try {
    const r = await fetch(API + 'media_items?select=*&published=eq.true&order=sort.asc', { headers: apiHeaders });
    if (!r.ok) return;
    const items = await r.json();
    if (!items.length) return;

    const photos = items.filter(i => i.kind === 'photo');
    const reels = items.filter(i => i.kind !== 'photo');

    if (photos.length) {
      document.querySelector('#gallery .grid').replaceChildren(...photos.map(p => {
        const btn = mk('button', { className: 'tile' },
          mk('img', { src: p.url, alt: p.title, loading: 'lazy', width: 600, height: 800 }),
          ...(p.label ? [mk('span', { textContent: p.label })] : []));
        btn.dataset.src = p.url; btn.dataset.alt = p.title;
        bindTile(btn);
        return mk('li', {}, btn);
      }));
    }
    if (reels.length) {
      document.querySelector('.reels').replaceChildren(...reels.map(v => {
        let node;
        if (v.kind === 'video') {
          node = mk('video', { controls: true, preload: 'metadata', playsInline: true, src: v.url + '#t=0.5' });
          node.setAttribute('aria-label', v.title || 'Verse2ved reel');
        } else {
          const src = embedUrl(v);
          if (!src) return null;
          node = mk('iframe', { src, loading: 'lazy', title: v.title || 'Verse2ved reel', allowFullscreen: true });
          node.setAttribute('allow', 'encrypted-media; picture-in-picture');
          node.className = 'embed';
        }
        return mk('li', {}, node);
      }).filter(Boolean));
      bindVideos();
      watchVideos();
    }
  } catch (err) { console.warn('Using built-in content', err); }
}
loadMedia();

// Contact form -> saved in the database inquiries table
const form = document.getElementById('collab-form');
const msg = document.getElementById('form-msg');
form.addEventListener('submit', async e => {
  e.preventDefault();
  msg.classList.remove('ok');
  const bad = [...form.querySelectorAll('[required]')].filter(f => !f.value.trim() || (f.type === 'email' && !f.checkValidity()));
  form.querySelectorAll('[required]').forEach(f => f.removeAttribute('aria-invalid'));
  if (bad.length) {
    bad.forEach(f => f.setAttribute('aria-invalid', 'true'));
    msg.textContent = 'Please fill in the highlighted fields with valid details.';
    bad[0].focus();
    return;
  }
  try {
    const d = Object.fromEntries(new FormData(form));
    const r = await fetch(API + 'inquiries', {
      method: 'POST',
      headers: { ...apiHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ brand: d.brand.trim(), email: d.email.trim(), type: d.type, message: d.msg.trim() })
    });
    if (!r.ok) throw new Error();
    msg.classList.add('ok');
    msg.textContent = 'Thank you! We will get back to you soon.';
    form.reset();
  } catch {
    msg.textContent = 'Something went wrong. Please try again.';
  }
});
