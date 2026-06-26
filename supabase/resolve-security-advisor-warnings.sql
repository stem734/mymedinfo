-- =============================================================================
-- Resolve Supabase Security Advisor warnings:
-- - function_search_path_mutable
-- - rls_policy_always_true on practices_insert_anyone
--
-- Safe to re-run in the Supabase SQL Editor.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_practices_ods_code_upper
  ON public.practices (upper(btrim(ods_code)))
  WHERE ods_code IS NOT NULL AND btrim(ods_code) <> '';

ALTER TABLE public.practice_medication_cards
  ADD COLUMN IF NOT EXISTS key_info_mode text CHECK (key_info_mode IN ('do','dont')),
  ADD COLUMN IF NOT EXISTS do_key_info text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dont_key_info text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS general_key_info text[] DEFAULT '{}';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_gp_ratifier boolean NOT NULL DEFAULT false;

ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS is_gp_ratified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gp_ratified_at timestamptz,
  ADD COLUMN IF NOT EXISTS gp_ratified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.card_templates
  ADD COLUMN IF NOT EXISTS is_gp_ratified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gp_ratified_at timestamptz,
  ADD COLUMN IF NOT EXISTS gp_ratified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE uid = auth.uid()
      AND is_active = true
      AND global_role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_practice_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE uid = auth.uid()
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_practice_member(target_practice uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_memberships memberships
    JOIN public.users
      ON users.uid = memberships.user_uid
    WHERE memberships.practice_id = target_practice
      AND memberships.user_uid = auth.uid()
      AND users.is_active = true
  );
$$;

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

CREATE OR REPLACE FUNCTION public.record_patient_access(org_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF org_name IS NULL OR trim(org_name) = '' THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  WITH target_practice AS (
    SELECT id
    FROM public.practices
    WHERE (
        name_lowercase = lower(trim(org_name))
        OR upper(btrim(COALESCE(ods_code, ''))) = upper(btrim(org_name))
      )
      AND is_active = true
    ORDER BY
      CASE WHEN name_lowercase = lower(trim(org_name)) THEN 0 ELSE 1 END
    LIMIT 1
  )
  UPDATE public.practices
  SET last_accessed = now(),
      link_visit_count = link_visit_count + 1
  WHERE id = (SELECT id FROM target_practice);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_patient_rating(org_name text, rating_value integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_practice_id uuid;
  recent_submissions integer;
  rate_limit_per_minute constant integer := 10;
BEGIN
  IF org_name IS NULL OR trim(org_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organisation name is required');
  END IF;

  IF rating_value < 1 OR rating_value > 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rating must be between 1 and 5');
  END IF;

  SELECT id INTO target_practice_id
  FROM public.practices
  WHERE (
      name_lowercase = lower(trim(org_name))
      OR upper(btrim(COALESCE(ods_code, ''))) = upper(btrim(org_name))
    )
    AND is_active = true
  ORDER BY
    CASE WHEN name_lowercase = lower(trim(org_name)) THEN 0 ELSE 1 END
  LIMIT 1;

  IF target_practice_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Practice not found');
  END IF;

  DELETE FROM public.patient_rating_submissions
  WHERE submitted_at < now() - interval '1 hour';

  SELECT count(*) INTO recent_submissions
  FROM public.patient_rating_submissions
  WHERE practice_id = target_practice_id
    AND submitted_at > now() - interval '1 minute';

  IF recent_submissions >= rate_limit_per_minute THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Too many ratings recently. Please try again in a minute.',
      'rate_limited', true
    );
  END IF;

  INSERT INTO public.patient_rating_submissions (practice_id)
  VALUES (target_practice_id);

  UPDATE public.practices
  SET patient_rating_count = patient_rating_count + 1,
      patient_rating_total = patient_rating_total + rating_value
  WHERE id = target_practice_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_patient_medication_cards(org_name text, requested_codes text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  practice_record public.practices%ROWTYPE;
  resolved_cards jsonb;
  placeholder_message constant text := 'No drug information available at your practice for this particular medication.';
BEGIN
  IF org_name IS NULL OR trim(org_name) = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  IF COALESCE(array_length(requested_codes, 1), 0) > 50 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT *
  INTO practice_record
  FROM public.practices
  WHERE (
      name_lowercase = lower(trim(org_name))
      OR upper(btrim(COALESCE(ods_code, ''))) = upper(btrim(org_name))
    )
    AND is_active = true
  ORDER BY
    CASE WHEN name_lowercase = lower(trim(org_name)) THEN 0 ELSE 1 END
  LIMIT 1;

  IF NOT FOUND OR NOT practice_record.medication_enabled THEN
    RETURN '[]'::jsonb;
  END IF;

  WITH deduped_codes AS (
    SELECT DISTINCT ON (trim(requested.code))
      trim(requested.code) AS code,
      requested.ord
    FROM unnest(COALESCE(requested_codes, ARRAY[]::text[]))
      WITH ORDINALITY AS requested(code, ord)
    WHERE trim(requested.code) <> ''
    ORDER BY trim(requested.code), requested.ord
  ),
  ordered_codes AS (
    SELECT code, ord
    FROM deduped_codes
    ORDER BY ord
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'state',
        CASE
          WHEN cards.source_type = 'custom' THEN 'custom'
          WHEN cards.source_type = 'global' THEN 'global'
          ELSE 'placeholder'
        END,
        'code', ordered_codes.code,
        'badge',
        CASE
          WHEN cards.source_type = 'custom' THEN COALESCE(cards.badge, medications.badge, 'GENERAL')
          WHEN cards.source_type = 'global' THEN COALESCE(medications.badge, 'GENERAL')
          WHEN medications.code IS NOT NULL THEN medications.badge
          ELSE 'GENERAL'
        END,
        'title',
        CASE
          WHEN cards.source_type = 'custom' THEN COALESCE(cards.title, medications.title, 'Medication information unavailable')
          WHEN cards.source_type = 'global' THEN COALESCE(medications.title, 'Medication information unavailable')
          WHEN medications.code IS NOT NULL THEN medications.title
          ELSE 'Medication information unavailable'
        END,
        'description',
        CASE
          WHEN cards.source_type = 'custom' THEN COALESCE(cards.description, placeholder_message)
          WHEN cards.source_type = 'global' THEN COALESCE(medications.description, placeholder_message)
          ELSE placeholder_message
        END,
        'category',
        CASE
          WHEN cards.source_type = 'custom' THEN COALESCE(cards.category, medications.category, 'Medication Information')
          WHEN cards.source_type = 'global' THEN COALESCE(medications.category, 'Medication Information')
          WHEN medications.code IS NOT NULL THEN COALESCE(medications.category, 'Medication Information')
          ELSE 'Medication Information'
        END,
        'keyInfoMode',
        CASE
          WHEN cards.source_type = 'custom' THEN COALESCE(cards.key_info_mode, medications.key_info_mode, 'do')
          WHEN cards.source_type = 'global' THEN COALESCE(medications.key_info_mode, 'do')
          ELSE 'do'
        END,
        'keyInfo',
        CASE
          WHEN cards.source_type = 'custom' THEN to_jsonb(COALESCE(cards.key_info, ARRAY[]::text[]))
          WHEN cards.source_type = 'global' THEN to_jsonb(COALESCE(medications.key_info, ARRAY[]::text[]))
          ELSE '[]'::jsonb
        END,
        'doKeyInfo',
        CASE
          WHEN cards.source_type = 'custom' THEN to_jsonb(
            CASE
              WHEN COALESCE(array_length(cards.do_key_info, 1), 0) > 0 THEN cards.do_key_info
              WHEN COALESCE(cards.key_info_mode, 'do') = 'do' THEN COALESCE(cards.key_info, ARRAY[]::text[])
              ELSE ARRAY[]::text[]
            END
          )
          WHEN cards.source_type = 'global' THEN to_jsonb(
            CASE
              WHEN COALESCE(array_length(medications.do_key_info, 1), 0) > 0 THEN medications.do_key_info
              WHEN COALESCE(medications.key_info_mode, 'do') = 'do' THEN COALESCE(medications.key_info, ARRAY[]::text[])
              ELSE ARRAY[]::text[]
            END
          )
          ELSE '[]'::jsonb
        END,
        'dontKeyInfo',
        CASE
          WHEN cards.source_type = 'custom' THEN to_jsonb(
            CASE
              WHEN COALESCE(array_length(cards.dont_key_info, 1), 0) > 0 THEN cards.dont_key_info
              WHEN cards.key_info_mode = 'dont' THEN COALESCE(cards.key_info, ARRAY[]::text[])
              ELSE ARRAY[]::text[]
            END
          )
          WHEN cards.source_type = 'global' THEN to_jsonb(
            CASE
              WHEN COALESCE(array_length(medications.dont_key_info, 1), 0) > 0 THEN medications.dont_key_info
              WHEN medications.key_info_mode = 'dont' THEN COALESCE(medications.key_info, ARRAY[]::text[])
              ELSE ARRAY[]::text[]
            END
          )
          ELSE '[]'::jsonb
        END,
        'generalKeyInfo',
        CASE
          WHEN cards.source_type = 'custom' THEN to_jsonb(COALESCE(cards.general_key_info, ARRAY[]::text[]))
          WHEN cards.source_type = 'global' THEN to_jsonb(COALESCE(medications.general_key_info, ARRAY[]::text[]))
          ELSE '[]'::jsonb
        END,
        'nhsLink',
        CASE
          WHEN cards.source_type = 'custom' THEN COALESCE(cards.nhs_link, '')
          WHEN cards.source_type = 'global' THEN COALESCE(medications.nhs_link, '')
          ELSE ''
        END,
        'trendLinks',
        CASE
          WHEN cards.source_type = 'custom' THEN COALESCE(cards.trend_links, '[]'::jsonb)
          WHEN cards.source_type = 'global' THEN COALESCE(medications.trend_links, '[]'::jsonb)
          ELSE '[]'::jsonb
        END,
        'sickDaysNeeded',
        CASE
          WHEN cards.source_type = 'custom' THEN COALESCE(cards.sick_days_needed, false)
          WHEN cards.source_type = 'global' THEN COALESCE(medications.sick_days_needed, false)
          ELSE false
        END,
        'reviewMonths',
        CASE
          WHEN cards.source_type = 'custom' THEN to_jsonb(cards.review_months)
          WHEN cards.source_type = 'global' THEN to_jsonb(medications.review_months)
          WHEN medications.code IS NOT NULL THEN to_jsonb(medications.review_months)
          ELSE 'null'::jsonb
        END,
        'contentReviewDate',
        CASE
          WHEN cards.source_type = 'custom' THEN cards.content_review_date
          WHEN cards.source_type = 'global' THEN medications.content_review_date
          WHEN medications.code IS NOT NULL THEN medications.content_review_date
          ELSE NULL
        END
      )
      ORDER BY ordered_codes.ord
    ),
    '[]'::jsonb
  )
  INTO resolved_cards
  FROM ordered_codes
  LEFT JOIN public.medications
    ON medications.code = ordered_codes.code
   AND medications.is_deleted = false
  LEFT JOIN public.practice_medication_cards cards
    ON cards.practice_id = practice_record.id
   AND cards.code = ordered_codes.code;

  RETURN resolved_cards;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_practice_card_templates(
  org_name text,
  requested_builder_type text,
  requested_template_ids text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  practice_record public.practices%ROWTYPE;
BEGIN
  IF org_name IS NULL OR trim(org_name) = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  IF requested_builder_type NOT IN ('healthcheck', 'screening', 'immunisation', 'ltc') THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT *
  INTO practice_record
  FROM public.practices
  WHERE (
      name_lowercase = lower(trim(org_name))
      OR upper(btrim(COALESCE(ods_code, ''))) = upper(btrim(org_name))
    )
    AND is_active = true
  ORDER BY
    CASE WHEN name_lowercase = lower(trim(org_name)) THEN 0 ELSE 1 END
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(rows.*))
    FROM (
      SELECT
        practice_id,
        builder_type,
        template_id,
        source_type,
        label,
        payload,
        disclaimer_version,
        accepted_at,
        accepted_by,
        updated_at,
        updated_by
      FROM public.practice_card_templates
      WHERE practice_id = practice_record.id
        AND builder_type = requested_builder_type
        AND template_id = ANY(requested_template_ids)
      ORDER BY template_id
    ) rows
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_local_resource_link_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_practice(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_patient_access(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_patient_rating(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_patient_medication_cards(text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_practice_card_templates(text, text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_practice_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_practice_member(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.validate_practice(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_patient_access(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_patient_rating(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_patient_medication_cards(text, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_practice_card_templates(text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_practice(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_patient_access(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_patient_rating(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_patient_medication_cards(text, text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_practice_card_templates(text, text, text[]) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_practice_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_practice_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_practice_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_practice_member(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_local_resource_link_audit_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_practice_medications_cache() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.can_bootstrap_admin(uuid,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.can_bootstrap_admin(uuid, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.can_bootstrap_admin(uuid, text) TO authenticated;
  END IF;
END $$;

DROP POLICY IF EXISTS "practices_insert_anyone" ON public.practices;
DROP POLICY IF EXISTS "practices_insert_admin" ON public.practices;
DROP POLICY IF EXISTS "practices_insert_authenticated" ON public.practices;

CREATE POLICY "practices_insert_admin"
  ON public.practices FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "practices_insert_authenticated"
  ON public.practices FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT public.is_admin()
    AND name IS NOT NULL
    AND trim(name) <> ''
    AND is_active = false
    AND auth_uid IS NULL
    AND selected_medications = '{}'::text[]
    AND medication_review_dates = '{}'::jsonb
    AND link_visit_count = 0
    AND patient_rating_count = 0
    AND patient_rating_total = 0
    AND last_accessed IS NULL
  );

NOTIFY pgrst, 'reload schema';
