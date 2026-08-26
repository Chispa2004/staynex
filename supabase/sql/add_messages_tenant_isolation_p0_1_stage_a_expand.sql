-- BADAR P0-1 - Messages / Inbox tenant isolation
-- Stage A: backward-compatible schema expansion.
--
-- Safe rollout position:
--   1. Run Stage A preflight.
--   2. Run this migration.
--   3. Verify.
--   4. Deploy application code that writes and filters messages.hotel_id.
--
-- This stage intentionally keeps public.messages.hotel_id nullable and does not
-- enable messages RLS, so old application instances can continue to run during
-- a controlled rolling deployment.

do $$
declare
  unresolved_count bigint;
begin
  if to_regclass('public.messages') is null then
    raise exception 'P0-1 Stage A aborted: public.messages does not exist';
  end if;

  if to_regclass('public.conversations') is null then
    raise exception 'P0-1 Stage A aborted: public.conversations does not exist';
  end if;

  select count(*)
  into unresolved_count
  from public.messages m
  left join public.conversations c on c.id = m.conversation_id
  where m.conversation_id is null
     or c.id is null
     or c.hotel_id is null;

  if unresolved_count > 0 then
    raise exception 'P0-1 Stage A aborted: % existing messages cannot be resolved to conversations.hotel_id', unresolved_count;
  end if;
end $$;

alter table public.messages
  add column if not exists hotel_id uuid null references public.hotels(id) on delete cascade;

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
     or (
       m.hotel_id is not null
       and m.hotel_id <> c.hotel_id
     );

  if unresolved_count > 0 then
    raise exception 'P0-1 Stage A aborted: % messages are orphaned or tenant-mismatched after backfill', unresolved_count;
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

comment on column public.messages.hotel_id is
  'BADAR P0-1 Stage A: nullable tenant owner during expand phase; derived from conversations.hotel_id.';

comment on constraint messages_conversation_hotel_match_fk on public.messages is
  'BADAR P0-1 invariant: when messages.hotel_id is non-null, it must match conversations.hotel_id. NULL legacy rows pass PostgreSQL FK semantics during expand.';

alter table public.messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'P0-1 Stage A: publication supabase_realtime does not exist in this environment';
end $$;
