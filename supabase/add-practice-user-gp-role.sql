-- Adds supplemental GP clinical-ratifier status to practice memberships.
-- Run this on existing Supabase projects before deploying the updated app.

BEGIN;

ALTER TABLE practice_memberships
  ADD COLUMN IF NOT EXISTS is_gp boolean NOT NULL DEFAULT false;

ALTER TABLE practice_memberships
  DROP CONSTRAINT IF EXISTS practice_memberships_role_check;

UPDATE practice_memberships
SET is_gp = true
WHERE role = 'gp';

UPDATE practice_memberships
SET role = 'admin'
WHERE role = 'gp';

ALTER TABLE practice_memberships
  ADD CONSTRAINT practice_memberships_role_check
  CHECK (role IN ('admin', 'editor'));

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

DROP POLICY IF EXISTS "practice_medication_cards_insert_member" ON practice_medication_cards;
DROP POLICY IF EXISTS "practice_medication_cards_update_member" ON practice_medication_cards;

CREATE POLICY "practice_medication_cards_insert_member"
  ON practice_medication_cards FOR INSERT
  TO authenticated
  WITH CHECK (is_practice_clinical_ratifier(practice_id));

CREATE POLICY "practice_medication_cards_update_member"
  ON practice_medication_cards FOR UPDATE
  TO authenticated
  USING (is_practice_clinical_ratifier(practice_id))
  WITH CHECK (is_practice_clinical_ratifier(practice_id));

DROP POLICY IF EXISTS "practice_card_templates_write_member" ON practice_card_templates;
DROP POLICY IF EXISTS "practice_card_templates_update_member" ON practice_card_templates;

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

COMMIT;
