BEGIN;
ALTER TABLE public.hotel_pms_connections ADD COLUMN IF NOT EXISTS config_revision bigint NOT NULL DEFAULT 1;
ALTER TABLE public.hotel_pms_connections ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.hotel_pms_connections ADD COLUMN IF NOT EXISTS last_success_evidence jsonb;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS pms_connection_id uuid REFERENCES public.hotel_pms_connections(id);
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS pms_config_revision bigint;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS pms_property_id text;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS pms_environment text;
-- No backfill of binding/evidence: existing reservations remain historical.
CREATE OR REPLACE FUNCTION public.guard_pms_connection_revision_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE changed boolean; old_config jsonb; new_config jsonb; history_found boolean; history_table text;
BEGIN
 IF TG_OP='INSERT' THEN NEW.config_revision:=1;NEW.evidence:='{}';NEW.last_success_evidence:=NULL;RETURN NEW;END IF;
 old_config:=jsonb_build_array(OLD.hotel_id,OLD.provider,OLD.client_id,OLD.encrypted_client_secret,to_jsonb(OLD)->'encrypted_webhook_secret',OLD.account_code,OLD.base_url,OLD.enabled,
   OLD.metadata->'property_id',OLD.metadata->'environment',OLD.metadata->'credentials_encrypted',OLD.metadata->'scope',OLD.metadata->'connection_mode');
 new_config:=jsonb_build_array(NEW.hotel_id,NEW.provider,NEW.client_id,NEW.encrypted_client_secret,to_jsonb(NEW)->'encrypted_webhook_secret',NEW.account_code,NEW.base_url,NEW.enabled,
   NEW.metadata->'property_id',NEW.metadata->'environment',NEW.metadata->'credentials_encrypted',NEW.metadata->'scope',NEW.metadata->'connection_mode');
 changed:=old_config IS DISTINCT FROM new_config;
 IF jsonb_build_array(OLD.hotel_id,OLD.provider,OLD.account_code,OLD.metadata->'property_id',OLD.metadata->'environment')
   IS DISTINCT FROM jsonb_build_array(NEW.hotel_id,NEW.provider,NEW.account_code,NEW.metadata->'property_id',NEW.metadata->'environment')
 THEN
   SELECT EXISTS(SELECT 1 FROM public.reservations WHERE hotel_id=OLD.hotel_id AND pms_provider=OLD.provider) INTO history_found;
   FOREACH history_table IN ARRAY ARRAY['room_status_snapshots','hotel_occupancy_snapshots','guest_stay_context'] LOOP
     IF NOT history_found AND to_regclass('public.'||history_table) IS NOT NULL THEN
       EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE hotel_id=$1)',history_table) INTO history_found USING OLD.hotel_id;
     END IF;
   END LOOP;
   IF history_found THEN RAISE EXCEPTION 'PMS history requires a property transition review' USING ERRCODE='23514'; END IF;
 END IF;
 NEW.config_revision:=OLD.config_revision+CASE WHEN changed THEN 1 ELSE 0 END;
 IF changed THEN NEW.evidence:='{}';NEW.last_success_evidence:=OLD.last_success_evidence;NEW.sync_status:='configured';
 ELSIF (NEW.evidence IS DISTINCT FROM OLD.evidence OR NEW.last_success_evidence IS DISTINCT FROM OLD.last_success_evidence)
   AND current_user NOT IN ('postgres','service_role','supabase_admin') THEN
   RAISE EXCEPTION 'PMS evidence is server controlled' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_pms_connection_revision ON public.hotel_pms_connections;
CREATE TRIGGER guard_pms_connection_revision BEFORE INSERT OR UPDATE ON public.hotel_pms_connections
 FOR EACH ROW EXECUTE FUNCTION public.guard_pms_connection_revision_v1();

CREATE OR REPLACE FUNCTION public.record_pms_evidence_v1(p_connection uuid,p_revision bigint,p_type text,p_started timestamptz,p_result text,p_coverage text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.hotel_pms_connections; receipt jsonb;
BEGIN
 SELECT * INTO c FROM public.hotel_pms_connections WHERE id=p_connection FOR UPDATE;
 IF c.id IS NULL OR NOT c.enabled OR c.config_revision<>p_revision THEN RAISE EXCEPTION 'PMS revision no longer active' USING ERRCODE='40001'; END IF;
 IF p_type NOT IN ('access','sync') OR p_result NOT IN ('success','failed','partial') OR p_coverage NOT IN ('unknown','partial','complete')
   OR p_started IS NULL OR p_started>clock_timestamp()
   OR p_started<coalesce((c.evidence->p_type->>'started_at')::timestamptz,'-infinity') THEN
   RAISE EXCEPTION 'Invalid or superseded PMS evidence' USING ERRCODE='22023'; END IF;
 receipt:=jsonb_build_object('hotel_id',c.hotel_id,'provider',c.provider,'environment',c.metadata->>'environment',
   'property_id',c.metadata->>'property_id','revision',c.config_revision,'type',p_type,'started_at',p_started,
   'at',clock_timestamp(),'result',p_result,'coverage',p_coverage);
 UPDATE public.hotel_pms_connections SET evidence=jsonb_set(evidence,ARRAY[p_type],receipt),
   last_success_evidence=CASE WHEN p_result='success' THEN receipt ELSE last_success_evidence END WHERE id=c.id;
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.record_pms_evidence_v1(uuid,bigint,text,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_pms_evidence_v1(uuid,bigint,text,timestamptz,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_apaleo_reservation_binding_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE c public.hotel_pms_connections;
BEGIN
 IF NEW.pms_provider IS DISTINCT FROM 'apaleo' THEN RETURN NEW; END IF;
 SELECT * INTO c FROM public.hotel_pms_connections WHERE id=NEW.pms_connection_id FOR SHARE;
 IF c.id IS NULL OR c.provider<>'apaleo' OR NOT c.enabled OR c.hotel_id<>NEW.hotel_id
   OR c.config_revision IS DISTINCT FROM NEW.pms_config_revision
   OR c.metadata->>'property_id' IS DISTINCT FROM NEW.pms_property_id
   OR NEW.pms_property_id IS NULL OR c.metadata->>'environment' IS DISTINCT FROM NEW.pms_environment
   OR coalesce(NEW.pms_environment,'') NOT IN ('test','production') THEN
   RAISE EXCEPTION 'Apaleo reservation binding missing or stale' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_apaleo_reservation_binding ON public.reservations;
CREATE TRIGGER guard_apaleo_reservation_binding BEFORE INSERT OR UPDATE OF pms_provider,pms_connection_id,pms_config_revision,pms_property_id,pms_environment,hotel_id,status,arrival_date,departure_date ON public.reservations
 FOR EACH ROW EXECUTE FUNCTION public.guard_apaleo_reservation_binding_v1();
NOTIFY pgrst,'reload schema';
COMMIT;
