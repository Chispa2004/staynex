create table if not exists public.conversation_ai_state (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  current_intent text null,
  previous_intent text null,
  intent_confidence numeric default 0,
  last_offer_type text null,
  last_offer_sent_at timestamptz null,
  last_ai_response text null,
  sentiment text null,
  escalation_level text not null default 'ai_handled'
    check (escalation_level in ('ai_handled', 'reception_required', 'manager_required', 'urgent')),
  state_metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists conversation_ai_state_conversation_uidx
  on public.conversation_ai_state (conversation_id);

create index if not exists conversation_ai_state_hotel_id_idx
  on public.conversation_ai_state (hotel_id);

create index if not exists conversation_ai_state_current_intent_idx
  on public.conversation_ai_state (hotel_id, current_intent);

create index if not exists conversation_ai_state_escalation_idx
  on public.conversation_ai_state (hotel_id, escalation_level, updated_at);

-- Short-term state for the heuristic AI concierge.
-- This prevents repeated offers and lets the agent switch intent when the guest changes topic.
