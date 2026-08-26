-- BADAR P0-1 - Messages / Inbox tenant isolation
-- Stage B: final contract.
--
-- Run only after:
--   1. Stage A has been applied and verified.
--   2. New application code has been deployed.
--   3. New writes are confirmed to populate public.messages.hotel_id.
--
-- This stage re-backfills any NULL rows written by old instances during the
-- rolling window, then enforces NOT NULL and RLS.

do $$
begin
  if to_regclass('public.messages') is null then
    raise exception 'P0-1 Stage B aborted: public.messages does not exist';
  end if;

  if to_regclass('public.conversations') is null then
    raise exception 'P0-1 Stage B aborted: public.conversations does not exist';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'hotel_id'
  ) then
    raise exception 'P0-1 Stage B aborted: public.messages.hotel_id does not exist; run Stage A first';
  end if;

  if to_regprocedure('public.staynex_can_read_hotel(uuid)') is null then
    raise exception 'P0-1 Stage B aborted: public.staynex_can_read_hotel(uuid) is required before messages RLS';
  end if;
end $$;

update public.messages m
set hotel_id = c.hotel_id
from public.conversations c
where m.conversation_id = c.id
  and m.hotel_id is null
  and c.hotel_id is not null;

do $$
declare
  unresolved_count bigint;
begin
  select count(*)
  into unresolved_count
  from public.messages m
  left join public.conversations c on c.id = m.conversation_id
  where m.conversation_id is null
     or c.id is null
     or c.hotel_id is null
     or m.hotel_id is null
     or m.hotel_id <> c.hotel_id;

  if unresolved_count > 0 then
    raise exception 'P0-1 Stage B aborted: % messages are unresolved, null-tenant, orphaned or tenant-mismatched', unresolved_count;
  end if;
end $$;

create unique index if not exists conversations_id_hotel_id_unique_idx
  on public.conversations (id, hotel_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_conversation_hotel_match_fk'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_conversation_hotel_match_fk
      foreign key (conversation_id, hotel_id)
      references public.conversations(id, hotel_id)
      on update cascade
      on delete cascade;
  end if;
end $$;

create index if not exists messages_hotel_conversation_created_idx
  on public.messages (hotel_id, conversation_id, created_at);

alter table public.messages
  alter column hotel_id set not null;

alter table public.messages enable row level security;

drop policy if exists staynex_tenant_read_messages on public.messages;
create policy staynex_tenant_read_messages
on public.messages
for select
to authenticated
using (public.staynex_can_read_hotel(hotel_id));

-- Browser/authenticated clients do not write messages directly in the current
-- architecture. Do not create authenticated INSERT/UPDATE/DELETE policies; the
-- backend service-role path keeps the intended RLS bypass for legitimate writes.
drop policy if exists staynex_tenant_insert_messages on public.messages;
drop policy if exists staynex_tenant_update_messages on public.messages;
drop policy if exists staynex_tenant_delete_messages on public.messages;

grant select on public.messages to authenticated;

comment on column public.messages.hotel_id is
  'BADAR P0-1 Stage B: non-null tenant owner derived exclusively from conversations.hotel_id.';

comment on constraint messages_conversation_hotel_match_fk on public.messages is
  'BADAR P0-1 invariant: message.hotel_id must match conversations.hotel_id.';

comment on policy staynex_tenant_read_messages on public.messages is
  'BADAR P0-1 Stage B: authenticated clients can read messages only for hotels allowed by staynex_can_read_hotel. Authenticated writes are intentionally not granted.';

alter table public.messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'P0-1 Stage B: publication supabase_realtime does not exist in this environment';
end $$;
