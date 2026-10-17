-- Nature Radar community feed: run this once in your Supabase project
-- (Dashboard → SQL Editor → New query → paste → Run). Safe to run again.
--
-- What it allows anyone with your app to do:
--   • read posts (but never the secret that proves who made a post)
--   • add a post, and upload its photo (JPEG, max 2 MB) to the public "sightings" bucket
--   • like / unlike a post
--   • delete a post only if they made it (the app keeps a secret token on the device that made it)

create table if not exists public.posts (
  id            uuid primary key,
  created_at    timestamptz not null default now(),
  author_name   text not null check (char_length(author_name) between 1 and 40),
  author_avatar text not null default '🦉' check (char_length(author_avatar) <= 8),
  author_color  text not null default '#2f6b3f' check (author_color ~ '^#[0-9a-fA-F]{6}$'),
  taxon_id      integer not null check (taxon_id > 0),
  taxon_name    text not null check (char_length(taxon_name) <= 120),
  common_name   text check (char_length(common_name) <= 120),
  iconic        text check (char_length(iconic) <= 40),
  tier          text not null check (tier in ('veryrare', 'rare', 'uncommon', 'common', 'unranked', 'unrated')),
  rarity        real check (rarity between -1 and 1),
  place         text check (char_length(place) <= 80),
  lat           double precision check (lat between -90 and 90),
  lng           double precision check (lng between -180 and 180),
  caption       text check (char_length(caption) <= 280),
  photo_path    text check (photo_path ~ '^posts/[0-9a-f-]{36}\.jpg$'),
  likes         integer not null default 0 check (likes >= 0),
  owner_hash    text not null check (owner_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);

alter table public.posts enable row level security;

-- Column-level access: readers can't see owner_hash; writers can't set likes or created_at.
revoke all on public.posts from anon, authenticated;
grant select (id, created_at, author_name, author_avatar, author_color, taxon_id, taxon_name, common_name,
              iconic, tier, rarity, place, lat, lng, caption, photo_path, likes)
  on public.posts to anon, authenticated;
grant insert (id, author_name, author_avatar, author_color, taxon_id, taxon_name, common_name,
              iconic, tier, rarity, place, lat, lng, caption, photo_path, owner_hash)
  on public.posts to anon, authenticated;

drop policy if exists "posts are public" on public.posts;
create policy "posts are public" on public.posts for select to anon, authenticated using (true);

drop policy if exists "anyone can post" on public.posts;
create policy "anyone can post" on public.posts for insert to anon, authenticated with check (likes = 0);

-- Likes: +1 or -1, never below zero.
create or replace function public.like_post(p_id uuid, p_delta integer)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.posts
     set likes = greatest(0, likes + sign(p_delta)::integer)
   where id = p_id
  returning likes;
$$;

-- Delete: only works with the secret token whose SHA-256 was stored when the post was made.
create or replace function public.delete_post(p_id uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.posts
   where id = p_id
     and owner_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.like_post(uuid, integer) from public;
revoke all on function public.delete_post(uuid, text) from public;
grant execute on function public.like_post(uuid, integer) to anon, authenticated;
grant execute on function public.delete_post(uuid, text) to anon, authenticated;

-- Photo storage: a public bucket; anyone can add a JPEG under posts/<uuid>.jpg, nobody can overwrite.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sightings', 'sightings', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

drop policy if exists "anyone can upload sighting photos" on storage.objects;
create policy "anyone can upload sighting photos" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'sightings' and name ~ '^posts/[0-9a-f-]{36}\.jpg$');
