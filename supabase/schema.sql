create extension if not exists pgcrypto;
create table if not exists public.rpg_entries (
    id uuid primary key default gen_random_uuid(),
    source_type text not null check (source_type in ('srd', 'gutenberg')),
    source_title text not null,
    source_author text,
    source_url text,
    content text not null,
    sentence text not null,
    content_tsv tsvector generated always as (to_tsvector('english', content)) stored,
    created_at timestamptz not null default now()
);
alter table public.rpg_entries drop constraint if exists rpg_entries_source_type_check;
update public.rpg_entries
set source_type = 'srd'
where source_type = 'dnd';
alter table public.rpg_entries
add constraint rpg_entries_source_type_check check (source_type in ('srd', 'gutenberg'));
create index if not exists rpg_entries_content_tsv_idx on public.rpg_entries using gin (content_tsv);
create table if not exists public.search_cache (
    id uuid primary key default gen_random_uuid(),
    query text not null unique,
    science_result jsonb,
    fantasy_result jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create table if not exists public.saved_items (
    id uuid primary key default gen_random_uuid(),
    device_id text not null,
    query text not null,
    science_result jsonb not null,
    fantasy_result jsonb not null,
    created_at timestamptz not null default now()
);
alter table public.rpg_entries enable row level security;
alter table public.search_cache enable row level security;
alter table public.saved_items enable row level security;
create policy "Public can read RPG entries" on public.rpg_entries for
select to anon,
    authenticated using (true);
create policy "Public can insert RPG entries during ingestion" on public.rpg_entries for
insert to anon,
    authenticated with check (true);
create policy "Public can read search cache" on public.search_cache for
select to anon,
    authenticated using (true);
create policy "Public can insert search cache" on public.search_cache for
insert to anon,
    authenticated with check (true);
create policy "Public can update search cache" on public.search_cache for
update to anon,
    authenticated using (true) with check (true);
create policy "Public can insert saved items" on public.saved_items for
insert to anon,
    authenticated with check (true);
create policy "Public can read saved items by device" on public.saved_items for
select to anon,
    authenticated using (true);