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

alter table public.abyss_app_files enable row level security;
drop policy if exists "Abyss users read own app metadata" on public.abyss_app_files;
create policy "Abyss users read own app metadata" on public.abyss_app_files for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Abyss users insert own app metadata" on public.abyss_app_files;
create policy "Abyss users insert own app metadata" on public.abyss_app_files for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Abyss users update own app metadata" on public.abyss_app_files;
create policy "Abyss users update own app metadata" on public.abyss_app_files for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.abyss_app_files to authenticated;

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

alter table public.abyss_video_files enable row level security;
drop policy if exists "Abyss users read own video metadata" on public.abyss_video_files;
create policy "Abyss users read own video metadata" on public.abyss_video_files for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Abyss users insert own video metadata" on public.abyss_video_files;
create policy "Abyss users insert own video metadata" on public.abyss_video_files for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Abyss users delete own video metadata" on public.abyss_video_files;
create policy "Abyss users delete own video metadata" on public.abyss_video_files for delete to authenticated using (auth.uid() = user_id);
grant select, insert, delete on public.abyss_video_files to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('abyss-videos', 'abyss-videos', false, 52428800, array['video/mp4'])
on conflict (id) do update set public = false;

drop policy if exists "Abyss users read own videos" on storage.objects;
create policy "Abyss users read own videos" on storage.objects for select to authenticated using (bucket_id = 'abyss-videos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Abyss users upload own videos" on storage.objects;
create policy "Abyss users upload own videos" on storage.objects for insert to authenticated with check (bucket_id = 'abyss-videos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Abyss users delete own videos" on storage.objects;
create policy "Abyss users delete own videos" on storage.objects for delete to authenticated using (bucket_id = 'abyss-videos' and (storage.foldername(name))[1] = auth.uid()::text);
