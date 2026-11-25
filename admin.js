const { SUPABASE_URL, SUPABASE_KEY } = window.V2V;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = s => document.querySelector(s);
const STORAGE_MARK = '/storage/v1/object/public/media/';

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c);
  return e;
}
let toastTimer;
function toast(text, err = false) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.toggle('err', err);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.textContent = ''), 5000);
}
const fail = (e, what) => { console.error(e); toast(`${what}: ${e.message || e}`, true); };

// ---------- auth ----------
sb.auth.onAuthStateChange((_e, session) => {
  $('#login').hidden = !!session;
  $('#app').hidden = !session;
  $('#logout').hidden = !session;
  if (session) loadAll();
});
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('#login-msg').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: $('#l-email').value, password: $('#l-pass').value });
  if (error) $('#login-msg').textContent = 'Login failed. Check your email and password.';
});
$('#logout').addEventListener('click', () => sb.auth.signOut());

// ---------- tabs ----------
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
  ['media', 'inquiries', 'clients'].forEach(t => ($(`#tab-${t}`).hidden = t !== b.dataset.tab));
}));
const loadAll = () => { loadMedia(); loadInquiries(); loadClients(); };

// ---------- media ----------
function detectKind(url) {
  if (/instagram\.com\/(p|reel|tv)\//i.test(url)) return 'instagram';
  if (/(youtu\.be\/|youtube\.com\/)/i.test(url)) return 'youtube';
  return null;
}
async function nextSort() {
  const { data } = await sb.from('media_items').select('sort').order('sort', { ascending: false }).limit(1);
  return (data?.[0]?.sort ?? 0) + 1;
}
$('#upload-form').addEventListener('submit', async e => {
  e.preventDefault();
  const file = $('#u-file').files[0];
  if (!file) return;
  const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'photo' : null;
  if (!kind) return toast('Please choose an image or video file.', true);
  if (file.size > 50 * 1024 * 1024) return toast('File is over 50 MB.', true);
  const btn = e.submitter; btn.disabled = true; toast('Uploading...');
  try {
    const path = `${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    const up = await sb.storage.from('media').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
    if (up.error) throw up.error;
    const url = sb.storage.from('media').getPublicUrl(path).data.publicUrl;
    const ins = await sb.from('media_items').insert({
      kind, url, title: $('#u-title').value.trim(), label: kind === 'photo' ? $('#u-label').value.trim() : '', sort: await nextSort()
    });
    if (ins.error) throw ins.error;
    e.target.reset(); toast('Uploaded and published.'); loadMedia();
  } catch (err) { fail(err, 'Upload failed'); }
  btn.disabled = false;
});
$('#link-form').addEventListener('submit', async e => {
  e.preventDefault();
  const url = $('#k-url').value.trim();
  const kind = detectKind(url);
  if (!kind) return toast('Only Instagram post/reel and YouTube links are supported.', true);
  const { error } = await sb.from('media_items').insert({ kind, url, title: $('#k-title').value.trim(), sort: await nextSort() });
  if (error) return fail(error, 'Could not add link');
  e.target.reset(); toast('Link added.'); loadMedia();
});

async function loadMedia() {
  const { data, error } = await sb.from('media_items').select('*').order('sort');
  if (error) return fail(error, 'Could not load media');
  const list = $('#media-list');
  list.replaceChildren(...data.map((m, i) => {
    const thumb = m.kind === 'photo'
      ? h('img', { class: 'thumb', src: m.url, alt: '' })
      : h('div', { class: 'thumb' }, m.kind);
    const swap = async other => {
      if (!other) return;
      const r = await Promise.all([
        sb.from('media_items').update({ sort: other.sort }).eq('id', m.id),
        sb.from('media_items').update({ sort: m.sort }).eq('id', other.id)
      ]);
      if (r.some(x => x.error)) return fail(r.find(x => x.error).error, 'Reorder failed');
      loadMedia();
    };
    return h('li', { class: 'item' + (m.published ? '' : ' off') },
      thumb,
      h('div', { class: 'meta' }, h('strong', {}, m.title || m.url), h('small', {}, `${m.kind}${m.label ? ' · ' + m.label : ''}${m.published ? '' : ' · hidden'}`)),
      h('div', { class: 'acts' },
        h('button', { class: 'mini', 'aria-label': 'Move up', disabled: i === 0, onclick: () => swap(data[i - 1]) }, '↑'),
        h('button', { class: 'mini', 'aria-label': 'Move down', disabled: i === data.length - 1, onclick: () => swap(data[i + 1]) }, '↓'),
        h('button', { class: 'mini', onclick: async () => {
          const r = await sb.from('media_items').update({ published: !m.published }).eq('id', m.id);
          if (r.error) return fail(r.error, 'Update failed'); loadMedia();
        } }, m.published ? 'Hide' : 'Show'),
        h('button', { class: 'mini danger', onclick: async () => {
          if (!confirm('Delete this item permanently?')) return;
          const r = await sb.from('media_items').delete().eq('id', m.id);
          if (r.error) return fail(r.error, 'Delete failed');
          const at = m.url.indexOf(STORAGE_MARK);
          if (at > -1) await sb.storage.from('media').remove([decodeURIComponent(m.url.slice(at + STORAGE_MARK.length))]);
          loadMedia();
        } }, 'Delete')
      ));
  }));
  if (!data.length) list.append(h('li', {}, 'Nothing here yet. Upload your first photo above.'));
}

// ---------- inquiries ----------
const fmtDate = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
function statusSelect(options, value, onchange, label) {
  const s = h('select', { 'aria-label': label, onchange: () => onchange(s.value) }, options.map(o => h('option', { value: o }, o)));
  s.value = value;
  return s;
}
async function loadInquiries() {
  const { data, error } = await sb.from('inquiries').select('*').order('created_at', { ascending: false });
  if (error) return fail(error, 'Could not load inquiries');
  const n = data.filter(i => i.status === 'new').length;
  $('#new-count').hidden = !n; $('#new-count').textContent = n;
  const list = $('#inq-list');
  list.replaceChildren(...data.map(i => h('li', { class: 'card' },
    h('div', { class: 'top' },
      h('strong', {}, i.brand),
      statusSelect(['new', 'contacted', 'closed'], i.status, async v => {
        const r = await sb.from('inquiries').update({ status: v }).eq('id', i.id);
        if (r.error) fail(r.error, 'Update failed'); else loadInquiries();
      }, 'Inquiry status')),
    h('small', {}, `${fmtDate(i.created_at)} · ${i.type || 'n/a'}`),
    h('p', {}, h('a', { href: 'mailto:' + i.email }, i.email)),
    h('p', {}, i.message || ''),
    h('div', { class: 'acts' },
      h('button', { class: 'mini', onclick: async () => {
        const r = await sb.from('clients').insert({ brand: i.brand, email: i.email, notes: `${i.type || ''}: ${i.message || ''}`.trim() });
        if (r.error) return fail(r.error, 'Could not add client');
        toast('Added to clients.'); loadClients();
      } }, 'Add to clients'),
      h('button', { class: 'mini danger', onclick: async () => {
        if (!confirm('Delete this inquiry?')) return;
        const r = await sb.from('inquiries').delete().eq('id', i.id);
        if (r.error) fail(r.error, 'Delete failed'); else loadInquiries();
      } }, 'Delete'))
  )));
  if (!data.length) list.append(h('li', {}, 'No inquiries yet.'));
}

// ---------- clients ----------
const STAGES = ['lead', 'talking', 'negotiating', 'confirmed', 'delivered', 'paid', 'lost'];
$('#client-form').addEventListener('submit', async e => {
  e.preventDefault();
  const v = id => $(id).value.trim() || null;
  const { error } = await sb.from('clients').insert({
    brand: $('#c-brand').value.trim(), contact_name: v('#c-contact'), email: v('#c-email'), phone: v('#c-phone'),
    deliverable: v('#c-deliv'), deadline: v('#c-deadline'), value: v('#c-value')
  });
  if (error) return fail(error, 'Could not add client');
  e.target.reset(); toast('Client added.'); loadClients();
});
async function loadClients() {
  const { data, error } = await sb.from('clients').select('*').order('created_at', { ascending: false });
  if (error) return fail(error, 'Could not load clients');
  const list = $('#client-list');
  list.replaceChildren(...data.map(c => {
    const notes = h('textarea', { rows: 2, 'aria-label': 'Notes for ' + c.brand, placeholder: 'Notes...' });
    notes.value = c.notes || '';
    notes.addEventListener('blur', async () => {
      if (notes.value === (c.notes || '')) return;
      const r = await sb.from('clients').update({ notes: notes.value }).eq('id', c.id);
      if (r.error) fail(r.error, 'Save failed'); else { c.notes = notes.value; toast('Notes saved.'); }
    });
    const bits = [c.contact_name, c.email, c.phone, c.deliverable, c.deadline && 'Due ' + c.deadline, c.value != null && '₹' + c.value].filter(Boolean);
    return h('li', { class: 'card' },
      h('div', { class: 'top' },
        h('strong', {}, c.brand),
        statusSelect(STAGES, c.status, async v => {
          const r = await sb.from('clients').update({ status: v }).eq('id', c.id);
          if (r.error) fail(r.error, 'Update failed');
        }, 'Stage for ' + c.brand)),
      h('small', {}, bits.join(' · ') || 'No details yet'),
      notes,
      h('div', { class: 'acts' }, h('button', { class: 'mini danger', onclick: async () => {
        if (!confirm('Delete this client?')) return;
        const r = await sb.from('clients').delete().eq('id', c.id);
        if (r.error) fail(r.error, 'Delete failed'); else loadClients();
      } }, 'Delete')));
  }));
  if (!data.length) list.append(h('li', {}, 'No clients yet.'));
}
