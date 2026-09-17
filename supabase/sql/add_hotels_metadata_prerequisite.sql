-- Prerequisite for add_automation_dispatch_exclusion.sql. Apply first.
-- No approvals, backfills, grants, policies or existing definitions are changed.
begin;
set local lock_timeout = '5s';
lock table public.hotels in access exclusive mode;

do $prerequisite$
declare
  column_info record;
  client_role record;
begin
  if not exists (
    select 1 from pg_attribute where attrelid = 'public.hotels'::regclass
      and attname = 'metadata' and attnum > 0 and not attisdropped
  ) then
    alter table public.hotels add column metadata jsonb default '{}'::jsonb;
  end if;

  select a.atttypid, a.attgenerated, pg_get_expr(d.adbin, d.adrelid) as default_expr
    into column_info
  from pg_attribute a left join pg_attrdef d
    on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.hotels'::regclass and a.attname = 'metadata'
    and a.attnum > 0 and not a.attisdropped;
  if column_info.atttypid <> 'jsonb'::regtype
    or column_info.attgenerated <> ''
    or column_info.default_expr is distinct from '''{}''::jsonb' then
    raise exception 'Incompatible hotels.metadata: expected jsonb with literal empty-object default; review without overwriting';
  end if;

  -- The reviewed destination has table grants to API roles, but RLS and no
  -- policies deny all row writes. Do not silently replace that authorization.
  -- Conservatively stop if its shape changes, even for a potentially safe policy.
  if not (select relrowsecurity from pg_class where oid = 'public.hotels'::regclass)
    or exists (select 1 from pg_policy where polrelid = 'public.hotels'::regclass) then
    raise exception 'Unreviewed hotels authorization: require existing RLS with no policies; no permissions were changed';
  end if;
  for client_role in select oid, rolname from pg_roles where rolname in ('anon', 'authenticated') loop
    if exists (
      select 1 from pg_roles privileged
      where (privileged.rolsuper or privileged.rolbypassrls
        or privileged.oid = (select relowner from pg_class where oid = 'public.hotels'::regclass))
        and pg_has_role(client_role.oid, privileged.oid, 'MEMBER')
    ) then
      raise exception 'Unreviewed hotels authorization: % can assume a privileged role', client_role.rolname;
    end if;
  end loop;
  if (select count(*) from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) <> 3 then
    raise exception 'Missing API roles required by the reviewed contract';
  end if;
end
$prerequisite$;
commit;
