alter table public.ai_logs
  add column if not exists needs_human boolean not null default false,
  add column if not exists human_reason text;

create index if not exists ai_logs_needs_human_created_at_idx
  on public.ai_logs (needs_human, created_at desc);
