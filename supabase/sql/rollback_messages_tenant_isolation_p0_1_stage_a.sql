-- BADAR P0-1 - Stage A rollback
--
-- If the new application code has already been deployed, roll application code
-- back before removing public.messages.hotel_id.

alter table public.messages
  drop constraint if exists messages_conversation_hotel_match_fk;

drop index if exists public.messages_hotel_conversation_created_idx;
drop index if exists public.conversations_id_hotel_id_unique_idx;

alter table public.messages
  drop constraint if exists messages_hotel_id_fkey;

alter table public.messages
  drop column if exists hotel_id;
