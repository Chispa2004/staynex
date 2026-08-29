begin;

do $$
declare
  claim_count bigint := 0;
begin
  if to_regclass('public.twilio_inbound_message_claims') is null then
    return;
  end if;

  select count(*)
    into claim_count
    from public.twilio_inbound_message_claims;

  if claim_count > 0 then
    raise exception
      'Twilio inbound dedupe rollback aborted: public.twilio_inbound_message_claims contains % operational claim rows. Roll back application code first and preserve the claims table for manual recovery/audit.',
      claim_count;
  end if;
end $$;

-- Empty-table cleanup only. Operational claims are never deleted by rollback.
drop table if exists public.twilio_inbound_message_claims;

commit;
