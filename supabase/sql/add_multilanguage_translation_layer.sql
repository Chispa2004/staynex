-- Realtime Multilanguage Concierge & Reception Translation Layer
-- Safe to run manually. Adds optional translation metadata without changing existing flows.

alter table if exists public.hotel_users
  add column if not exists preferred_dashboard_language text not null default 'es',
  add column if not exists preferred_translation_language text not null default 'es';

alter table if exists public.messages
  add column if not exists original_language text null,
  add column if not exists translated_language text null,
  add column if not exists translated_text text null,
  add column if not exists translation_provider text null,
  add column if not exists translation_confidence numeric null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists messages_original_language_idx
  on public.messages (original_language);

create index if not exists messages_translated_language_idx
  on public.messages (translated_language);

alter table if exists public.ai_logs
  add column if not exists translated_for_staff boolean not null default false,
  add column if not exists translated_for_guest boolean not null default false,
  add column if not exists translation_provider text null;

create index if not exists hotel_users_translation_language_idx
  on public.hotel_users (preferred_translation_language);
