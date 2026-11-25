-- Read-only audit. Run this in the SEPARATE YouTube Supabase project.
with expected(table_name, required_columns) as (
  values
    ('profiles', array['id','username','display_name','bio','avatar_url','banner_url','created_at','updated_at']::text[]),
    ('videos', array['id','owner_id','title','description','video_url','storage_path','thumbnail_url','thumbnail_path','video_type','visibility','duration_seconds','views','created_at','updated_at']::text[]),
    ('video_likes', array['video_id','user_id','vote','created_at']::text[]),
    ('subscriptions', array['subscriber_id','channel_id','created_at']::text[]),
    ('comments', array['id','video_id','user_id','parent_id','content','creator_hearted','is_pinned','created_at','updated_at']::text[]),
    ('view_events', array['video_id','viewer_id','first_viewed_at']::text[]),
    ('watch_history', array['user_id','video_id','last_watched_at']::text[]),
    ('video_progress', array['user_id','video_id','progress_seconds','updated_at']::text[]),
    ('watch_later', array['user_id','video_id','created_at']::text[]),
    ('playlists', array['id','owner_id','name','description','visibility','created_at','updated_at']::text[]),
    ('playlist_items', array['playlist_id','video_id','position','added_at']::text[]),
    ('notifications', array['id','user_id','actor_id','video_id','message','is_read','created_at']::text[]),
    ('content_reports', array['id','reporter_id','video_id','comment_id','reason','details','status','created_at']::text[]),
    ('user_blocks', array['blocker_id','blocked_id','created_at']::text[])
)
select
  e.table_name,
  to_regclass(format('public.%I', e.table_name)) is not null as table_exists,
  coalesce(c.relrowsecurity, false) as rls_enabled,
  array(
    select required_col
    from unnest(e.required_columns) as required_col
    where not exists (
      select 1 from information_schema.columns ic
      where ic.table_schema='public' and ic.table_name=e.table_name and ic.column_name=required_col
    )
  ) as missing_columns,
  (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=e.table_name) as policy_count,
  exists (
    select 1 from pg_publication_tables rpt
    where rpt.pubname='supabase_realtime' and rpt.schemaname='public' and rpt.tablename=e.table_name
  ) as realtime_enabled
from expected e
left join pg_class c on c.oid=to_regclass(format('public.%I', e.table_name))
order by e.table_name;

-- Supabase storage.buckets identifies buckets with the column "id" (not "bucket_id").
select id as bucket_id, name, public, file_size_limit
from storage.buckets
where id in ('videos','video-thumbnails','profile-media')
order by id;
