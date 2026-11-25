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

// Lightbox
const box = document.getElementById('lightbox');
const boxImg = box.querySelector('img');
document.querySelectorAll('.tile').forEach(t => t.addEventListener('click', () => {
  boxImg.src = t.dataset.src;
  boxImg.alt = t.dataset.alt;
  box.showModal();
}));
box.querySelector('.close').addEventListener('click', () => box.close());
box.addEventListener('click', e => { if (e.target === box) box.close(); });

// Only one reel plays at a time
const vids = document.querySelectorAll('.reels video');
vids.forEach(v => v.addEventListener('play', () => vids.forEach(o => { if (o !== v) o.pause(); })));

// Contact form (Phase 2 will connect this to the database / email)
const FORM_ENDPOINT = ''; // e.g. a Formspree or Supabase function URL
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
  if (!FORM_ENDPOINT) {
    msg.textContent = 'Form is not connected yet. It will go live in the next phase.';
    return;
  }
  try {
    const r = await fetch(FORM_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    if (!r.ok) throw new Error();
    msg.classList.add('ok');
    msg.textContent = 'Thank you! We will get back to you soon.';
    form.reset();
  } catch {
    msg.textContent = 'Something went wrong. Please try again.';
  }
});
