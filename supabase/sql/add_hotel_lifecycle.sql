-- Review/apply only after preflight_hotel_lifecycle.sql. Additive, no historical backfill.
BEGIN;
-- Incremental equivalent of the missing add_hotel_archive_fields prerequisite.
-- Existing definitions/data are never overwritten. Legacy suffix archives remain archives.
ALTER TABLE public.hotels
 ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
 ADD COLUMN IF NOT EXISTS archived_at timestamptz,
 ADD COLUMN IF NOT EXISTS archived_by uuid,
 ADD COLUMN IF NOT EXISTS archived_reason text,
 ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM (VALUES
  ('id','uuid'),('name','text'),('status','text'),('metadata','jsonb'),('archived_at','timestamp with time zone'),
  ('deleted_at','timestamp with time zone'),('archived_by','uuid'),('archived_reason','text'),('updated_at','timestamp with time zone')) expected(col,typ)
  LEFT JOIN information_schema.columns c ON c.table_schema='public' AND c.table_name='hotels' AND c.column_name=expected.col
  WHERE c.data_type IS DISTINCT FROM expected.typ) THEN
  RAISE EXCEPTION 'Catálogo hotels incompatible: revise preflight; no se añaden ni alteran columnas existentes.';
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.hotel_lifecycle_history (
  hotel_id uuid PRIMARY KEY REFERENCES public.hotels(id),
  archived_at timestamptz NOT NULL,
  actor_id uuid NOT NULL,
  previous_status text,
  active boolean NOT NULL DEFAULT true,
  restored_at timestamptz,
  restored_by uuid
);
ALTER TABLE public.hotel_lifecycle_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hotel_lifecycle_history FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hotel_lifecycle_v1(p_hotel_id uuid,p_actor uuid,p_action text,p_expected_archived_at timestamptz DEFAULT NULL,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE h public.hotels; rec public.hotel_lifecycle_history; stamp timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.hotel_users WHERE user_id=p_actor AND status='active'
    AND platform_role IN ('platform_admin','super_admin','internal_only')) THEN
    RAISE EXCEPTION 'Se requiere administración activa de Staynex.' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('archive','restore') OR p_action IS NULL THEN RAISE EXCEPTION 'Operación no válida.'; END IF;
  SELECT * INTO h FROM public.hotels WHERE id=p_hotel_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hotel no encontrado.' USING ERRCODE='P0002'; END IF;
  IF h.metadata IS NOT NULL AND jsonb_typeof(h.metadata) <> 'object' THEN RAISE EXCEPTION 'Metadata incompatible: requiere revisión, sin cambios.'; END IF;
  SELECT * INTO rec FROM public.hotel_lifecycle_history WHERE hotel_id=p_hotel_id;
  IF p_action='archive' THEN
    IF h.archived_at IS NOT NULL OR h.deleted_at IS NOT NULL OR h.status='archived'
      OR coalesce(h.metadata->>'archived','false') <> 'false' OR h.name LIKE '% (archived)' THEN
      RETURN jsonb_build_object('ok',true,'action',p_action,'hotel',to_jsonb(h),'replayed',true,'legacy',rec.hotel_id IS NULL);
    END IF;
    IF h.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'El hotel cambió. Recarga antes de archivar.'; END IF;
    IF rec.active THEN RAISE EXCEPTION 'Conflicto de archivo: requiere revisión administrativa.'; END IF;
    stamp := clock_timestamp();
    INSERT INTO public.hotel_lifecycle_history(hotel_id,archived_at,actor_id,previous_status,active)
      VALUES(h.id,stamp,p_actor,h.status,true)
      ON CONFLICT(hotel_id) DO UPDATE SET archived_at=excluded.archived_at,actor_id=excluded.actor_id,
        previous_status=excluded.previous_status,active=true,restored_at=NULL,restored_by=NULL;
    UPDATE public.hotels SET status='archived',archived_at=stamp,deleted_at=stamp,archived_by=p_actor,
      archived_reason='platform_archive_v1',updated_at=stamp,
      metadata=coalesce(metadata,'{}'::jsonb)||'{"archived":true,"archive_operational_hold":true}'::jsonb
      WHERE id=h.id RETURNING * INTO h;
  ELSE
    IF rec.hotel_id IS NULL THEN RAISE EXCEPTION 'Archivo antiguo sin estado anterior acreditado. Requiere revisión; no se restaurará por suposición.'; END IF;
    IF p_expected_archived_at IS DISTINCT FROM rec.archived_at THEN RAISE EXCEPTION 'El archivo cambió. Recarga y revisa antes de restaurar.'; END IF;
    IF NOT rec.active THEN
      IF h.archived_at IS NOT NULL OR h.deleted_at IS NOT NULL OR h.status='archived' THEN RAISE EXCEPTION 'Conflicto de estado: requiere revisión administrativa.'; END IF;
      RETURN jsonb_build_object('ok',true,'action',p_action,'hotel',to_jsonb(h),'replayed',true);
    END IF;
    IF h.archived_at IS DISTINCT FROM rec.archived_at OR h.deleted_at IS DISTINCT FROM rec.archived_at
      OR h.status IS DISTINCT FROM 'archived' OR h.archived_by IS DISTINCT FROM rec.actor_id
      OR h.archived_reason IS DISTINCT FROM 'platform_archive_v1' THEN
      RAISE EXCEPTION 'El estado cambió después del archivo. Requiere resolución administrativa explícita.';
    END IF;
    UPDATE public.hotel_lifecycle_history SET active=false,restored_at=clock_timestamp(),restored_by=p_actor WHERE hotel_id=h.id;
    UPDATE public.hotels SET status=rec.previous_status,archived_at=NULL,deleted_at=NULL,archived_by=NULL,archived_reason=NULL,
      updated_at=clock_timestamp(),metadata=(coalesce(metadata,'{}'::jsonb)-'archived')||'{"archive_operational_hold":true}'::jsonb
      WHERE id=h.id RETURNING * INTO h;
  END IF;
  RETURN jsonb_build_object('ok',true,'action',p_action,'hotel',to_jsonb(h),'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.hotel_lifecycle_v1(uuid,uuid,text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hotel_lifecycle_v1(uuid,uuid,text,timestamptz,timestamptz) TO service_role;

-- Ordinary configuration saves cannot clear the hold or rewrite archive state.
CREATE OR REPLACE FUNCTION public.hotel_lifecycle_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE rec public.hotel_lifecycle_history;
BEGIN
  SELECT * INTO rec FROM public.hotel_lifecycle_history WHERE hotel_id=NEW.id;
  IF rec.hotel_id IS NOT NULL THEN
    IF NEW.metadata IS NOT NULL AND jsonb_typeof(NEW.metadata) <> 'object' THEN RAISE EXCEPTION 'Metadata incompatible.'; END IF;
    NEW.metadata := coalesce(NEW.metadata,'{}'::jsonb)||'{"archive_operational_hold":true}'::jsonb;
    IF rec.active AND (NEW.status IS DISTINCT FROM 'archived' OR NEW.archived_at IS DISTINCT FROM rec.archived_at
      OR NEW.deleted_at IS DISTINCT FROM rec.archived_at OR NEW.archived_by IS DISTINCT FROM rec.actor_id
      OR NEW.archived_reason IS DISTINCT FROM 'platform_archive_v1') THEN
      RAISE EXCEPTION 'Estado de archivo protegido: use la restauración administrativa.';
    END IF;
    IF rec.active THEN NEW.metadata := NEW.metadata||'{"archived":true}'::jsonb; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hotel_lifecycle_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS hotel_lifecycle_guard_v1 ON public.hotels;
CREATE TRIGGER hotel_lifecycle_guard_v1 BEFORE UPDATE ON public.hotels FOR EACH ROW EXECUTE FUNCTION public.hotel_lifecycle_guard_v1();

-- Serializes invitation activation with archive without changing assignments.
CREATE OR REPLACE FUNCTION public.hotel_archive_invitation_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE h public.hotels;
BEGIN
  IF NEW.status='active' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    SELECT * INTO h FROM public.hotels WHERE id=NEW.hotel_id FOR SHARE;
    IF h.archived_at IS NOT NULL OR h.deleted_at IS NOT NULL OR h.status='archived'
      OR coalesce(h.metadata->>'archived','false') <> 'false' OR h.name LIKE '% (archived)' THEN
      RAISE EXCEPTION 'No se puede activar un acceso a un hotel archivado.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hotel_archive_invitation_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS hotel_archive_invitation_guard_v1 ON public.hotel_users;
CREATE TRIGGER hotel_archive_invitation_guard_v1 BEFORE INSERT OR UPDATE ON public.hotel_users FOR EACH ROW EXECUTE FUNCTION public.hotel_archive_invitation_guard_v1();
NOTIFY pgrst,'reload schema';
COMMIT;
