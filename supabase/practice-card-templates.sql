-- Practice-specific customisations for non-medication patient card templates.
-- Medication cards keep using practice_medication_cards because they have a
-- richer schema and backwards-compatible patient resolver.

CREATE INDEX IF NOT EXISTS idx_practices_ods_code_upper
  ON public.practices (upper(btrim(ods_code)))
  WHERE ods_code IS NOT NULL AND btrim(ods_code) <> '';

ALTER TABLE public.practice_memberships
  ADD COLUMN IF NOT EXISTS is_gp boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS practice_card_templates (
  practice_id         uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  builder_type        text NOT NULL CHECK (builder_type IN ('healthcheck', 'screening', 'immunisation', 'ltc')),
  template_id         text NOT NULL,
  source_type         text NOT NULL DEFAULT 'custom' CHECK (source_type = 'custom'),
  label               text NOT NULL,
  payload             jsonb NOT NULL,
  disclaimer_version  text NOT NULL CHECK (length(trim(disclaimer_version)) > 0),
  accepted_at         timestamptz,
  accepted_by         uuid,
  updated_at          timestamptz DEFAULT now(),
  updated_by          uuid,
  PRIMARY KEY (practice_id, builder_type, template_id)
);

CREATE INDEX IF NOT EXISTS idx_practice_card_templates_practice_id
  ON practice_card_templates (practice_id);
CREATE INDEX IF NOT EXISTS idx_practice_card_templates_builder_type
  ON practice_card_templates (builder_type);

ALTER TABLE practice_card_templates ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_practice_clinical_ratifier(target_practice uuid)
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
      AND (memberships.is_gp = true OR memberships.role = 'gp')
      AND users.is_active = true
  );
$$;

DROP POLICY IF EXISTS "practice_card_templates_select_member" ON practice_card_templates;
DROP POLICY IF EXISTS "practice_card_templates_write_member" ON practice_card_templates;
DROP POLICY IF EXISTS "practice_card_templates_update_member" ON practice_card_templates;
DROP POLICY IF EXISTS "practice_card_templates_delete_member" ON practice_card_templates;

CREATE POLICY "practice_card_templates_select_member"
  ON practice_card_templates FOR SELECT
  TO authenticated
  USING (is_admin() OR is_practice_member(practice_id));

CREATE POLICY "practice_card_templates_write_member"
  ON practice_card_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    (is_admin() OR is_practice_clinical_ratifier(practice_id))
    AND EXISTS (
      SELECT 1
      FROM public.card_templates AS global_templates
      WHERE global_templates.builder_type = practice_card_templates.builder_type
        AND global_templates.template_id = practice_card_templates.template_id
        AND (
          (
            practice_card_templates.builder_type = 'healthcheck'
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_object_keys(COALESCE(practice_card_templates.payload->'variants', '{}'::jsonb)) AS submitted(result_code)
              WHERE NOT (COALESCE(global_templates.payload->'variants', '{}'::jsonb) ? submitted.result_code)
            )
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_each(COALESCE(practice_card_templates.payload->'variants', '{}'::jsonb)) AS submitted(result_code, variant)
              WHERE COALESCE(submitted.variant->>'resultCode', submitted.result_code) <>
                COALESCE((global_templates.payload->'variants'->submitted.result_code)->>'resultCode', submitted.result_code)
            )
          )
          OR (
            practice_card_templates.builder_type <> 'healthcheck'
            AND COALESCE(practice_card_templates.payload->>'id', practice_card_templates.template_id) =
              COALESCE(global_templates.payload->>'id', global_templates.template_id)
            AND COALESCE(practice_card_templates.payload->>'code', practice_card_templates.template_id) =
              COALESCE(global_templates.payload->>'code', global_templates.template_id)
          )
        )
    )
  );

CREATE POLICY "practice_card_templates_update_member"
  ON practice_card_templates FOR UPDATE
  TO authenticated
  USING (is_admin() OR is_practice_clinical_ratifier(practice_id))
  WITH CHECK (
    (is_admin() OR is_practice_clinical_ratifier(practice_id))
    AND EXISTS (
      SELECT 1
      FROM public.card_templates AS global_templates
      WHERE global_templates.builder_type = practice_card_templates.builder_type
        AND global_templates.template_id = practice_card_templates.template_id
        AND (
          (
            practice_card_templates.builder_type = 'healthcheck'
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_object_keys(COALESCE(practice_card_templates.payload->'variants', '{}'::jsonb)) AS submitted(result_code)
              WHERE NOT (COALESCE(global_templates.payload->'variants', '{}'::jsonb) ? submitted.result_code)
            )
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_each(COALESCE(practice_card_templates.payload->'variants', '{}'::jsonb)) AS submitted(result_code, variant)
              WHERE COALESCE(submitted.variant->>'resultCode', submitted.result_code) <>
                COALESCE((global_templates.payload->'variants'->submitted.result_code)->>'resultCode', submitted.result_code)
            )
          )
          OR (
            practice_card_templates.builder_type <> 'healthcheck'
            AND COALESCE(practice_card_templates.payload->>'id', practice_card_templates.template_id) =
              COALESCE(global_templates.payload->>'id', global_templates.template_id)
            AND COALESCE(practice_card_templates.payload->>'code', practice_card_templates.template_id) =
              COALESCE(global_templates.payload->>'code', global_templates.template_id)
          )
        )
    )
  );

CREATE POLICY "practice_card_templates_delete_member"
  ON practice_card_templates FOR DELETE
  TO authenticated
  USING (is_admin() OR is_practice_member(practice_id));

CREATE OR REPLACE FUNCTION resolve_practice_card_templates(
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

GRANT EXECUTE ON FUNCTION resolve_practice_card_templates TO anon;
GRANT EXECUTE ON FUNCTION resolve_practice_card_templates TO authenticated;
