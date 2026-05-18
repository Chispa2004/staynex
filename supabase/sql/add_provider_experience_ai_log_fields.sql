alter table public.ai_logs
  add column if not exists hotel_id uuid references public.hotels(id) on delete set null,
  add column if not exists hotel_name text null,
  add column if not exists provider_experience_intent text null,
  add column if not exists provider_booking_created boolean default false,
  add column if not exists provider_used text null,
  add column if not exists provider_experience_used text null,
  add column if not exists provider_experiences_count integer default 0,
  add column if not exists hotel_experiences_count integer default 0,
  add column if not exists response_language text null,
  add column if not exists source_priority text null,
  add column if not exists blocked_cross_tenant_experiences boolean default false,
  add column if not exists provider_names_loaded text null,
  add column if not exists final_experience_source_used text null,
  add column if not exists provider_booking_detected boolean default false,
  add column if not exists booking_ready boolean default false,
  add column if not exists booking_block_reason text null,
  add column if not exists matched_provider_experience_id text null,
  add column if not exists last_provider_experience_id text null,
  add column if not exists provider_lead_status text null,
  add column if not exists provider_email_status text null;

create index if not exists ai_logs_hotel_created_at_idx
  on public.ai_logs (hotel_id, created_at desc);

create index if not exists ai_logs_provider_experience_intent_idx
  on public.ai_logs (provider_experience_intent, created_at desc);

comment on column public.ai_logs.provider_experience_intent is
  'Conversational provider experience intent: excursion_inquiry, excursion_interest, excursion_booking_intent, excursion_booking_confirmation.';

comment on column public.ai_logs.provider_booking_created is
  'True only when a provider/experience booking request was actually created.';
