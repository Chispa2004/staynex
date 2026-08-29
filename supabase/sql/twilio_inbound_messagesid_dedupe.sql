begin;

create table if not exists public.twilio_inbound_message_claims (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  message_sid text not null,
  twilio_account_sid text null,
  status text not null default 'processing',
  message_id uuid null references public.messages(id) on delete set null,
  attempt_count integer not null default 1,
  first_received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  processed_at timestamptz null,
  failed_at timestamptz null,
  failure_code text null,
  constraint twilio_inbound_message_claims_message_sid_check
    check (length(btrim(message_sid)) > 0),
  constraint twilio_inbound_message_claims_status_check
    check (status in ('processing', 'processed', 'failed')),
  constraint twilio_inbound_message_claims_attempt_count_check
    check (attempt_count > 0)
);

comment on table public.twilio_inbound_message_claims is
  'Server-only durable idempotency claims for validated Twilio inbound MessageSid processing.';
comment on column public.twilio_inbound_message_claims.hotel_id is
  'Tenant owner resolved from the validated inbound destination number before the claim is created.';
comment on column public.twilio_inbound_message_claims.message_sid is
  'Validated Twilio MessageSid used only for idempotency; no guest contact data is stored here.';
comment on column public.twilio_inbound_message_claims.twilio_account_sid is
  'Validated Twilio account context when present, used to reject cross-tenant reuse within the same Twilio account.';
comment on column public.twilio_inbound_message_claims.status is
  'processing, processed, or failed; pilot Twilio inbound semantics are at-most-once, so failed claims are consumed and are not automatically retried.';

create unique index if not exists twilio_inbound_message_claims_hotel_sid_unique_idx
  on public.twilio_inbound_message_claims (hotel_id, message_sid);

create unique index if not exists twilio_inbound_message_claims_account_sid_unique_idx
  on public.twilio_inbound_message_claims (twilio_account_sid, message_sid)
  where twilio_account_sid is not null;

create index if not exists twilio_inbound_message_claims_hotel_status_idx
  on public.twilio_inbound_message_claims (hotel_id, status, last_received_at desc);

create index if not exists twilio_inbound_message_claims_message_id_idx
  on public.twilio_inbound_message_claims (message_id)
  where message_id is not null;

alter table public.twilio_inbound_message_claims enable row level security;

revoke all privileges on table public.twilio_inbound_message_claims from public;
revoke all privileges on table public.twilio_inbound_message_claims from anon;
revoke all privileges on table public.twilio_inbound_message_claims from authenticated;

grant select, insert, update, delete on table public.twilio_inbound_message_claims to service_role;

commit;
