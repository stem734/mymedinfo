-- =============================================================================
-- Migration: per-visit patient access events for time-windowed reporting.
--
-- The practices table already keeps a cumulative `link_visit_count` and a
-- `last_accessed` timestamp. To show "opens this week / month / year" on the
-- practice dashboard we need timestamped events, so this migration adds a
-- lightweight append-only log, writes to it from record_patient_access, and
-- exposes an authorised aggregate via get_practice_access_stats.
--
-- Idempotent: safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.patient_access_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  accessed_at timestamptz NOT NULL DEFAULT now()
);

-- Supports the windowed counts below (filter by practice, order by time).
CREATE INDEX IF NOT EXISTS patient_access_events_practice_time_idx
  ON public.patient_access_events (practice_id, accessed_at DESC);

-- All reads/writes go through the SECURITY DEFINER functions below, so no
-- client role gets direct table access.
ALTER TABLE public.patient_access_events ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- record_patient_access(org_name text)
-- Atomically bumps link_visit_count / last_accessed AND appends an event row.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.record_patient_access(org_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  matched_id uuid;
BEGIN
  IF org_name IS NULL OR trim(org_name) = '' THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  SELECT id INTO matched_id
  FROM public.practices
  WHERE (
      name_lowercase = lower(trim(org_name))
      OR upper(btrim(COALESCE(ods_code, ''))) = upper(btrim(org_name))
    )
    AND is_active = true
  ORDER BY
    CASE WHEN name_lowercase = lower(trim(org_name)) THEN 0 ELSE 1 END
  LIMIT 1;

  IF matched_id IS NULL THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  UPDATE public.practices
  SET last_accessed = now(),
      link_visit_count = link_visit_count + 1
  WHERE id = matched_id;

  INSERT INTO public.patient_access_events (practice_id)
  VALUES (matched_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- =============================================================================
-- get_practice_access_stats(target_practice uuid)
-- Returns access counts for the last 7 / 30 / 365 days plus all-time total.
-- Authorised: a member of the practice, or a platform admin.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_practice_access_stats(target_practice uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  IF target_practice IS NULL THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  IF NOT (public.is_practice_member(target_practice) OR public.is_admin()) THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'week', count(*) FILTER (WHERE accessed_at >= now() - interval '7 days'),
    'month', count(*) FILTER (WHERE accessed_at >= now() - interval '30 days'),
    'year', count(*) FILTER (WHERE accessed_at >= now() - interval '365 days'),
    'total', count(*)
  )
  INTO result
  FROM public.patient_access_events
  WHERE practice_id = target_practice;

  RETURN result;
END;
$$;

-- Lock down execution to the same roles as the rest of the patient/portal RPCs.
REVOKE EXECUTE ON FUNCTION public.record_patient_access(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_practice_access_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_patient_access(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_practice_access_stats(uuid) TO authenticated;
