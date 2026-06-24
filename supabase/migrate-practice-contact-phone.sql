ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS contact_phone text;

CREATE OR REPLACE FUNCTION public.validate_practice(org_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  practice_record public.practices%ROWTYPE;
BEGIN
  IF org_name IS NULL OR trim(org_name) = '' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Organisation name is required');
  END IF;

  SELECT *
  INTO practice_record
  FROM public.practices
  WHERE name_lowercase = lower(trim(org_name))
    OR upper(btrim(COALESCE(ods_code, ''))) = upper(btrim(org_name))
  ORDER BY
    CASE WHEN name_lowercase = lower(trim(org_name)) THEN 0 ELSE 1 END
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Practice not registered');
  END IF;

  IF NOT practice_record.is_active THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Practice subscription is inactive');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'contact_phone', practice_record.contact_phone,
    'medication_enabled', practice_record.medication_enabled,
    'healthcheck_enabled', practice_record.healthcheck_enabled,
    'screening_enabled', practice_record.screening_enabled,
    'immunisation_enabled', practice_record.immunisation_enabled,
    'ltc_enabled', practice_record.ltc_enabled
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_practice(text) TO anon, authenticated;
