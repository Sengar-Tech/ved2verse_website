-- Verse2ved: run this once in Supabase → SQL Editor → New query → Run.

-- ========== TABLES ==========
create table if not exists public.media_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('photo','video','instagram','youtube')),
  title text not null default '',          -- description / alt text
  label text not null default '',          -- small tag shown on gallery tiles
  url text not null,                       -- file URL or Instagram/YouTube link
  sort int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  email text not null,
  type text,
  message text,
  status text not null default 'new' check (status in ('new','contacted','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  contact_name text,
  email text,
  phone text,
  status text not null default 'lead' check (status in ('lead','talking','negotiating','confirmed','delivered','paid','lost')),
  deliverable text,
  deadline date,
  value numeric,
  notes text,
  created_at timestamptz not null default now()
);

-- ========== ROW LEVEL SECURITY ==========
alter table public.media_items enable row level security;
alter table public.inquiries   enable row level security;
alter table public.clients     enable row level security;

drop policy if exists "public reads published media" on public.media_items;
create policy "public reads published media" on public.media_items
  for select to anon using (published = true);

drop policy if exists "admin manages media" on public.media_items;
create policy "admin manages media" on public.media_items
  for all to authenticated using (true) with check (true);

drop policy if exists "anyone can send inquiry" on public.inquiries;
create policy "anyone can send inquiry" on public.inquiries
  for insert to anon
  with check (
    status = 'new'
    and char_length(brand) between 1 and 200
    and char_length(email) between 3 and 200
    and char_length(coalesce(message,'')) <= 4000
  );

drop policy if exists "admin manages inquiries" on public.inquiries;
create policy "admin manages inquiries" on public.inquiries
  for all to authenticated using (true) with check (true);

drop policy if exists "admin manages clients" on public.clients;
create policy "admin manages clients" on public.clients
  for all to authenticated using (true) with check (true);

-- ========== STORAGE (photos and videos you upload) ==========
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do nothing;

drop policy if exists "admin uploads media" on storage.objects;
create policy "admin uploads media" on storage.objects
  for all to authenticated
  using (bucket_id = 'media') with check (bucket_id = 'media');

-- ========== STARTER CONTENT (the files already in the repo) ==========
insert into public.media_items (kind, title, label, url, sort)
select * from (values
  ('photo','Verse2ved dressed as Ganpati with modak and a toy mouse','Festive','assets/ganpati.jpg',1),
  ('photo','Verse2ved looking sideways with sunglasses on the chin','Cool kid','assets/cool-2.jpg',2),
  ('photo','Verse2ved in a bow tie and suspenders','Dapper','assets/dapper.jpg',3),
  ('photo','Verse2ved dressed as little Krishna in yellow','Janmashtami','assets/krishna.jpg',4),
  ('photo','Verse2ved in a red hoodie holding up sunglasses','Streetwear','assets/cool-1.jpg',5),
  ('photo','Verse2ved crawling in a cream shirt','Everyday','assets/crawl.jpg',6),
  ('video','Verse2ved reel 1','','assets/reel-1.mp4',7),
  ('video','Verse2ved reel 2','','assets/reel-2.mp4',8),
  ('video','Verse2ved reel 3','','assets/reel-3.mp4',9),
  ('video','Verse2ved reel 4','','assets/reel-4.mp4',10)
) as v(kind,title,label,url,sort)
where not exists (select 1 from public.media_items);
