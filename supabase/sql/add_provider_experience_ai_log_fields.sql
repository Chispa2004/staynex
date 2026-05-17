alter table public.ai_logs
  add column if not exists provider_experience_intent text null,
  add column if not exists provider_booking_created boolean default false,
  add column if not exists provider_used text null,
  add column if not exists provider_experience_used text null;

create index if not exists ai_logs_provider_experience_intent_idx
  on public.ai_logs (provider_experience_intent, created_at desc);

comment on column public.ai_logs.provider_experience_intent is
  'Conversational provider experience intent: excursion_inquiry, excursion_interest, excursion_booking_intent, excursion_booking_confirmation.';

comment on column public.ai_logs.provider_booking_created is
  'True only when a provider/experience booking request was actually created.';
