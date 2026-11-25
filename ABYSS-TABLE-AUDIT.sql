-- Read-only audit. Run this in the Abyss Browser Supabase project.
with expected(table_name, required_columns) as (
  values
    ('abyss_user_data', array['user_id','data','updated_at']::text[]),
    ('abyss_app_files', array['user_id','app_id','file_name','storage_path','updated_at']::text[]),
    ('abyss_video_files', array['user_id','file_name','storage_path','size_bytes','created_at']::text[]),
    ('abyss_owners', array['user_id','created_at']::text[]),
    ('abyss_global_settings', array['id','enabled','safe_search','blocked_sites','updated_at']::text[]),
    ('abyss_maintenance', array['id','enabled','starts_at','ends_at','message','updated_at']::text[])
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

select id, name, public, file_size_limit
from storage.buckets
where id in ('abyss-app-bundles','abyss-videos')
order by id;
