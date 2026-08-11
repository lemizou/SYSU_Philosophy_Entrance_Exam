-- Run after the migration in a disposable Supabase database. The transaction
-- always rolls back, so this file does not create persistent users or content.
begin;

do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('favorites', 'notes', 'recent_views', 'daily_user_activity')
      and c.relrowsecurity
    group by n.nspname
    having count(*) = 4
  ) then
    raise exception 'all public user tables must have RLS enabled';
  end if;
end;
$$;

do $$
declare
  v_anon_table_grants integer;
  v_public_function_grants integer;
begin
  select count(*) into v_anon_table_grants
  from information_schema.role_table_grants
  where grantee = 'anon'
    and table_schema = 'public'
    and table_name in ('favorites', 'notes', 'recent_views', 'daily_user_activity');

  if v_anon_table_grants <> 0 then
    raise exception 'anon unexpectedly has table grants';
  end if;

  select count(*) into v_public_function_grants
  from information_schema.routine_privileges
  where grantee in ('PUBLIC', 'anon')
    and routine_schema = 'public'
    and routine_name in (
      'record_recent_view', 'record_activity', 'get_my_stats',
      'export_my_notes', 'get_activity_metrics'
    );

  if v_public_function_grants <> 0 then
    raise exception 'public or anon unexpectedly has RPC execution grants';
  end if;
end;
$$;

rollback;
