-- ABYSS BROWSER — accounts, cloud snapshot, uploaded apps, and optional MP4 storage
-- Run once in Supabase Dashboard > SQL Editor.
-- Safe to re-run: tables, buckets, and policies are created/updated idempotently.

create table if not exists public.abyss_user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.abyss_user_data enable row level security;
drop policy if exists "Abyss users read own snapshot" on public.abyss_user_data;
create policy "Abyss users read own snapshot" on public.abyss_user_data for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Abyss users insert own snapshot" on public.abyss_user_data;
create policy "Abyss users insert own snapshot" on public.abyss_user_data for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Abyss users update own snapshot" on public.abyss_user_data;
create policy "Abyss users update own snapshot" on public.abyss_user_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.abyss_user_data to authenticated;

create table if not exists public.abyss_app_files (
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null,
  file_name text not null,
  storage_path text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, app_id)
);


-- Additive repair for partially-created Abyss tables. Existing rows are retained.
alter table public.abyss_user_data
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();
alter table public.abyss_app_files
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists app_id text,
  add column if not exists file_name text,
  add column if not exists storage_path text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.abyss_app_files enable row level security;
drop policy if exists "Abyss users read own app metadata" on public.abyss_app_files;
create policy "Abyss users read own app metadata" on public.abyss_app_files for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Abyss users insert own app metadata" on public.abyss_app_files;
create policy "Abyss users insert own app metadata" on public.abyss_app_files for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Abyss users update own app metadata" on public.abyss_app_files;
create policy "Abyss users update own app metadata" on public.abyss_app_files for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.abyss_app_files to authenticated;

do $$ begin
  begin create unique index if not exists abyss_app_files_user_app_uidx on public.abyss_app_files(user_id,app_id); exception when unique_violation then raise notice 'abyss_app_files has duplicate user/app rows; resolve duplicates before cloud app upserts.'; end;
  begin create unique index if not exists abyss_user_data_user_uidx on public.abyss_user_data(user_id); exception when unique_violation then raise notice 'abyss_user_data has duplicate user rows.'; end;
end $$;

-- Private storage bucket for uploaded HTML/ZIP apps.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('abyss-app-bundles', 'abyss-app-bundles', false, 52428800, array['application/zip','application/octet-stream','text/html'])
on conflict (id) do update set public = false;

drop policy if exists "Abyss users read own app bundles" on storage.objects;
create policy "Abyss users read own app bundles" on storage.objects for select to authenticated using (bucket_id = 'abyss-app-bundles' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Abyss users upload own app bundles" on storage.objects;
create policy "Abyss users upload own app bundles" on storage.objects for insert to authenticated with check (bucket_id = 'abyss-app-bundles' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Abyss users update own app bundles" on storage.objects;
create policy "Abyss users update own app bundles" on storage.objects for update to authenticated using (bucket_id = 'abyss-app-bundles' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'abyss-app-bundles' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Abyss users delete own app bundles" on storage.objects;
create policy "Abyss users delete own app bundles" on storage.objects for delete to authenticated using (bucket_id = 'abyss-app-bundles' and (storage.foldername(name))[1] = auth.uid()::text);

-- Optional private storage for MP4s converted locally in the browser.
-- The current front-end upload guard is 50 MB per video.
create table if not exists public.abyss_video_files (
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, storage_path)
);

alter table public.abyss_video_files
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists file_name text,
  add column if not exists storage_path text,
  add column if not exists size_bytes bigint not null default 0,
  add column if not exists created_at timestamptz not null default now();

alter table public.abyss_video_files enable row level security;
drop policy if exists "Abyss users read own video metadata" on public.abyss_video_files;
create policy "Abyss users read own video metadata" on public.abyss_video_files for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Abyss users insert own video metadata" on public.abyss_video_files;
create policy "Abyss users insert own video metadata" on public.abyss_video_files for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Abyss users delete own video metadata" on public.abyss_video_files;
create policy "Abyss users delete own video metadata" on public.abyss_video_files for delete to authenticated using (auth.uid() = user_id);
grant select, insert, delete on public.abyss_video_files to authenticated;

do $$ begin
  begin create unique index if not exists abyss_video_files_user_path_uidx on public.abyss_video_files(user_id,storage_path); exception when unique_violation then raise notice 'abyss_video_files has duplicate user/storage-path rows.'; end;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('abyss-videos', 'abyss-videos', false, null, array['video/mp4'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "Abyss users read own videos" on storage.objects;
create policy "Abyss users read own videos" on storage.objects for select to authenticated using (bucket_id = 'abyss-videos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Abyss users upload own videos" on storage.objects;
create policy "Abyss users upload own videos" on storage.objects for insert to authenticated with check (bucket_id = 'abyss-videos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Abyss users delete own videos" on storage.objects;
create policy "Abyss users delete own videos" on storage.objects for delete to authenticated using (bucket_id = 'abyss-videos' and (storage.foldername(name))[1] = auth.uid()::text);


-- ABYSS OWNER REGISTRATION
-- Owner access is granted only to the account UUID confirmed by the project owner.
-- Run this in the Abyss project's SQL Editor. No browser-side secret is used.
create table if not exists public.abyss_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.abyss_owners
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists created_at timestamptz not null default now();
alter table public.abyss_owners enable row level security;
drop policy if exists "Abyss owner can read own owner record" on public.abyss_owners;
create policy "Abyss owner can read own owner record"
  on public.abyss_owners for select to authenticated
  using (auth.uid() = user_id);
grant select on public.abyss_owners to authenticated;

create unique index if not exists abyss_owners_user_uidx on public.abyss_owners(user_id);
revoke insert, update, delete on public.abyss_owners from anon, authenticated;

-- This is the user-provided, verified Abyss account UUID.
insert into public.abyss_owners (user_id)
values ('f6d463de-7509-4fb5-b799-d6597d986f03'::uuid)
on conflict (user_id) do nothing;


-- GLOBAL BLOCKER: shared master switch and shared rules for all visitors.
-- The row is readable by guests; only the verified owner row can update it.
create table if not exists public.abyss_global_settings (
  id integer primary key check (id = 1),
  enabled boolean not null default true,
  safe_search boolean not null default true,
  blocked_sites jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.abyss_global_settings
  add column if not exists id integer default 1,
  add column if not exists enabled boolean not null default true,
  add column if not exists safe_search boolean not null default true,
  add column if not exists blocked_sites jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists abyss_global_settings_id_uidx on public.abyss_global_settings(id);
insert into public.abyss_global_settings (id, enabled, safe_search, blocked_sites)
values (1, true, true, '[]'::jsonb)
on conflict (id) do nothing;
alter table public.abyss_global_settings enable row level security;
drop policy if exists "Abyss visitors can read global blocker settings" on public.abyss_global_settings;
create policy "Abyss visitors can read global blocker settings"
  on public.abyss_global_settings for select to anon, authenticated using (true);
drop policy if exists "Only registered Abyss owner can update global blocker settings" on public.abyss_global_settings;
create policy "Only registered Abyss owner can update global blocker settings"
  on public.abyss_global_settings for update to authenticated
  using (exists (select 1 from public.abyss_owners o where o.user_id = auth.uid()))
  with check (exists (select 1 from public.abyss_owners o where o.user_id = auth.uid()));
grant select on public.abyss_global_settings to anon, authenticated;
grant update on public.abyss_global_settings to authenticated;

-- Enable cross-device live updates for the global blocker switch when Realtime is available.
do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='abyss_global_settings') then
    alter publication supabase_realtime add table public.abyss_global_settings;
  end if;
end $$;

-- ABYSS MAINTENANCE MODE: public read, verified owner update only.
-- Maintenance is a client-visible gate for the GitHub Pages app; the owner session bypasses it.
create table if not exists public.abyss_maintenance (
  id integer primary key check (id = 1),
  enabled boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  message text not null default 'Abyss is being updated. Please check back soon.',
  updated_at timestamptz not null default now()
);

alter table public.abyss_maintenance
  add column if not exists id integer default 1,
  add column if not exists enabled boolean not null default false,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists message text not null default 'Abyss is being updated. Please check back soon.',
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists abyss_maintenance_id_uidx on public.abyss_maintenance(id);
insert into public.abyss_maintenance (id, enabled, message)
values (1, false, 'Abyss is being updated. Please check back soon.')
on conflict (id) do nothing;
alter table public.abyss_maintenance enable row level security;
drop policy if exists "Visitors can read Abyss maintenance status" on public.abyss_maintenance;
create policy "Visitors can read Abyss maintenance status"
  on public.abyss_maintenance for select to anon, authenticated using (true);
drop policy if exists "Only Abyss owner can update maintenance status" on public.abyss_maintenance;
create policy "Only Abyss owner can update maintenance status"
  on public.abyss_maintenance for update to authenticated
  using (exists (select 1 from public.abyss_owners o where o.user_id = auth.uid()))
  with check (exists (select 1 from public.abyss_owners o where o.user_id = auth.uid()));
grant select on public.abyss_maintenance to anon, authenticated;
grant update on public.abyss_maintenance to authenticated;

-- Reset the shared blocker switch to ON after correcting account-local state.
-- Existing blocked-site rules are preserved.
update public.abyss_global_settings
set enabled = true, safe_search = true, updated_at = now()
where id = 1;

-- Live updates for the shared blocker, maintenance status, and signed-in account snapshots.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='abyss_maintenance') then
      alter publication supabase_realtime add table public.abyss_maintenance;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='abyss_user_data') then
      alter publication supabase_realtime add table public.abyss_user_data;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='abyss_app_files') then
      alter publication supabase_realtime add table public.abyss_app_files;
    end if;
  end if;
end $$;
alter table public.abyss_maintenance replica identity full;
alter table public.abyss_user_data replica identity full;
alter table public.abyss_app_files replica identity full;
