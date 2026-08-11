begin;

-- Some Supabase projects contain this event-trigger helper in public. The event
-- trigger runs as its owner and does not require Data API callers to execute it.
-- Remove unnecessary browser-callable privileges when the helper exists.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

commit;
