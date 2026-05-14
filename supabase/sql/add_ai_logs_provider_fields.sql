alter table public.ai_logs
  add column if not exists ai_provider text null,
  add column if not exists ai_model text null,
  add column if not exists fallback_used boolean default false;

create index if not exists ai_logs_ai_provider_idx
  on public.ai_logs (ai_provider);

create index if not exists ai_logs_fallback_used_idx
  on public.ai_logs (fallback_used);
