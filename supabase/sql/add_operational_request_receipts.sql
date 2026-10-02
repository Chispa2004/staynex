-- Additive contract. Apply before code using record_guest_operational_request_v1.
-- No backfill, provider call, scheduled job, or change to existing access policies.
BEGIN;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS request_context jsonb NOT NULL DEFAULT '{}'::jsonb;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets'
   AND column_name='request_context' AND data_type='jsonb' AND is_nullable='NO' AND column_default='''{}''::jsonb') THEN RAISE EXCEPTION 'Incompatible tickets.request_context'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.operational_request_receipts (
 hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
 source_message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
 request_key text NOT NULL,
 ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(hotel_id,source_message_id)
);
ALTER TABLE public.operational_request_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operational_request_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.operational_request_receipts TO service_role;
CREATE INDEX IF NOT EXISTS tickets_operational_request_open_idx ON public.tickets
 (hotel_id,conversation_id,(request_context->>'request_key')) WHERE status IN ('open','in_progress');

CREATE OR REPLACE FUNCTION public.guard_ticket_request_context_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user NOT IN ('postgres','service_role') AND
   ((TG_OP='INSERT' AND NEW.request_context<>'{}'::jsonb) OR (TG_OP='UPDATE' AND NEW.request_context IS DISTINCT FROM OLD.request_context))
 THEN RAISE EXCEPTION 'Operational receipt is server controlled' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_ticket_request_context_v1() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS ticket_request_context_guard_v1 ON public.tickets;
CREATE TRIGGER ticket_request_context_guard_v1 BEFORE INSERT OR UPDATE OF request_context ON public.tickets
 FOR EACH ROW EXECUTE FUNCTION public.guard_ticket_request_context_v1();

CREATE OR REPLACE FUNCTION public.record_guest_operational_request_v1(p_hotel_id uuid,p_conversation_id uuid,p_message_id uuid,p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE h public.hotels; c public.conversations; m public.messages; t public.tickets; r public.reservations;
 k text:=p_request->>'key'; v_category text:=p_request->>'category'; v_priority text:=p_request->>'priority';
 v_reservation_id uuid:=nullif(p_request->>'reservation_id','')::uuid; team text:='reception'; mode text; context jsonb;
BEGIN
 IF p_hotel_id IS NULL OR p_conversation_id IS NULL OR p_message_id IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object'
   OR k IS NULL OR length(k) NOT BETWEEN 1 AND 120 OR k !~ '^[a-z0-9:_-]+$'
   OR v_category IS NULL OR v_category NOT IN ('housekeeping','maintenance','complaint','reception','emergency')
   OR v_priority IS NULL OR v_priority NOT IN ('low','normal','high','urgent') OR nullif(btrim(p_request->>'title'),'') IS NULL
   OR length(p_request->>'title')>180 THEN RAISE EXCEPTION 'Invalid operational request' USING ERRCODE='22023'; END IF;
 -- Same lock order as hotel lifecycle: no request can cross an archive transition.
 SELECT * INTO h FROM public.hotels WHERE id=p_hotel_id FOR SHARE;
 IF NOT FOUND OR h.archived_at IS NOT NULL OR h.deleted_at IS NOT NULL OR h.status='archived'
   OR coalesce(h.metadata->>'archived','false')<>'false' OR coalesce(h.metadata->>'archive_operational_hold','false')<>'false'
   OR h.name LIKE '% (archived)' THEN RAISE EXCEPTION 'Hotel operations unavailable' USING ERRCODE='42501'; END IF;
 -- Serialize distinct source events for this conversation, not just each retry.
 SELECT * INTO c FROM public.conversations WHERE id=p_conversation_id AND hotel_id=p_hotel_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.guests WHERE id=c.guest_id AND hotel_id=h.id) THEN RAISE EXCEPTION 'Conversation scope denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.messages WHERE id=p_message_id AND conversation_id=c.id AND hotel_id=h.id AND sender_type='guest';
 IF NOT FOUND THEN RAISE EXCEPTION 'Message scope denied' USING ERRCODE='42501'; END IF;
 SELECT ticket.* INTO t FROM public.operational_request_receipts receipt JOIN public.tickets ticket ON ticket.id=receipt.ticket_id
   WHERE receipt.hotel_id=h.id AND receipt.source_message_id=m.id
   AND ticket.hotel_id=h.id AND ticket.conversation_id=c.id AND ticket.guest_id=c.guest_id;
 IF FOUND THEN RETURN jsonb_build_object('ticket',to_jsonb(t),'source_message_id',m.id,'replayed',true); END IF;
 SELECT coalesce(state_metadata->>'conversation_ai_mode','ai_active') INTO mode FROM public.conversation_ai_state
   WHERE hotel_id=h.id AND conversation_id=c.id FOR UPDATE;
 IF mode IS NOT NULL AND mode<>'ai_active' THEN RAISE EXCEPTION 'Human control active' USING ERRCODE='42501'; END IF;
 IF v_reservation_id IS NOT NULL THEN
   SELECT * INTO r FROM public.reservations WHERE id=v_reservation_id AND hotel_id=h.id AND guest_id=c.guest_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Reservation scope denied' USING ERRCODE='42501'; END IF;
 END IF;
 -- Existing departmental access is role/category based. No department is invented.
 IF v_category IN ('housekeeping','maintenance') AND EXISTS(SELECT 1 FROM public.hotel_users
   WHERE hotel_id=h.id AND role=v_category AND status='active' AND user_id IS NOT NULL) THEN team:=v_category; END IF;
 context:=jsonb_build_object('version',1,'request_key',k,'reservation_id',v_reservation_id,
   'source_message_id',m.id,'source_message_at',m.created_at,'responsible_role',team,
   'priority_reason',p_request->>'priority_reason','operational_context',p_request->'operational_context');
 IF coalesce((p_request->>'new_incident')::boolean,false)=false THEN
   SELECT * INTO t FROM public.tickets WHERE hotel_id=h.id AND conversation_id=c.id AND guest_id=c.guest_id
     AND status IN ('open','in_progress') AND request_context->>'request_key'=k
     AND (request_context->>'reservation_id') IS NOT DISTINCT FROM v_reservation_id::text
     ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
 ELSE t:=NULL; END IF;
 IF t.id IS NULL THEN
   INSERT INTO public.tickets(hotel_id,guest_id,conversation_id,room_number,category,title,description,priority,status,request_context)
   VALUES(h.id,c.guest_id,c.id,nullif(p_request->>'room_number',''),v_category,p_request->>'title',m.content,v_priority,'open',context) RETURNING * INTO t;
 ELSE
   UPDATE public.tickets SET description=description||E'\n\nSeguimiento ('||m.created_at::text||'): '||m.content,
     room_number=coalesce(nullif(p_request->>'room_number',''),room_number),
     priority=CASE WHEN array_position(ARRAY['low','normal','high','urgent'],priority)<array_position(ARRAY['low','normal','high','urgent'],p_request->>'priority') THEN p_request->>'priority' ELSE priority END,
     request_context=request_context||context||jsonb_build_object('last_source_message_id',m.id)
   WHERE id=t.id RETURNING * INTO t;
 END IF;
 INSERT INTO public.operational_request_receipts(hotel_id,source_message_id,request_key,ticket_id) VALUES(h.id,m.id,k,t.id);
 RETURN jsonb_build_object('ticket',to_jsonb(t),'source_message_id',m.id,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.record_guest_operational_request_v1(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_guest_operational_request_v1(uuid,uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
