-- BADAR P0-3: Guest/AI tenant isolation.
-- Target access model: scoped guest and AI tables are server-only.
-- This migration does not backfill data, does not change scheduled delivery
-- semantics, and does not broaden browser access.

begin;

do $$
declare
  missing_objects text;
  policy_conflicts text;
  object_conflicts text;
  violation_count bigint;
begin
  with required_tables(table_name) as (
    values
      ('guests'::text),
      ('guest_ai_profiles'::text),
      ('guest_ai_tags'::text),
      ('guest_ai_insights'::text),
      ('guest_ai_actions'::text),
      ('ai_logs'::text),
      ('conversation_ai_state'::text),
      ('scheduled_messages'::text),
      ('conversations'::text),
      ('reservations'::text),
      ('messages'::text),
      ('tickets'::text)
  ),
  required_columns(table_name, column_name) as (
    values
      ('guests'::text, 'hotel_id'::text),
      ('guest_ai_profiles'::text, 'hotel_id'::text),
      ('guest_ai_tags'::text, 'hotel_id'::text),
      ('guest_ai_insights'::text, 'hotel_id'::text),
      ('guest_ai_actions'::text, 'hotel_id'::text),
      ('ai_logs'::text, 'hotel_id'::text),
      ('conversation_ai_state'::text, 'hotel_id'::text),
      ('scheduled_messages'::text, 'hotel_id'::text),
      ('conversations'::text, 'hotel_id'::text),
      ('reservations'::text, 'hotel_id'::text),
      ('messages'::text, 'hotel_id'::text),
      ('tickets'::text, 'hotel_id'::text)
  ),
  missing as (
    select format('public.%I', table_name) as object_name
    from required_tables
    where to_regclass(format('%I.%I', 'public', table_name)) is null

    union all

    select format('public.%I.%I', table_name, column_name) as object_name
    from required_columns rc
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = rc.table_name
        and c.column_name = rc.column_name
    )
  )
  select string_agg(object_name, ', ' order by object_name)
  into missing_objects
  from missing;

  if missing_objects is not null then
    raise exception 'P0-3 aborted: required tenant objects are missing: %', missing_objects;
  end if;

  select string_agg(format('%I.%I', tablename, policyname), ', ' order by tablename, policyname)
  into policy_conflicts
  from pg_policies
  where schemaname = 'public'
    and tablename = any (array[
      'guests',
      'guest_ai_profiles',
      'guest_ai_tags',
      'guest_ai_insights',
      'guest_ai_actions',
      'ai_logs',
      'conversation_ai_state',
      'scheduled_messages'
    ]::text[])
    and roles && array['public', 'anon', 'authenticated']::name[];

  if policy_conflicts is not null then
    raise exception 'P0-3 aborted: browser-facing policies require manual review before server-only lockdown: %', policy_conflicts;
  end if;

  with needed_indexes(index_name, table_name, expected_pattern) as (
    values
      ('guests_id_hotel_id_unique_idx'::text, 'guests'::text, 'CREATE UNIQUE INDEX .* ON public\.guests .* \(id, hotel_id\)'::text),
      ('conversations_id_hotel_id_unique_idx'::text, 'conversations'::text, 'CREATE UNIQUE INDEX .* ON public\.conversations .* \(id, hotel_id\)'::text),
      ('reservations_id_hotel_id_unique_idx'::text, 'reservations'::text, 'CREATE UNIQUE INDEX .* ON public\.reservations .* \(id, hotel_id\)'::text)
  )
  select string_agg(ni.index_name, ', ' order by ni.index_name)
  into object_conflicts
  from needed_indexes ni
  join pg_namespace ns
    on ns.nspname = 'public'
  join pg_class idx
    on idx.relname = ni.index_name
   and idx.relnamespace = ns.oid
   and idx.relkind = 'i'
  left join pg_index ix
    on ix.indexrelid = idx.oid
  left join pg_class rel
    on rel.oid = ix.indrelid
  where rel.relname is distinct from ni.table_name
     or ix.indisunique is distinct from true
     or pg_get_indexdef(idx.oid) !~ ni.expected_pattern;

  if object_conflicts is not null then
    raise exception 'P0-3 aborted: expected unique index name exists with incompatible definition: %', object_conflicts;
  end if;

  with needed_constraints(constraint_name, table_name, expected_pattern) as (
    values
      ('guest_ai_profiles_guest_hotel_match_fk'::text, 'guest_ai_profiles'::text, 'FOREIGN KEY \(guest_id, hotel_id\) REFERENCES guests\(id, hotel_id\).*ON UPDATE CASCADE ON DELETE CASCADE'::text),
      ('guest_ai_tags_guest_hotel_match_fk'::text, 'guest_ai_tags'::text, 'FOREIGN KEY \(guest_id, hotel_id\) REFERENCES guests\(id, hotel_id\).*ON UPDATE CASCADE ON DELETE CASCADE'::text),
      ('guest_ai_insights_guest_hotel_match_fk'::text, 'guest_ai_insights'::text, 'FOREIGN KEY \(guest_id, hotel_id\) REFERENCES guests\(id, hotel_id\).*ON UPDATE CASCADE ON DELETE CASCADE'::text),
      ('guest_ai_actions_guest_hotel_match_fk'::text, 'guest_ai_actions'::text, 'FOREIGN KEY \(guest_id, hotel_id\) REFERENCES guests\(id, hotel_id\).*ON UPDATE CASCADE ON DELETE CASCADE'::text),
      ('conversation_ai_state_conversation_hotel_match_fk'::text, 'conversation_ai_state'::text, 'FOREIGN KEY \(conversation_id, hotel_id\) REFERENCES conversations\(id, hotel_id\).*ON UPDATE CASCADE ON DELETE CASCADE'::text),
      ('scheduled_messages_reservation_hotel_match_fk'::text, 'scheduled_messages'::text, 'FOREIGN KEY \(reservation_id, hotel_id\) REFERENCES reservations\(id, hotel_id\).*ON UPDATE CASCADE ON DELETE CASCADE'::text)
  )
  select string_agg(nc.constraint_name, ', ' order by nc.constraint_name)
  into object_conflicts
  from needed_constraints nc
  join pg_constraint con
    on con.conname = nc.constraint_name
   and con.conrelid = to_regclass(format('%I.%I', 'public', nc.table_name))
  where con.contype <> 'f'
     or pg_get_constraintdef(con.oid) !~ nc.expected_pattern;

  if object_conflicts is not null then
    raise exception 'P0-3 aborted: expected constraint name exists with incompatible definition: %', object_conflicts;
  end if;

  select count(*) into violation_count
  from public.guest_ai_profiles t
  left join public.guests g on g.id = t.guest_id
  where t.guest_id is not null
    and (
      g.id is null
      or g.hotel_id is distinct from t.hotel_id
    );

  if violation_count > 0 then
    raise exception 'P0-3 aborted: guest_ai_profiles contains % tenant relationship violations', violation_count;
  end if;

  select count(*) into violation_count
  from public.guest_ai_tags t
  left join public.guests g on g.id = t.guest_id
  where t.guest_id is not null
    and (
      g.id is null
      or g.hotel_id is distinct from t.hotel_id
    );

  if violation_count > 0 then
    raise exception 'P0-3 aborted: guest_ai_tags contains % tenant relationship violations', violation_count;
  end if;

  select count(*) into violation_count
  from public.guest_ai_insights t
  left join public.guests g on g.id = t.guest_id
  where t.guest_id is not null
    and (
      g.id is null
      or g.hotel_id is distinct from t.hotel_id
    );

  if violation_count > 0 then
    raise exception 'P0-3 aborted: guest_ai_insights contains % tenant relationship violations', violation_count;
  end if;

  select count(*) into violation_count
  from public.guest_ai_actions t
  left join public.guests g on g.id = t.guest_id
  where t.guest_id is not null
    and (
      g.id is null
      or g.hotel_id is distinct from t.hotel_id
    );

  if violation_count > 0 then
    raise exception 'P0-3 aborted: guest_ai_actions contains % tenant relationship violations', violation_count;
  end if;

  select count(*) into violation_count
  from public.conversation_ai_state t
  left join public.conversations c on c.id = t.conversation_id
  where t.conversation_id is not null
    and (
      c.id is null
      or c.hotel_id is distinct from t.hotel_id
    );

  if violation_count > 0 then
    raise exception 'P0-3 aborted: conversation_ai_state contains % tenant relationship violations', violation_count;
  end if;

  select count(*) into violation_count
  from public.scheduled_messages t
  left join public.reservations r on r.id = t.reservation_id
  where t.reservation_id is not null
    and (
      r.id is null
      or r.hotel_id is distinct from t.hotel_id
    );

  if violation_count > 0 then
    raise exception 'P0-3 aborted: scheduled_messages contains % reservation tenant violations', violation_count;
  end if;

  select count(*) into violation_count
  from public.scheduled_messages t
  left join public.guests g on g.id = t.guest_id
  where t.guest_id is not null
    and (g.id is null or g.hotel_id is distinct from t.hotel_id);

  if violation_count > 0 then
    raise exception 'P0-3 aborted: scheduled_messages contains % guest tenant violations', violation_count;
  end if;

  select count(*) into violation_count
  from public.scheduled_messages t
  left join public.conversations c on c.id = t.conversation_id
  where t.conversation_id is not null
    and (c.id is null or c.hotel_id is distinct from t.hotel_id);

  if violation_count > 0 then
    raise exception 'P0-3 aborted: scheduled_messages contains % conversation tenant violations', violation_count;
  end if;

  select count(*) into violation_count
  from public.ai_logs t
  left join public.messages m on m.id = t.message_id
  where t.message_id is not null
    and m.id is null;

  if violation_count > 0 then
    raise exception 'P0-3 aborted: ai_logs contains % missing message references', violation_count;
  end if;

  select count(*) into violation_count
  from public.ai_logs t
  join public.messages m on m.id = t.message_id
  where t.message_id is not null
    and t.hotel_id is not null
    and m.hotel_id is distinct from t.hotel_id;

  if violation_count > 0 then
    raise exception 'P0-3 aborted: ai_logs contains % message tenant violations', violation_count;
  end if;

  select count(*) into violation_count
  from public.ai_logs t
  left join public.guests g on g.id = t.guest_id
  where t.guest_id is not null
    and g.id is null;

  if violation_count > 0 then
    raise exception 'P0-3 aborted: ai_logs contains % missing guest references', violation_count;
  end if;

  select count(*) into violation_count
  from public.ai_logs t
  join public.guests g on g.id = t.guest_id
  where t.guest_id is not null
    and t.hotel_id is not null
    and g.hotel_id is distinct from t.hotel_id;

  if violation_count > 0 then
    raise exception 'P0-3 aborted: ai_logs contains % guest tenant violations', violation_count;
  end if;

  select count(*) into violation_count
  from public.ai_logs t
  left join public.conversations c on c.id = t.conversation_id
  where t.conversation_id is not null
    and c.id is null;

  if violation_count > 0 then
    raise exception 'P0-3 aborted: ai_logs contains % missing conversation references', violation_count;
  end if;

  select count(*) into violation_count
  from public.ai_logs t
  join public.conversations c on c.id = t.conversation_id
  where t.conversation_id is not null
    and t.hotel_id is not null
    and c.hotel_id is distinct from t.hotel_id;

  if violation_count > 0 then
    raise exception 'P0-3 aborted: ai_logs contains % conversation tenant violations', violation_count;
  end if;

  select count(*) into violation_count
  from public.ai_logs t
  left join public.tickets k on k.id = t.ticket_id
  where t.ticket_id is not null
    and k.id is null;

  if violation_count > 0 then
    raise exception 'P0-3 aborted: ai_logs contains % missing ticket references', violation_count;
  end if;

  select count(*) into violation_count
  from public.ai_logs t
  join public.tickets k on k.id = t.ticket_id
  where t.ticket_id is not null
    and t.hotel_id is not null
    and k.hotel_id is distinct from t.hotel_id;

  if violation_count > 0 then
    raise exception 'P0-3 aborted: ai_logs contains % ticket tenant violations', violation_count;
  end if;
end $$;

create unique index if not exists guests_id_hotel_id_unique_idx
  on public.guests (id, hotel_id);

create unique index if not exists conversations_id_hotel_id_unique_idx
  on public.conversations (id, hotel_id);

create unique index if not exists reservations_id_hotel_id_unique_idx
  on public.reservations (id, hotel_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'guest_ai_profiles_guest_hotel_match_fk'
      and conrelid = 'public.guest_ai_profiles'::regclass
  ) then
    alter table public.guest_ai_profiles
      add constraint guest_ai_profiles_guest_hotel_match_fk
      foreign key (guest_id, hotel_id)
      references public.guests(id, hotel_id)
      on update cascade
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'guest_ai_tags_guest_hotel_match_fk'
      and conrelid = 'public.guest_ai_tags'::regclass
  ) then
    alter table public.guest_ai_tags
      add constraint guest_ai_tags_guest_hotel_match_fk
      foreign key (guest_id, hotel_id)
      references public.guests(id, hotel_id)
      on update cascade
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'guest_ai_insights_guest_hotel_match_fk'
      and conrelid = 'public.guest_ai_insights'::regclass
  ) then
    alter table public.guest_ai_insights
      add constraint guest_ai_insights_guest_hotel_match_fk
      foreign key (guest_id, hotel_id)
      references public.guests(id, hotel_id)
      on update cascade
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'guest_ai_actions_guest_hotel_match_fk'
      and conrelid = 'public.guest_ai_actions'::regclass
  ) then
    alter table public.guest_ai_actions
      add constraint guest_ai_actions_guest_hotel_match_fk
      foreign key (guest_id, hotel_id)
      references public.guests(id, hotel_id)
      on update cascade
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'conversation_ai_state_conversation_hotel_match_fk'
      and conrelid = 'public.conversation_ai_state'::regclass
  ) then
    alter table public.conversation_ai_state
      add constraint conversation_ai_state_conversation_hotel_match_fk
      foreign key (conversation_id, hotel_id)
      references public.conversations(id, hotel_id)
      on update cascade
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'scheduled_messages_reservation_hotel_match_fk'
      and conrelid = 'public.scheduled_messages'::regclass
  ) then
    alter table public.scheduled_messages
      add constraint scheduled_messages_reservation_hotel_match_fk
      foreign key (reservation_id, hotel_id)
      references public.reservations(id, hotel_id)
      on update cascade
      on delete cascade;
  end if;
end $$;

alter table public.guests enable row level security;
alter table public.guest_ai_profiles enable row level security;
alter table public.guest_ai_tags enable row level security;
alter table public.guest_ai_insights enable row level security;
alter table public.guest_ai_actions enable row level security;
alter table public.ai_logs enable row level security;
alter table public.conversation_ai_state enable row level security;
alter table public.scheduled_messages enable row level security;

revoke all privileges on table public.guests from public;
revoke all privileges on table public.guests from anon;
revoke all privileges on table public.guests from authenticated;

revoke all privileges on table public.guest_ai_profiles from public;
revoke all privileges on table public.guest_ai_profiles from anon;
revoke all privileges on table public.guest_ai_profiles from authenticated;

revoke all privileges on table public.guest_ai_tags from public;
revoke all privileges on table public.guest_ai_tags from anon;
revoke all privileges on table public.guest_ai_tags from authenticated;

revoke all privileges on table public.guest_ai_insights from public;
revoke all privileges on table public.guest_ai_insights from anon;
revoke all privileges on table public.guest_ai_insights from authenticated;

revoke all privileges on table public.guest_ai_actions from public;
revoke all privileges on table public.guest_ai_actions from anon;
revoke all privileges on table public.guest_ai_actions from authenticated;

revoke all privileges on table public.ai_logs from public;
revoke all privileges on table public.ai_logs from anon;
revoke all privileges on table public.ai_logs from authenticated;

revoke all privileges on table public.conversation_ai_state from public;
revoke all privileges on table public.conversation_ai_state from anon;
revoke all privileges on table public.conversation_ai_state from authenticated;

revoke all privileges on table public.scheduled_messages from public;
revoke all privileges on table public.scheduled_messages from anon;
revoke all privileges on table public.scheduled_messages from authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on table public.guests to service_role;
    grant select, insert, update, delete on table public.guest_ai_profiles to service_role;
    grant select, insert, update, delete on table public.guest_ai_tags to service_role;
    grant select, insert, update, delete on table public.guest_ai_insights to service_role;
    grant select, insert, update, delete on table public.guest_ai_actions to service_role;
    grant select, insert, update, delete on table public.ai_logs to service_role;
    grant select, insert, update, delete on table public.conversation_ai_state to service_role;
    grant select, insert, update, delete on table public.scheduled_messages to service_role;
  end if;
end $$;

commit;
