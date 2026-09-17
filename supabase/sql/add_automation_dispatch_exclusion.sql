-- Local preparation only. Drain ALL old consumers before rollout; see runbook.
-- Additive: existing sent/failed/processing rows are never made eligible here.
begin;

create table if not exists public.automation_dispatches (
  message_id uuid primary key references public.scheduled_messages(id) on delete cascade,
  hotel_id uuid not null,
  attempt_id uuid not null,
  phase text not null check (phase in ('claimed', 'dispatching', 'accepted', 'rejected', 'unknown', 'blocked')),
  lease_until timestamptz not null,
  started_at timestamptz,
  finished_at timestamptz,
  provider_sid text,
  provider_status text,
  error_code text,
  retry_allowed boolean not null default false,
  previous_attempts jsonb not null default '[]'::jsonb
);
alter table public.automation_dispatches enable row level security;
revoke all on public.automation_dispatches from public, anon, authenticated, service_role;
grant select on public.automation_dispatches to service_role;

create or replace function public.automation_dispatch_claim(p_message_id uuid, p_hotel_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare m public.scheduled_messages; d public.automation_dispatches; token uuid := gen_random_uuid();
begin
  -- Every RPC locks in this order. The lock/transaction ends before provider I/O.
  select * into m from public.scheduled_messages where id = p_message_id and hotel_id = p_hotel_id for update;
  if not found then return null; end if;
  select * into d from public.automation_dispatches where message_id = m.id for update;
  if d.phase = 'dispatching' and d.lease_until <= clock_timestamp() then
    update public.automation_dispatches set phase = 'unknown', finished_at = clock_timestamp(),
      error_code = 'dispatch_lease_expired', retry_allowed = false where message_id = m.id;
    update public.scheduled_messages set status = 'unknown', error_message = 'dispatch_lease_expired',
      updated_at = clock_timestamp() where id = m.id;
    return null;
  end if;
  if m.status not in ('scheduled', 'retry') or m.scheduled_for > clock_timestamp()
    or m.idempotency_key is null or m.execution_mode is null
    or m.runtime_version is distinct from 'automation-runtime-foundation-phase1' then return null; end if;
  if d.message_id is not null and not (
    (d.phase = 'claimed' and d.lease_until <= clock_timestamp())
    or (d.phase = 'rejected' and d.retry_allowed and m.status = 'retry')
  ) then return null; end if;
  -- Legacy retry rows have no reliable evidence of non-acceptance.
  if d.message_id is null and m.status = 'retry' then return null; end if;
  insert into public.automation_dispatches(message_id, hotel_id, attempt_id, phase, lease_until)
    values(m.id, m.hotel_id, token, 'claimed', clock_timestamp() + interval '60 seconds')
  on conflict(message_id) do update set attempt_id = token, phase = 'claimed',
    lease_until = excluded.lease_until, started_at = null, finished_at = null,
    provider_sid = null, provider_status = null, error_code = null, retry_allowed = false,
    previous_attempts = public.automation_dispatches.previous_attempts || jsonb_build_array(to_jsonb(d) - 'previous_attempts');
  return jsonb_build_object('message', to_jsonb(m), 'attempt_id', token);
end $$;

create or replace function public.automation_dispatch_begin(p_message_id uuid, p_hotel_id uuid, p_attempt_id uuid, p_expected jsonb, p_checks jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare m public.scheduled_messages; d public.automation_dispatches;
begin
  select * into m from public.scheduled_messages where id = p_message_id and hotel_id = p_hotel_id for update;
  if not found then return null; end if;
  select * into d from public.automation_dispatches where message_id = m.id for update;
  if d.attempt_id is distinct from p_attempt_id or d.phase is distinct from 'claimed'
    or d.lease_until <= clock_timestamp() or m.status not in ('scheduled', 'retry')
    or to_jsonb(m) is distinct from p_expected then return null; end if;
  -- Revalidate the exact eligibility inputs at the durable send boundary. Do
  -- not send on a hotel kill switch, reservation or human-state change that
  -- committed while the worker was evaluating its gates.
  if (select to_jsonb(h) from (select id, metadata, ai_auto_reply_enabled from public.hotels where id=m.hotel_id) h)
      is distinct from p_checks->'hotel'
    or (select to_jsonb(r) from (select id, hotel_id, status, arrival_date, departure_date from public.reservations
      where id=m.reservation_id and hotel_id=m.hotel_id) r) is distinct from p_checks->'reservation'
    or coalesce((select to_jsonb(c) from public.conversation_ai_state c
      where c.conversation_id=m.conversation_id and c.hotel_id=m.hotel_id), 'null'::jsonb)
      is distinct from p_checks->'conversation' then return null; end if;
  update public.automation_dispatches set phase = 'dispatching', started_at = clock_timestamp(),
    lease_until = clock_timestamp() + interval '120 seconds' where message_id = m.id;
  update public.scheduled_messages set status = 'processing', updated_at = clock_timestamp() where id = m.id returning * into m;
  return to_jsonb(m);
end $$;

create or replace function public.automation_dispatch_block(p_message_id uuid, p_hotel_id uuid, p_attempt_id uuid, p_updates jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare m public.scheduled_messages; d public.automation_dispatches;
begin
  select * into m from public.scheduled_messages where id = p_message_id and hotel_id = p_hotel_id for update;
  if not found then return null; end if;
  select * into d from public.automation_dispatches where message_id = m.id for update;
  if d.attempt_id is distinct from p_attempt_id or d.phase is distinct from 'claimed'
    or d.lease_until <= clock_timestamp() or m.status not in ('scheduled', 'retry') then return null; end if;
  if p_updates->>'status' not in ('failed', 'cancelled', 'preview') then raise exception 'Invalid blocked status'; end if;
  update public.automation_dispatches set phase = 'blocked', finished_at = clock_timestamp(),
    error_code = p_updates->>'error_message' where message_id = m.id;
  update public.scheduled_messages set status = p_updates->>'status',
    error_message = p_updates->>'error_message', failed_at = (p_updates->>'failed_at')::timestamptz,
    metadata = coalesce(p_updates->'metadata', metadata), updated_at = clock_timestamp()
    where id = m.id returning * into m;
  return to_jsonb(m);
end $$;

create or replace function public.automation_dispatch_finish(p_message_id uuid, p_hotel_id uuid, p_attempt_id uuid, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare m public.scheduled_messages; d public.automation_dispatches; outcome text := p_result->>'phase';
begin
  select * into m from public.scheduled_messages where id = p_message_id and hotel_id = p_hotel_id for update;
  if not found then return null; end if;
  select * into d from public.automation_dispatches where message_id = m.id for update;
  if d.attempt_id is distinct from p_attempt_id or d.phase is distinct from 'dispatching'
    or d.lease_until <= clock_timestamp() then return null; end if;
  if outcome is null or outcome not in ('accepted', 'rejected', 'unknown') then raise exception 'Invalid outcome'; end if;
  if outcome = 'accepted' and coalesce(p_result->>'sid', '') !~ '^SM[0-9a-fA-F]{32}$' then raise exception 'Acceptance requires provider SID'; end if;
  update public.automation_dispatches set phase = outcome, finished_at = clock_timestamp(),
    provider_sid = p_result->>'sid', provider_status = p_result->>'providerStatus', error_code = p_result->>'code',
    retry_allowed = outcome = 'rejected' and coalesce((p_result->>'retry')::boolean, false) where message_id = m.id;
  update public.scheduled_messages set status = case outcome when 'accepted' then 'sent' when 'rejected' then 'failed' else 'unknown' end,
    sent_at = case when outcome = 'accepted' then clock_timestamp() else sent_at end,
    failed_at = case when outcome = 'rejected' then clock_timestamp() else failed_at end,
    error_message = p_result->>'code', updated_at = clock_timestamp() where id = m.id returning * into m;
  return to_jsonb(m);
end $$;

create or replace function public.automation_dispatch_retry(p_message_id uuid, p_hotel_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare m public.scheduled_messages; d public.automation_dispatches;
begin
  select * into m from public.scheduled_messages where id = p_message_id and hotel_id = p_hotel_id for update;
  if not found then return null; end if;
  select * into d from public.automation_dispatches where message_id = m.id for update;
  if d.phase is distinct from 'rejected' or not d.retry_allowed or m.status <> 'failed' then return null; end if;
  update public.scheduled_messages set status = 'retry', scheduled_for = greatest(scheduled_for, clock_timestamp() + interval '30 seconds'),
    updated_at = clock_timestamp() where id = m.id returning * into m;
  return to_jsonb(m);
end $$;

revoke all on function public.automation_dispatch_claim(uuid, uuid) from public, anon, authenticated;
revoke all on function public.automation_dispatch_begin(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.automation_dispatch_block(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.automation_dispatch_finish(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.automation_dispatch_retry(uuid, uuid) from public, anon, authenticated;
grant execute on function public.automation_dispatch_claim(uuid, uuid) to service_role;
grant execute on function public.automation_dispatch_begin(uuid, uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.automation_dispatch_block(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.automation_dispatch_finish(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.automation_dispatch_retry(uuid, uuid) to service_role;
commit;
