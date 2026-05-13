create table if not exists public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete set null,
  guest_id uuid references public.guests(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  detected_language text,
  detected_intent text,
  detected_room text,
  confidence_score numeric,
  knowledge_used boolean not null default false,
  knowledge_key text,
  ticket_created boolean not null default false,
  ticket_id uuid references public.tickets(id) on delete set null,
  ticket_category text,
  generated_response text,
  raw_guest_message text,
  needs_human boolean not null default false,
  human_reason text,
  created_at timestamp with time zone not null default now()
);

create index if not exists ai_logs_created_at_idx
  on public.ai_logs (created_at desc);

create index if not exists ai_logs_conversation_created_at_idx
  on public.ai_logs (conversation_id, created_at desc);

create index if not exists ai_logs_guest_created_at_idx
  on public.ai_logs (guest_id, created_at desc);

create index if not exists ai_logs_intent_created_at_idx
  on public.ai_logs (detected_intent, created_at desc);

create index if not exists ai_logs_needs_human_created_at_idx
  on public.ai_logs (needs_human, created_at desc);
