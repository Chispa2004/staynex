-- Local preparation only. Apply after guard_operational_request_clarification.sql.
-- Adds one service-only wrapper; existing consumers and RPC remain unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION public.recover_guest_operational_request_v1(
 p_hotel_id uuid,p_conversation_id uuid,p_message_id uuid,p_request jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE ids uuid[]; mid uuid; previous_time timestamptz; message_time timestamptz;
 result jsonb; root_replayed boolean; target uuid; i integer:=0; payload jsonb;
BEGIN
 IF jsonb_typeof(p_request->'recovery_message_ids') IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_request->'recovery_message_ids') NOT BETWEEN 2 AND 8 THEN
  RAISE EXCEPTION 'Invalid recovery sources' USING ERRCODE='22023'; END IF;
 SELECT array_agg(value::uuid ORDER BY ordinality) INTO ids
 FROM jsonb_array_elements_text(p_request->'recovery_message_ids') WITH ORDINALITY;
 IF ids[array_length(ids,1)] IS DISTINCT FROM p_message_id
  OR (SELECT count(DISTINCT x) FROM unnest(ids) x)<>array_length(ids,1) THEN
  RAISE EXCEPTION 'Invalid recovery order' USING ERRCODE='22023'; END IF;
 -- Validate every source before the first write. Inner RPCs enforce the full
 -- hotel/guest/reservation/human-control contract and retain their locks until
 -- this single transaction commits. No caller-supplied description is trusted.
 FOREACH mid IN ARRAY ids LOOP
  SELECT created_at INTO message_time FROM public.messages
   WHERE id=mid AND hotel_id=p_hotel_id AND conversation_id=p_conversation_id AND sender_type='guest';
  IF NOT FOUND OR message_time IS NULL OR message_time<previous_time THEN
   RAISE EXCEPTION 'Recovery message scope/order denied' USING ERRCODE='42501'; END IF;
  previous_time:=message_time;
 END LOOP;
 FOREACH mid IN ARRAY ids LOOP
  payload:=(p_request-'recovery_message_ids')||jsonb_build_object(
   'new_incident',i=0,'expected_ticket_id',target,
   'priority',CASE WHEN i=0 THEN p_request->>'priority' ELSE 'low' END,
   'priority_reason',CASE WHEN i=0 THEN p_request->>'priority_reason' ELSE 'recovered_guest_detail' END);
  result:=public.record_guest_operational_request_v1(p_hotel_id,p_conversation_id,mid,payload);
  IF i=0 THEN
   target:=(result->'ticket'->>'id')::uuid;root_replayed:=(result->>'replayed')::boolean;
   IF nullif(result->'ticket'->>'room_number','') IS DISTINCT FROM nullif(p_request->>'room_number','')
    OR nullif(result->'ticket'->'request_context'->>'reservation_id','') IS DISTINCT FROM nullif(p_request->>'reservation_id','') THEN
    RAISE EXCEPTION 'Recovery stay changed' USING ERRCODE='40001'; END IF;
  END IF;
  IF result->>'source_message_id' IS DISTINCT FROM mid::text
   OR result->'ticket'->>'id' IS DISTINCT FROM target::text
   OR result->>'target_ticket_enforced' IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'Recovery target mismatch' USING ERRCODE='40001'; END IF;
  i:=i+1;
 END LOOP;
 RETURN result||jsonb_build_object('recovery_root_replayed',root_replayed,'recovery_message_ids',to_jsonb(ids));
END $$;
REVOKE ALL ON FUNCTION public.recover_guest_operational_request_v1(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_guest_operational_request_v1(uuid,uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
