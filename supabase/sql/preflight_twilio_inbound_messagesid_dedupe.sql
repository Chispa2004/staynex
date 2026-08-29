-- READ ONLY preflight for Twilio inbound MessageSid dedupe.
-- Reports only schema, security, estimated counts, and non-sensitive readiness.

with table_state as (
  select
    to_regclass('public.twilio_inbound_message_claims') as table_oid
),
column_state as (
  select
    bool_or(column_name = 'id' and data_type = 'uuid') as id_column_exists,
    bool_or(column_name = 'hotel_id' and data_type = 'uuid' and is_nullable = 'NO') as hotel_id_required,
    bool_or(column_name = 'message_sid' and data_type = 'text' and is_nullable = 'NO') as message_sid_required,
    bool_or(column_name = 'twilio_account_sid' and data_type = 'text') as account_sid_column_exists,
    bool_or(column_name = 'status' and data_type = 'text' and is_nullable = 'NO') as status_required,
    bool_or(column_name = 'message_id' and data_type = 'uuid') as message_id_column_exists,
    bool_or(column_name = 'attempt_count' and is_nullable = 'NO') as attempt_count_required,
    bool_or(column_name = 'first_received_at' and is_nullable = 'NO') as first_received_at_required,
    bool_or(column_name = 'last_received_at' and is_nullable = 'NO') as last_received_at_required,
    bool_or(column_name = 'processed_at') as processed_at_column_exists,
    bool_or(column_name = 'failed_at') as failed_at_column_exists,
    bool_or(column_name = 'failure_code') as failure_code_column_exists
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'twilio_inbound_message_claims'
),
index_state as (
  select
    bool_or(indexname = 'twilio_inbound_message_claims_hotel_sid_unique_idx') as hotel_sid_unique_exists,
    bool_or(indexname = 'twilio_inbound_message_claims_account_sid_unique_idx') as account_sid_unique_exists,
    bool_or(indexname = 'twilio_inbound_message_claims_hotel_status_idx') as hotel_status_index_exists,
    bool_or(indexname = 'twilio_inbound_message_claims_message_id_idx') as message_id_index_exists
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'twilio_inbound_message_claims'
),
rls_state as (
  select coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'twilio_inbound_message_claims'
  ), false) as rls_enabled
),
grant_state as (
  select
    count(*) filter (where grantee in ('PUBLIC', 'anon', 'authenticated')) as browser_privileges_remaining,
    count(*) filter (where grantee = 'service_role' and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) as service_crud_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'twilio_inbound_message_claims'
),
policy_state as (
  select count(*) as browser_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'twilio_inbound_message_claims'
    and array_to_string(roles, ',') ~ '(public|anon|authenticated)'
),
row_state as (
  select coalesce((
    select greatest(c.reltuples::bigint, 0)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'twilio_inbound_message_claims'
  ), 0) as estimated_claim_rows
),
summary as (
  select
    table_state.table_oid is not null as table_exists,
    coalesce(column_state.id_column_exists, false) as id_column_exists,
    coalesce(column_state.hotel_id_required, false) as hotel_id_required,
    coalesce(column_state.message_sid_required, false) as message_sid_required,
    coalesce(column_state.account_sid_column_exists, false) as account_sid_column_exists,
    coalesce(column_state.status_required, false) as status_required,
    coalesce(column_state.message_id_column_exists, false) as message_id_column_exists,
    coalesce(column_state.attempt_count_required, false) as attempt_count_required,
    coalesce(column_state.first_received_at_required, false) as first_received_at_required,
    coalesce(column_state.last_received_at_required, false) as last_received_at_required,
    coalesce(column_state.processed_at_column_exists, false) as processed_at_column_exists,
    coalesce(column_state.failed_at_column_exists, false) as failed_at_column_exists,
    coalesce(column_state.failure_code_column_exists, false) as failure_code_column_exists,
    coalesce(index_state.hotel_sid_unique_exists, false) as hotel_sid_unique_exists,
    coalesce(index_state.account_sid_unique_exists, false) as account_sid_unique_exists,
    coalesce(index_state.hotel_status_index_exists, false) as hotel_status_index_exists,
    coalesce(index_state.message_id_index_exists, false) as message_id_index_exists,
    rls_state.rls_enabled,
    grant_state.browser_privileges_remaining,
    grant_state.service_crud_grants,
    policy_state.browser_policy_count,
    row_state.estimated_claim_rows
  from table_state
  cross join column_state
  cross join index_state
  cross join rls_state
  cross join grant_state
  cross join policy_state
  cross join row_state
),
readiness as (
  select
    *,
    case
      when not table_exists then 'READY'
      when browser_privileges_remaining > 0 or browser_policy_count > 0 then 'BLOCKED'
      when not (
        id_column_exists
        and hotel_id_required
        and message_sid_required
        and account_sid_column_exists
        and status_required
        and message_id_column_exists
        and attempt_count_required
        and first_received_at_required
        and last_received_at_required
        and processed_at_column_exists
        and failed_at_column_exists
        and failure_code_column_exists
        and hotel_sid_unique_exists
        and account_sid_unique_exists
        and hotel_status_index_exists
        and message_id_index_exists
        and rls_enabled
        and service_crud_grants = 4
      ) then 'NEEDS_MANUAL_REVIEW'
      else 'READY'
    end as readiness
  from summary
)
select 'twilio_inbound_messagesid_dedupe' as scope, metric, value
from readiness,
lateral (
  values
    ('ready_for_twilio_inbound_messagesid_dedupe', (readiness = 'READY')::text),
    ('readiness', readiness),
    ('table_exists', table_exists::text),
    ('estimated_claim_rows', estimated_claim_rows::text),
    ('hotel_id_required', hotel_id_required::text),
    ('message_sid_required', message_sid_required::text),
    ('hotel_sid_unique_exists', hotel_sid_unique_exists::text),
    ('account_sid_unique_exists', account_sid_unique_exists::text),
    ('duplicate_messagesid_diagnostic', case when hotel_sid_unique_exists then 'BLOCKED_BY_HOTEL_MESSAGESID_UNIQUE' else 'REQUIRES_UNIQUE_INDEX' end),
    ('cross_tenant_messagesid_diagnostic', case when account_sid_unique_exists then 'BLOCKED_BY_ACCOUNT_MESSAGESID_UNIQUE' else 'REQUIRES_ACCOUNT_CONTEXT_INDEX' end),
    ('null_tenant_diagnostic', case when hotel_id_required then 'BLOCKED_BY_NOT_NULL' else 'REQUIRES_NOT_NULL_HOTEL_ID' end),
    ('rls_enabled', rls_enabled::text),
    ('browser_privileges_remaining', browser_privileges_remaining::text),
    ('browser_policy_count', browser_policy_count::text),
    ('service_crud_grants', service_crud_grants::text)
) as result(metric, value);
