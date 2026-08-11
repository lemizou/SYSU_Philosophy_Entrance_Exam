begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id),
  constraint favorites_question_id_format check (
    char_length(question_id) between 1 and 160
    and question_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

create index favorites_user_created_at_idx
  on public.favorites (user_id, created_at desc);

create table public.notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id),
  constraint notes_question_id_format check (
    char_length(question_id) between 1 and 160
    and question_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint notes_content_not_blank check (char_length(btrim(content)) > 0),
  constraint notes_content_size check (char_length(content) <= 50000)
);

create index notes_user_updated_at_idx
  on public.notes (user_id, updated_at desc);

create table public.recent_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  last_viewed_at timestamptz not null default now(),
  view_count bigint not null default 1,
  primary key (user_id, question_id),
  constraint recent_views_question_id_format check (
    char_length(question_id) between 1 and 160
    and question_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint recent_views_view_count_positive check (view_count > 0)
);

create index recent_views_user_last_viewed_at_idx
  on public.recent_views (user_id, last_viewed_at desc);

create table public.daily_user_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  primary key (user_id, activity_date),
  constraint daily_user_activity_timestamp_order check (
    first_seen_at <= last_seen_at
  )
);

create index daily_user_activity_date_user_idx
  on public.daily_user_activity (activity_date, user_id);

create table private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger notes_set_updated_at
before update on public.notes
for each row execute function private.set_updated_at();

revoke all on function private.set_updated_at() from public, anon, authenticated;

alter table public.favorites enable row level security;
alter table public.notes enable row level security;
alter table public.recent_views enable row level security;
alter table public.daily_user_activity enable row level security;
alter table private.admin_users enable row level security;

create policy favorites_select_own
on public.favorites for select to authenticated
using ((select auth.uid()) = user_id);

create policy favorites_insert_own
on public.favorites for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy favorites_delete_own
on public.favorites for delete to authenticated
using ((select auth.uid()) = user_id);

create policy notes_select_own
on public.notes for select to authenticated
using ((select auth.uid()) = user_id);

create policy notes_insert_own
on public.notes for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy notes_update_own
on public.notes for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy notes_delete_own
on public.notes for delete to authenticated
using ((select auth.uid()) = user_id);

create policy recent_views_select_own
on public.recent_views for select to authenticated
using ((select auth.uid()) = user_id);

create policy daily_user_activity_select_own
on public.daily_user_activity for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.favorites from anon, authenticated;
revoke all on public.notes from anon, authenticated;
revoke all on public.recent_views from anon, authenticated;
revoke all on public.daily_user_activity from anon, authenticated;

grant select, insert, delete on public.favorites to authenticated;
grant select, insert, update, delete on public.notes to authenticated;
grant select on public.recent_views to authenticated;
grant select on public.daily_user_activity to authenticated;

create or replace function public.record_recent_view(p_question_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_question_id is null
     or char_length(p_question_id) not between 1 and 160
     or p_question_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid question id' using errcode = '22023';
  end if;

  insert into public.recent_views (user_id, question_id)
  values (v_user_id, p_question_id)
  on conflict (user_id, question_id) do update
  set last_viewed_at = now(),
      view_count = public.recent_views.view_count + 1;
end;
$$;

create or replace function public.record_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_date date := (v_now at time zone 'UTC')::date;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.daily_user_activity (
    user_id, activity_date, first_seen_at, last_seen_at
  ) values (
    v_user_id, v_date, v_now, v_now
  )
  on conflict (user_id, activity_date) do update
  set last_seen_at = v_now
  where public.daily_user_activity.last_seen_at <= v_now - interval '15 minutes';
end;
$$;

create or replace function public.get_my_stats()
returns table (
  favorite_count bigint,
  note_count bigint,
  recent_view_count bigint,
  active_day_count bigint,
  last_active_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*) from public.favorites f where f.user_id = auth.uid()),
    (select count(*) from public.notes n where n.user_id = auth.uid()),
    (select count(*) from public.recent_views r where r.user_id = auth.uid()),
    (select count(*) from public.daily_user_activity a where a.user_id = auth.uid()),
    (select max(a.last_seen_at) from public.daily_user_activity a where a.user_id = auth.uid())
  where auth.uid() is not null;
$$;

create or replace function public.export_my_notes()
returns table (
  question_id text,
  content text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select n.question_id, n.content, n.created_at, n.updated_at
  from public.notes n
  where n.user_id = auth.uid()
  order by n.updated_at desc;
$$;

create or replace function public.get_activity_metrics(
  p_reference_date date default ((now() at time zone 'UTC')::date)
)
returns table (
  metric text,
  period_start date,
  period_end date,
  active_users bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not exists (
       select 1 from private.admin_users a where a.user_id = auth.uid()
     ) then
    raise exception 'administrator access required' using errcode = '42501';
  end if;

  return query
  select 'dau'::text, p_reference_date, p_reference_date, count(distinct a.user_id)
  from public.daily_user_activity a
  where a.activity_date = p_reference_date
  union all
  select 'wau'::text, p_reference_date - 6, p_reference_date, count(distinct a.user_id)
  from public.daily_user_activity a
  where a.activity_date between p_reference_date - 6 and p_reference_date
  union all
  select 'mau'::text, p_reference_date - 29, p_reference_date, count(distinct a.user_id)
  from public.daily_user_activity a
  where a.activity_date between p_reference_date - 29 and p_reference_date;
end;
$$;

revoke all on function public.record_recent_view(text) from public, anon;
revoke all on function public.record_activity() from public, anon;
revoke all on function public.get_my_stats() from public, anon;
revoke all on function public.export_my_notes() from public, anon;
revoke all on function public.get_activity_metrics(date) from public, anon;

grant execute on function public.record_recent_view(text) to authenticated;
grant execute on function public.record_activity() to authenticated;
grant execute on function public.get_my_stats() to authenticated;
grant execute on function public.export_my_notes() to authenticated;
grant execute on function public.get_activity_metrics(date) to authenticated;

comment on table public.daily_user_activity is
  'One server-generated row per authenticated user per UTC day; no raw click stream.';
comment on function public.get_activity_metrics(date) is
  'Returns distinct DAU, rolling 7-day WAU, and rolling 30-day MAU for an allowlisted administrator.';

commit;
