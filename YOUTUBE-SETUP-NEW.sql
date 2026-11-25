-- VIDEO HUB DATABASE SETUP (Supabase / PostgreSQL)
-- Safe/additive setup: creates the new app schema without dropping legacy tables.
-- BACK UP your existing project before running. Do not delete old public.users/videos tables until migration is verified.
-- Enable Authentication > Providers > Anonymous Sign-Ins for guest browsing and guest social actions.

create extension if not exists pgcrypto;

-- Preserve incompatible legacy tables by renaming them rather than dropping data.
do $$ begin
  -- Move only clearly incompatible old table shapes out of the way. Never drop them.
  if to_regclass('public.profiles') is not null
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='id') then
    if to_regclass('public.legacy_profiles') is null then alter table public.profiles rename to legacy_profiles;
    elsif to_regclass('public.legacy_profiles_repair_backup') is null then alter table public.profiles rename to legacy_profiles_repair_backup;
    else raise notice 'Incompatible public.profiles retained; rename it manually after backing up before rerunning.'; end if;
  end if;
  if to_regclass('public.videos') is not null
     and (not exists (select 1 from information_schema.columns where table_schema='public' and table_name='videos' and column_name='owner_id')
       or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='videos' and column_name='id')) then
    if to_regclass('public.legacy_videos') is null then alter table public.videos rename to legacy_videos;
    elsif to_regclass('public.legacy_videos_repair_backup') is null then alter table public.videos rename to legacy_videos_repair_backup;
    else raise notice 'Incompatible public.videos retained; rename it manually after backing up before rerunning.'; end if;
  end if;
  if to_regclass('public.video_likes') is not null
     and (not exists (select 1 from information_schema.columns where table_schema='public' and table_name='video_likes' and column_name='user_id')
       or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='video_likes' and column_name='video_id')) then
    if to_regclass('public.legacy_video_likes') is null then alter table public.video_likes rename to legacy_video_likes;
    elsif to_regclass('public.legacy_video_likes_repair_backup') is null then alter table public.video_likes rename to legacy_video_likes_repair_backup;
    else raise notice 'Incompatible public.video_likes retained; rename it manually after backing up before rerunning.'; end if;
  end if;
  if to_regclass('public.comments') is not null
     and (not exists (select 1 from information_schema.columns where table_schema='public' and table_name='comments' and column_name='id')
       or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='comments' and column_name='user_id')
       or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='comments' and column_name='video_id')) then
    if to_regclass('public.legacy_comments') is null then alter table public.comments rename to legacy_comments;
    elsif to_regclass('public.legacy_comments_repair_backup') is null then alter table public.comments rename to legacy_comments_repair_backup;
    else raise notice 'Incompatible public.comments retained; rename it manually after backing up before rerunning.'; end if;
  end if;
  if to_regclass('public.subscriptions') is not null
     and (not exists (select 1 from information_schema.columns where table_schema='public' and table_name='subscriptions' and column_name='subscriber_id')
       or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='subscriptions' and column_name='channel_id')) then
    if to_regclass('public.legacy_subscriptions') is null then alter table public.subscriptions rename to legacy_subscriptions;
    elsif to_regclass('public.legacy_subscriptions_repair_backup') is null then alter table public.subscriptions rename to legacy_subscriptions_repair_backup;
    else raise notice 'Incompatible public.subscriptions retained; rename it manually after backing up before rerunning.'; end if;
  end if;
  if to_regclass('public.playlists') is not null
     and (not exists (select 1 from information_schema.columns where table_schema='public' and table_name='playlists' and column_name='id')
       or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='playlists' and column_name='owner_id')) then
    if to_regclass('public.legacy_playlists') is null then alter table public.playlists rename to legacy_playlists;
    elsif to_regclass('public.legacy_playlists_repair_backup') is null then alter table public.playlists rename to legacy_playlists_repair_backup;
    else raise notice 'Incompatible public.playlists retained; rename it manually after backing up before rerunning.'; end if;
  end if;
  if to_regclass('public.video_progress') is not null
     and (not exists (select 1 from information_schema.columns where table_schema='public' and table_name='video_progress' and column_name='user_id')
       or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='video_progress' and column_name='video_id')) then
    if to_regclass('public.legacy_video_progress') is null then alter table public.video_progress rename to legacy_video_progress;
    elsif to_regclass('public.legacy_video_progress_repair_backup') is null then alter table public.video_progress rename to legacy_video_progress_repair_backup;
    else raise notice 'Incompatible public.video_progress retained; rename it manually after backing up before rerunning.'; end if;
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  display_name text not null default '',
  bio text not null default '' check (char_length(bio) <= 1000),
  avatar_url text,
  banner_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 5000),
  video_url text,
  storage_path text,
  thumbnail_url text,
  thumbnail_path text,
  video_type text not null default 'video' check (video_type in ('video','short')),
  visibility text not null default 'public' check (visibility in ('public','unlisted','private')),
  duration_seconds numeric,
  legacy_id text unique,
  width integer,
  height integer,
  views bigint not null default 0 check (views >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path is not null or video_url is not null),
  check (visibility <> 'private' or storage_path is not null)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='shorts_duration_limit') then
    alter table public.videos add constraint shorts_duration_limit check (video_type <> 'short' or (storage_path is not null and duration_seconds is not null and duration_seconds <= 180));
  end if;
  if not exists (select 1 from pg_constraint where conname='shorts_portrait_format') then
    alter table public.videos add constraint shorts_portrait_format check (video_type <> 'short' or (width is not null and height is not null and height > width));
  end if;
end $$;

create table if not exists public.video_likes (
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote smallint not null check (vote in (-1,1)),
  created_at timestamptz not null default now(),
  primary key(video_id,user_id)
);

create table if not exists public.subscriptions (
  subscriber_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(subscriber_id,channel_id),
  check (subscriber_id <> channel_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  legacy_id text unique,
  creator_hearted boolean not null default false,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- Keep the exact relationship name used by PostgREST embeds in the YouTube app.
do $$ declare existing_fk text; begin
  if not exists (select 1 from pg_constraint where conname='videos_owner_id_fkey' and conrelid='public.videos'::regclass) then
    select conname into existing_fk
    from pg_constraint
    where contype='f' and conrelid='public.videos'::regclass
      and confrelid='public.profiles'::regclass
      and conkey = array[(select attnum from pg_attribute where attrelid='public.videos'::regclass and attname='owner_id')]
    limit 1;
    if existing_fk is not null then
      execute format('alter table public.videos rename constraint %I to videos_owner_id_fkey', existing_fk);
    else
      alter table public.videos add constraint videos_owner_id_fkey
        foreign key (owner_id) references public.profiles(id) on delete cascade not valid;
    end if;
  end if;
end $$;

-- Explicit profile relationship so comment queries can join public profile names.
do $$ begin
  if not exists (select 1 from pg_constraint where conname='comments_user_profile_fkey' and conrelid='public.comments'::regclass) then
    alter table public.comments add constraint comments_user_profile_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade not valid;
  end if;
end $$;

create table if not exists public.view_events (
  video_id uuid not null references public.videos(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  primary key(video_id,viewer_id)
);

create table if not exists public.watch_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  last_watched_at timestamptz not null default now(),
  primary key(user_id,video_id)
);

create table if not exists public.video_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  progress_seconds integer not null default 0 check (progress_seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key(user_id,video_id)
);

create table if not exists public.watch_later (
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,video_id)
);

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  visibility text not null default 'private' check (visibility in ('public','unlisted','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playlist_items (
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  primary key(playlist_id,video_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  video_id uuid references public.videos(id) on delete cascade,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reason text not null,
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'pending' check (status in ('pending','reviewed','resolved','dismissed')),
  created_at timestamptz not null default now(),
  check (video_id is not null or comment_id is not null)
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  check(blocker_id <> blocked_id)
);


-- Repair columns on partially-created current tables (for example, after an interrupted setup).
-- These statements are additive and preserve existing rows.
alter table public.profiles
  add column if not exists username text,
  add column if not exists display_name text not null default '',
  add column if not exists bio text not null default '',
  add column if not exists avatar_url text,
  add column if not exists banner_url text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.videos
  add column if not exists owner_id uuid references public.profiles(id) on delete cascade,
  add column if not exists title text not null default 'Untitled',
  add column if not exists description text not null default '',
  add column if not exists video_url text,
  add column if not exists storage_path text,
  add column if not exists thumbnail_url text,
  add column if not exists thumbnail_path text,
  add column if not exists video_type text not null default 'video',
  add column if not exists visibility text not null default 'public',
  add column if not exists duration_seconds numeric,
  add column if not exists legacy_id text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists views bigint not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.video_likes
  add column if not exists video_id uuid references public.videos(id) on delete cascade,
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists vote smallint,
  add column if not exists created_at timestamptz not null default now();
alter table public.subscriptions
  add column if not exists subscriber_id uuid references auth.users(id) on delete cascade,
  add column if not exists channel_id uuid references public.profiles(id) on delete cascade,
  add column if not exists created_at timestamptz not null default now();
alter table public.comments
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists video_id uuid references public.videos(id) on delete cascade,
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists parent_id uuid references public.comments(id) on delete cascade,
  add column if not exists content text not null default '',
  add column if not exists legacy_id text,
  add column if not exists creator_hearted boolean not null default false,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
alter table public.view_events
  add column if not exists video_id uuid references public.videos(id) on delete cascade,
  add column if not exists viewer_id uuid references auth.users(id) on delete cascade,
  add column if not exists first_viewed_at timestamptz not null default now();
alter table public.watch_history
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists video_id uuid references public.videos(id) on delete cascade,
  add column if not exists last_watched_at timestamptz not null default now();
alter table public.video_progress
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists video_id uuid references public.videos(id) on delete cascade,
  add column if not exists progress_seconds integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();
alter table public.watch_later
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists video_id uuid references public.videos(id) on delete cascade,
  add column if not exists created_at timestamptz not null default now();
alter table public.playlists
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists owner_id uuid references public.profiles(id) on delete cascade,
  add column if not exists name text not null default 'Untitled playlist',
  add column if not exists description text not null default '',
  add column if not exists visibility text not null default 'private',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
alter table public.playlist_items
  add column if not exists playlist_id uuid references public.playlists(id) on delete cascade,
  add column if not exists video_id uuid references public.videos(id) on delete cascade,
  add column if not exists position integer not null default 0,
  add column if not exists added_at timestamptz not null default now();
alter table public.notifications
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists actor_id uuid references auth.users(id) on delete set null,
  add column if not exists video_id uuid references public.videos(id) on delete cascade,
  add column if not exists message text not null default '',
  add column if not exists is_read boolean not null default false,
  add column if not exists created_at timestamptz not null default now();
alter table public.content_reports
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists reporter_id uuid references auth.users(id) on delete cascade,
  add column if not exists video_id uuid references public.videos(id) on delete cascade,
  add column if not exists comment_id uuid references public.comments(id) on delete cascade,
  add column if not exists reason text not null default 'other',
  add column if not exists details text not null default '',
  add column if not exists status text not null default 'pending',
  add column if not exists created_at timestamptz not null default now();
alter table public.user_blocks
  add column if not exists blocker_id uuid references auth.users(id) on delete cascade,
  add column if not exists blocked_id uuid references auth.users(id) on delete cascade,
  add column if not exists created_at timestamptz not null default now();

-- Fill missing profile handles only where they can be generated safely.
update public.profiles
set username = 'user_' || left(id::text, 8)
where (username is null or btrim(username) = '') and id is not null;


create index if not exists videos_feed_idx on public.videos(visibility,video_type,created_at desc);
create index if not exists videos_owner_idx on public.videos(owner_id,created_at desc);
create index if not exists comments_video_idx on public.comments(video_id,created_at);
create index if not exists notifications_user_idx on public.notifications(user_id,created_at desc);
create index if not exists history_user_idx on public.watch_history(user_id,last_watched_at desc);
create index if not exists playlist_owner_idx on public.playlists(owner_id,created_at desc);

-- Ensure the unique keys used by PostgREST upserts exist on repaired/older tables.
-- If legacy duplicate rows exist, keep them and emit a notice instead of deleting data.
do $$ begin
  begin create unique index if not exists profiles_id_uidx on public.profiles(id); exception when unique_violation then raise notice 'profiles has duplicate IDs.'; end;
  begin create unique index if not exists profiles_username_uidx on public.profiles(username); exception when unique_violation then raise notice 'profiles has duplicate usernames; fix them before creating profiles.'; end;
  begin create unique index if not exists videos_id_uidx on public.videos(id); exception when unique_violation then raise notice 'videos has duplicate IDs.'; end;
  begin create unique index if not exists videos_legacy_id_uidx on public.videos(legacy_id); exception when unique_violation then raise notice 'videos has duplicate legacy IDs.'; end;
  begin create unique index if not exists comments_id_uidx on public.comments(id); exception when unique_violation then raise notice 'comments has duplicate IDs.'; end;
  begin create unique index if not exists comments_legacy_id_uidx on public.comments(legacy_id); exception when unique_violation then raise notice 'comments has duplicate legacy IDs.'; end;
  begin create unique index if not exists playlists_id_uidx on public.playlists(id); exception when unique_violation then raise notice 'playlists has duplicate IDs.'; end;
  begin create unique index if not exists notifications_id_uidx on public.notifications(id); exception when unique_violation then raise notice 'notifications has duplicate IDs.'; end;
  begin create unique index if not exists content_reports_id_uidx on public.content_reports(id); exception when unique_violation then raise notice 'content_reports has duplicate IDs.'; end;
  begin create unique index if not exists video_likes_video_user_uidx on public.video_likes(video_id,user_id); exception when unique_violation then raise notice 'video_likes has duplicate (video_id,user_id) rows; resolve duplicates before using likes upsert.'; end;
  begin create unique index if not exists subscriptions_subscriber_channel_uidx on public.subscriptions(subscriber_id,channel_id); exception when unique_violation then raise notice 'subscriptions has duplicate subscriber/channel rows; resolve duplicates before using subscribe upsert.'; end;
  begin create unique index if not exists view_events_video_viewer_uidx on public.view_events(video_id,viewer_id); exception when unique_violation then raise notice 'view_events has duplicate video/viewer rows; resolve duplicates before recording unique views.'; end;
  begin create unique index if not exists watch_history_user_video_uidx on public.watch_history(user_id,video_id); exception when unique_violation then raise notice 'watch_history has duplicate user/video rows; resolve duplicates before history upsert.'; end;
  begin create unique index if not exists video_progress_user_video_uidx on public.video_progress(user_id,video_id); exception when unique_violation then raise notice 'video_progress has duplicate user/video rows; resolve duplicates before progress upsert.'; end;
  begin create unique index if not exists watch_later_user_video_uidx on public.watch_later(user_id,video_id); exception when unique_violation then raise notice 'watch_later has duplicate user/video rows; resolve duplicates before save upsert.'; end;
  begin create unique index if not exists playlist_items_playlist_video_uidx on public.playlist_items(playlist_id,video_id); exception when unique_violation then raise notice 'playlist_items has duplicate playlist/video rows; resolve duplicates before playlist upsert.'; end;
  begin create unique index if not exists user_blocks_blocker_blocked_uidx on public.user_blocks(blocker_id,blocked_id); exception when unique_violation then raise notice 'user_blocks has duplicate blocker/blocked rows.'; end;
end $$;

-- Keep updated_at fresh.
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists videos_set_updated_at on public.videos;
create trigger videos_set_updated_at before update on public.videos for each row execute function public.set_updated_at();
drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at before update on public.comments for each row execute function public.set_updated_at();

create or replace function public.guard_comment_updates() returns trigger
language plpgsql security definer set search_path=public as $$
declare video_owner uuid;
begin
  select owner_id into video_owner from public.videos where id=old.video_id;
  if auth.uid() is distinct from old.user_id and auth.uid() is distinct from video_owner then
    raise exception 'You cannot edit this comment';
  end if;
  if new.user_id <> old.user_id or new.video_id <> old.video_id or new.parent_id is distinct from old.parent_id then
    raise exception 'Comment ownership and thread placement cannot be changed';
  end if;
  if auth.uid() is distinct from video_owner and
     (new.creator_hearted is distinct from old.creator_hearted or new.is_pinned is distinct from old.is_pinned) then
    raise exception 'Only the video creator can heart or pin comments';
  end if;
  if auth.uid() is distinct from old.user_id and new.content is distinct from old.content then
    raise exception 'Only the comment author can edit its text';
  end if;
  if new.is_pinned and not old.is_pinned then
    update public.comments set is_pinned=false where video_id=old.video_id and id<>old.id and is_pinned=true;
  end if;
  return new;
end; $$;
drop trigger if exists comments_guard_updates on public.comments;
create trigger comments_guard_updates before update on public.comments for each row execute function public.guard_comment_updates();
drop trigger if exists playlists_set_updated_at on public.playlists;
create trigger playlists_set_updated_at before update on public.playlists for each row execute function public.set_updated_at();

-- A view counts once per authenticated identity, including a persistent anonymous guest identity.
create or replace function public.record_video_view(p_video_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in or start a guest session to record views'; end if;
  if not exists(select 1 from public.videos where id=p_video_id and (visibility in ('public','unlisted') or owner_id=uid)) then raise exception 'Video is unavailable'; end if;
  insert into public.view_events(video_id,viewer_id) values(p_video_id,uid) on conflict do nothing;
  if found then update public.videos set views = views + 1 where id=p_video_id; end if;
  insert into public.watch_history(user_id,video_id,last_watched_at) values(uid,p_video_id,now())
    on conflict(user_id,video_id) do update set last_watched_at=excluded.last_watched_at;
end; $$;
revoke all on function public.record_video_view(uuid) from public;
grant execute on function public.record_video_view(uuid) to authenticated;

create or replace function public.get_video_vote_counts(p_video_id uuid)
returns table(likes bigint, dislikes bigint)
language sql stable security definer set search_path=public as $$
  select count(*) filter (where vote=1), count(*) filter (where vote=-1)
  from public.video_likes where video_id=p_video_id;
$$;
revoke all on function public.get_video_vote_counts(uuid) from public;
grant execute on function public.get_video_vote_counts(uuid) to anon,authenticated;

-- Notifications for channel subscriptions, likes, and comments/replies.
create or replace function public.notify_video_owner() returns trigger language plpgsql security definer set search_path=public as $$
declare owner uuid; msg text;
begin
 select owner_id into owner from public.videos where id=new.video_id;
 if owner is not null and owner <> new.user_id then
   msg := case when tg_table_name='comments' then 'Someone commented on your video.' else 'Someone liked your video.' end;
   insert into public.notifications(user_id,actor_id,video_id,message) values(owner,new.user_id,new.video_id,msg);
 end if;
 return new;
end; $$;
drop trigger if exists notify_new_comment on public.comments;
create trigger notify_new_comment after insert on public.comments for each row execute function public.notify_video_owner();
drop trigger if exists notify_new_like on public.video_likes;
create trigger notify_new_like after insert on public.video_likes for each row when (new.vote=1) execute function public.notify_video_owner();
create or replace function public.notify_new_subscriber() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.notifications(user_id,actor_id,message) values(new.channel_id,new.subscriber_id,'You have a new subscriber.'); return new; end; $$;
drop trigger if exists notify_subscription on public.subscriptions;
create trigger notify_subscription after insert on public.subscriptions for each row execute function public.notify_new_subscriber();

-- RLS
alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.video_likes enable row level security;
alter table public.subscriptions enable row level security;
alter table public.comments enable row level security;
alter table public.view_events enable row level security;
alter table public.watch_history enable row level security;
alter table public.video_progress enable row level security;
alter table public.watch_later enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;
alter table public.notifications enable row level security;
alter table public.content_reports enable row level security;
alter table public.user_blocks enable row level security;

-- Remove stale policies only from these app-owned tables, then rebuild the intended RLS rules.
do $$ declare pol record; begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public'
      and tablename = any(array[
        'profiles','videos','video_likes','subscriptions','comments','view_events',
        'watch_history','video_progress','watch_later','playlists','playlist_items',
        'notifications','content_reports','user_blocks'
      ])
  loop
    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- Policies are recreated by name for repeatable setup.
drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select to anon,authenticated using (true);
drop policy if exists "profile owner insert" on public.profiles;
create policy "profile owner insert" on public.profiles for insert to authenticated with check (id=auth.uid());
drop policy if exists "profile owner update" on public.profiles;
create policy "profile owner update" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

drop policy if exists "public videos visible" on public.videos;
create policy "public videos visible" on public.videos for select to anon,authenticated using (visibility in ('public','unlisted') or owner_id=auth.uid());
drop policy if exists "signed-in users create videos" on public.videos;
create policy "signed-in users create videos" on public.videos for insert to authenticated with check (owner_id=auth.uid() and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false);
drop policy if exists "owners update videos" on public.videos;
create policy "owners update videos" on public.videos for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
drop policy if exists "owners delete videos" on public.videos;
create policy "owners delete videos" on public.videos for delete to authenticated using (owner_id=auth.uid());

drop policy if exists "likes visible" on public.video_likes;
create policy "likes visible" on public.video_likes for select to anon,authenticated using (true);
drop policy if exists "users manage own likes" on public.video_likes;
create policy "users manage own likes" on public.video_likes for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "subscriptions visible" on public.subscriptions;
create policy "subscriptions visible" on public.subscriptions for select to anon,authenticated using (true);
drop policy if exists "users manage own subscriptions" on public.subscriptions;
create policy "users manage own subscriptions" on public.subscriptions for all to authenticated using (subscriber_id=auth.uid()) with check (subscriber_id=auth.uid());

drop policy if exists "comments visible on visible videos" on public.comments;
create policy "comments visible on visible videos" on public.comments for select to anon,authenticated using (exists(select 1 from public.videos v where v.id=video_id and (v.visibility in ('public','unlisted') or v.owner_id=auth.uid())));
drop policy if exists "authenticated users comment" on public.comments;
create policy "authenticated users comment" on public.comments for insert to authenticated with check (
  user_id=auth.uid() and exists(select 1 from public.videos v where v.id=video_id and (v.visibility in ('public','unlisted') or v.owner_id=auth.uid()))
  and (parent_id is null or exists(select 1 from public.comments parent where parent.id=parent_id and parent.video_id=video_id))
);
drop policy if exists "authors or video owners update comments" on public.comments;
create policy "authors or video owners update comments" on public.comments for update to authenticated using (user_id=auth.uid() or exists(select 1 from public.videos v where v.id=video_id and v.owner_id=auth.uid())) with check (user_id=auth.uid() or exists(select 1 from public.videos v where v.id=video_id and v.owner_id=auth.uid()));
drop policy if exists "authors or video owners delete comments" on public.comments;
create policy "authors or video owners delete comments" on public.comments for delete to authenticated using (user_id=auth.uid() or exists(select 1 from public.videos v where v.id=video_id and v.owner_id=auth.uid()));

drop policy if exists "view events owner only" on public.view_events;
create policy "view events owner only" on public.view_events for select to authenticated using (viewer_id=auth.uid());
drop policy if exists "history owner all" on public.watch_history;
create policy "history owner all" on public.watch_history for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "progress owner all" on public.video_progress;
create policy "progress owner all" on public.video_progress for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "watch later owner all" on public.watch_later;
create policy "watch later owner all" on public.watch_later for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists "public playlists visible" on public.playlists;
create policy "public playlists visible" on public.playlists for select to anon,authenticated using (visibility in ('public','unlisted') or owner_id=auth.uid());
drop policy if exists "playlist owner manage" on public.playlists;
create policy "playlist owner manage" on public.playlists for all to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
drop policy if exists "playlist items visible" on public.playlist_items;
create policy "playlist items visible" on public.playlist_items for select to anon,authenticated using (exists(select 1 from public.playlists p where p.id=playlist_id and (p.visibility in ('public','unlisted') or p.owner_id=auth.uid())));
drop policy if exists "playlist owner manages items" on public.playlist_items;
create policy "playlist owner manages items" on public.playlist_items for all to authenticated using (exists(select 1 from public.playlists p where p.id=playlist_id and p.owner_id=auth.uid())) with check (exists(select 1 from public.playlists p where p.id=playlist_id and p.owner_id=auth.uid()));

drop policy if exists "notification owner read" on public.notifications;
create policy "notification owner read" on public.notifications for select to authenticated using (user_id=auth.uid());
drop policy if exists "notification owner update" on public.notifications;
create policy "notification owner update" on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "users submit reports" on public.content_reports;
create policy "users submit reports" on public.content_reports for insert to authenticated with check (reporter_id=auth.uid());
drop policy if exists "reporter sees own reports" on public.content_reports;
create policy "reporter sees own reports" on public.content_reports for select to authenticated using (reporter_id=auth.uid());
drop policy if exists "users manage own blocks" on public.user_blocks;
create policy "users manage own blocks" on public.user_blocks for all to authenticated using (blocker_id=auth.uid()) with check (blocker_id=auth.uid());


-- Explicit table privileges; RLS remains the actual access boundary.
grant select, insert, update, delete on public.profiles, public.videos,
  public.video_likes, public.subscriptions, public.comments, public.watch_history,
  public.video_progress, public.watch_later, public.playlists, public.playlist_items,
  public.notifications, public.content_reports, public.user_blocks to authenticated;
grant select on public.profiles, public.videos, public.video_likes, public.subscriptions,
  public.comments, public.playlists, public.playlist_items to anon;
grant usage, select on all sequences in schema public to authenticated;

-- Supabase Realtime: publish the tables that drive live UI updates.
-- REPLICA IDENTITY FULL supplies old row values for UPDATE/DELETE events.
do $$
declare
  t text;
  realtime_tables text[] := array[
    'profiles','videos','video_likes','subscriptions','comments','view_events',
    'watch_history','video_progress','notifications','watch_later','playlists',
    'playlist_items','content_reports','user_blocks'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array realtime_tables loop
    execute format('alter table public.%I replica identity full', t);
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Storage buckets: public read for playback/thumbnails; authenticated non-anonymous users can upload to their own folder.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('videos','videos',false,null,array['video/mp4','video/webm','video/quicktime','video/ogg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('video-thumbnails','video-thumbnails',false,10485760,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('profile-media','profile-media',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Replace policies scoped to this app's three YouTube buckets; other buckets are untouched.
do $$ declare pol record; begin
  for pol in
    select policyname
    from pg_policies
    where schemaname='storage' and tablename='objects'
      and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ 'videos|video-thumbnails|profile-media'
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;
drop policy if exists "public read videos" on storage.objects;
drop policy if exists "visible video assets" on storage.objects;
drop policy if exists "creator upload own media" on storage.objects;
drop policy if exists "creator update own media" on storage.objects;
drop policy if exists "creator delete own media" on storage.objects;
create policy "visible video assets" on storage.objects for select to anon,authenticated using (
  bucket_id='profile-media'
  or (bucket_id='videos' and exists(select 1 from public.videos v where v.storage_path=name and (v.visibility in ('public','unlisted') or v.owner_id=auth.uid())))
  or (bucket_id='video-thumbnails' and exists(select 1 from public.videos v where v.thumbnail_path=name and (v.visibility in ('public','unlisted') or v.owner_id=auth.uid())))
);
drop policy if exists "creator upload own media" on storage.objects;
create policy "creator upload own media" on storage.objects for insert to authenticated with check (bucket_id in ('videos','video-thumbnails','profile-media') and (storage.foldername(name))[1]=auth.uid()::text and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false);
drop policy if exists "creator update own media" on storage.objects;
create policy "creator update own media" on storage.objects for update to authenticated using (bucket_id in ('videos','video-thumbnails','profile-media') and (storage.foldername(name))[1]=auth.uid()::text and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false) with check (bucket_id in ('videos','video-thumbnails','profile-media') and (storage.foldername(name))[1]=auth.uid()::text and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false);
drop policy if exists "creator delete own media" on storage.objects;
create policy "creator delete own media" on storage.objects for delete to authenticated using (bucket_id in ('videos','video-thumbnails','profile-media') and (storage.foldername(name))[1]=auth.uid()::text and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false);

-- Optional legacy data migration. Passwords are deliberately NEVER copied.
-- Users must create/reset credentials with Supabase Auth. Legacy tables remain available as backups.
do $$
begin
 if to_regclass('public.users') is not null then
   begin
     execute $m$
       insert into public.profiles(id,username,display_name,bio,avatar_url,banner_url)
       select au.id,
              left(regexp_replace(coalesce(u.username,'user_'||left(au.id::text,8)),'[^A-Za-z0-9_]','','g'),24),
              left(coalesce(u.username,'Creator'),40),
              left(coalesce(u.description,''),1000),
              nullif(u."avatarUrl",''), nullif(u."bannerUrl",'')
       from auth.users au
       join public.users u on lower(u.email)=lower(au.email)
       where au.email is not null
         and length(regexp_replace(coalesce(u.username,''),'[^A-Za-z0-9_]','','g')) between 3 and 24
       on conflict(id) do update set
         bio=case when public.profiles.bio='' then excluded.bio else public.profiles.bio end,
         avatar_url=coalesce(public.profiles.avatar_url,excluded.avatar_url),
         banner_url=coalesce(public.profiles.banner_url,excluded.banner_url)
     $m$;
   exception when undefined_column or unique_violation then
     raise notice 'Legacy profile columns differ or a username is already claimed; skipped automatic profile copy. Legacy public.users remains untouched.';
   end;
 end if;

 -- Copy old video metadata after users have recreated their Supabase Auth accounts with matching emails.
 if to_regclass('public.legacy_videos') is not null and to_regclass('public.profiles') is not null then
   begin
     execute $m$
       insert into public.videos(legacy_id,owner_id,title,description,video_url,storage_path,video_type,visibility,views)
       select v.id::text,p.id,left(coalesce(v.title,'Untitled'),120),'',
              case when v."videoUrl" like '%/storage/v1/object/public/videos/%' then null else v."videoUrl" end,
              case when v."videoUrl" like '%/storage/v1/object/public/videos/%' then substring(v."videoUrl" from '/storage/v1/object/public/videos/(.*)$') else null end,
              'video','public',greatest(coalesce(v.views,0),0)
       from public.legacy_videos v
       join public.profiles p on lower(p.username)=lower(v.author)
       where coalesce(v."videoUrl",'') <> ''
       on conflict(legacy_id) do nothing
     $m$;
   exception when undefined_column or invalid_text_representation then
     raise notice 'Legacy video columns differ; skipped automatic video copy. Legacy video table remains untouched.';
   end;
 end if;

 if to_regclass('public.legacy_comments') is not null then
   begin
     execute $m$
       insert into public.comments(legacy_id,video_id,user_id,content,creator_hearted,is_pinned)
       select c.id::text,nv.id,p.id,left(c.content,2000),coalesce(c.is_hearted,false),coalesce(c.is_pinned,false)
       from public.legacy_comments c
       join public.videos nv on nv.legacy_id=c.video_id::text
       join public.profiles p on lower(p.username)=lower(c.author)
       where coalesce(c.content,'') <> ''
       on conflict(legacy_id) do nothing
     $m$;
     execute $m$
       update public.comments child set parent_id=parent.id
       from public.legacy_comments old_child
       join public.comments parent on parent.legacy_id=old_child.parent_comment_id::text
       where child.legacy_id=old_child.id::text and old_child.parent_comment_id is not null
     $m$;
   exception when undefined_column or invalid_text_representation then
     raise notice 'Legacy comment columns differ; skipped automatic comment copy.';
   end;
 end if;

 if to_regclass('public.legacy_video_likes') is not null then
   begin
     execute $m$
       insert into public.video_likes(video_id,user_id,vote)
       select nv.id,p.id,case when l.vote= -1 then -1 else 1 end
       from public.legacy_video_likes l
       join public.videos nv on nv.legacy_id=l.video_id::text
       join public.profiles p on lower(p.username)=lower(l.username)
       on conflict(video_id,user_id) do nothing
     $m$;
   exception when undefined_column or invalid_text_representation then
     raise notice 'Legacy likes columns differ; skipped automatic like copy.';
   end;
 end if;

 if to_regclass('public.legacy_video_progress') is not null then
   begin
     execute $m$
       insert into public.video_progress(user_id,video_id,progress_seconds)
       select p.id,nv.id,greatest(coalesce(g.progress_seconds,0),0)
       from public.legacy_video_progress g
       join public.profiles p on lower(p.username)=lower(g.username)
       join public.videos nv on nv.legacy_id=g.video_id::text
       on conflict(user_id,video_id) do nothing
     $m$;
   exception when undefined_column or invalid_text_representation then
     raise notice 'Legacy progress columns differ; skipped automatic progress copy.';
   end;
 end if;

 if to_regclass('public.users') is not null then
   begin
     execute $m$
       insert into public.subscriptions(subscriber_id,channel_id)
       select au.id,channel.id
       from public.users old_user
       join auth.users au on lower(au.email)=lower(old_user.email)
       cross join lateral jsonb_array_elements_text(coalesce(to_jsonb(old_user.subscriptions),'[]'::jsonb)) sub(username)
       join public.profiles channel on lower(channel.username)=lower(sub.username)
       on conflict(subscriber_id,channel_id) do nothing
     $m$;
   exception when others then
     raise notice 'Legacy subscription format differs; skipped automatic subscription copy.';
   end;
 end if;
end $$;

-- After running this SQL:
-- 1) Authentication > Providers: enable Anonymous Sign-Ins.
-- 2) Authentication > URL Configuration: set your GitHub Pages site URL.
-- 3) Put the Project URL + sb_publishable_... key into config.js.
-- 4) Test guest browsing, account signup, upload, likes, comments, subscriptions, and RLS before considering removal of legacy tables.


-- EXPECTED YOUTUBE TABLES (14): profiles, videos, video_likes, subscriptions,
-- comments, view_events, watch_history, video_progress, watch_later, playlists,
-- playlist_items, notifications, content_reports, user_blocks.
-- EXPECTED STORAGE BUCKETS (3): videos, video-thumbnails, profile-media.
-- This script does not drop legacy_* tables or user content.
