alter table public.ai_logs
  add column if not exists openai_concierge_used boolean default false,
  add column if not exists openai_concierge_model text null,
  add column if not exists openai_concierge_fallback boolean default false,
  add column if not exists ai_summary text null,
  add column if not exists ai_reasoning text null,
  add column if not exists ai_satisfaction_estimate numeric null,
  add column if not exists ai_resolution_estimate boolean default false;

alter table public.conversation_ai_state
  add column if not exists ai_summary text null,
  add column if not exists ai_reasoning text null,
  add column if not exists openai_enhanced boolean default false;

-- Optional OpenAI Concierge metadata for observability.
-- The system falls back to heuristics if these columns are not present yet.
