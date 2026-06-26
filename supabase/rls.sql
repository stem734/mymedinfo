-- =============================================================================
-- MyMedInfo: Row Level Security policies for Supabase
-- Replaces Firestore security rules (firestore.rules)
-- Run this AFTER schema.sql in the Supabase SQL Editor.
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_template_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_medication_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS firebase_uid_map ENABLE ROW LEVEL SECURITY;

-- ===================
-- Helper function: is the current user an active admin?
-- ===================
CREATE OR REPLACE FUNCTION is_admin()
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

-- ===================
-- Helper function: is the current user an active app user?
-- ===================
CREATE OR REPLACE FUNCTION is_practice_user()
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

-- ===================
-- Helper function: does the current user belong to a practice?
-- ===================
CREATE OR REPLACE FUNCTION is_practice_member(target_practice uuid)
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

-- =============================================================================
-- PRACTICES policies
-- =============================================================================
DROP POLICY IF EXISTS "practices_insert_anyone" ON practices;
DROP POLICY IF EXISTS "practices_insert_admin" ON practices;
DROP POLICY IF EXISTS "practices_insert_authenticated" ON practices;
DROP POLICY IF EXISTS "practices_select_admin" ON practices;
DROP POLICY IF EXISTS "practices_select_member" ON practices;
DROP POLICY IF EXISTS "practices_select_own" ON practices;
DROP POLICY IF EXISTS "practices_update_admin" ON practices;
DROP POLICY IF EXISTS "practices_update_own" ON practices;
DROP POLICY IF EXISTS "practices_delete_admin" ON practices;

-- Admins can insert any practice (including active ones created from the admin dashboard).
CREATE POLICY "practices_insert_admin"
  ON practices FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- Non-admin authenticated users can only self-register a blank inactive practice.
-- Prevents anonymous spam and pre-population of sensitive fields.
CREATE POLICY "practices_insert_authenticated"
  ON practices FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT is_admin()
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

CREATE POLICY "practices_select_admin"
  ON practices FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "practices_select_member"
  ON practices FOR SELECT
  TO authenticated
  USING (is_practice_member(id));

CREATE POLICY "practices_update_admin"
  ON practices FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "practices_delete_admin"
  ON practices FOR DELETE
  TO authenticated
  USING (is_admin());

-- =============================================================================
-- MEDICATIONS policies
-- =============================================================================
DROP POLICY IF EXISTS "medications_select_anyone" ON medications;
DROP POLICY IF EXISTS "medications_select_admin" ON medications;
DROP POLICY IF EXISTS "medications_select_active" ON medications;
DROP POLICY IF EXISTS "medications_insert_admin" ON medications;
DROP POLICY IF EXISTS "medications_update_admin" ON medications;
DROP POLICY IF EXISTS "medications_delete_admin" ON medications;

-- Admins can see all medications, including soft-deleted ones (needed for audit/restore).
CREATE POLICY "medications_select_admin"
  ON medications FOR SELECT
  TO authenticated
  USING (is_admin());

-- Everyone else (practice users and anonymous patients) sees only active medications.
CREATE POLICY "medications_select_active"
  ON medications FOR SELECT
  TO authenticated, anon
  USING (is_deleted = false);

CREATE POLICY "medications_insert_admin"
  ON medications FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "medications_update_admin"
  ON medications FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "medications_delete_admin"
  ON medications FOR DELETE
  TO authenticated
  USING (is_admin());

-- =============================================================================
-- CARD_TEMPLATES policies
-- =============================================================================
DROP POLICY IF EXISTS "card_templates_select_anyone" ON card_templates;
DROP POLICY IF EXISTS "card_templates_insert_admin" ON card_templates;
DROP POLICY IF EXISTS "card_templates_update_admin" ON card_templates;
DROP POLICY IF EXISTS "card_templates_delete_admin" ON card_templates;

CREATE POLICY "card_templates_select_anyone"
  ON card_templates FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "card_templates_insert_admin"
  ON card_templates FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "card_templates_update_admin"
  ON card_templates FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "card_templates_delete_admin"
  ON card_templates FOR DELETE
  TO authenticated
  USING (is_admin());

-- =============================================================================
-- CARD_TEMPLATE_REVISIONS policies
-- =============================================================================
DROP POLICY IF EXISTS "card_template_revisions_select_admin" ON card_template_revisions;
DROP POLICY IF EXISTS "card_template_revisions_insert_admin" ON card_template_revisions;

CREATE POLICY "card_template_revisions_select_admin"
  ON card_template_revisions FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "card_template_revisions_insert_admin"
  ON card_template_revisions FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- =============================================================================
-- USERS policies
-- =============================================================================
DROP POLICY IF EXISTS "users_select_admin" ON users;
DROP POLICY IF EXISTS "users_select_self" ON users;
DROP POLICY IF EXISTS "users_insert_admin" ON users;
DROP POLICY IF EXISTS "users_update_admin" ON users;
DROP POLICY IF EXISTS "users_delete_admin" ON users;

CREATE POLICY "users_select_admin"
  ON users FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "users_select_self"
  ON users FOR SELECT
  TO authenticated
  USING (uid = auth.uid());

CREATE POLICY "users_insert_admin"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "users_update_admin"
  ON users FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "users_delete_admin"
  ON users FOR DELETE
  TO authenticated
  USING (is_admin());

-- =============================================================================
-- PRACTICE_MEMBERSHIPS policies
-- =============================================================================
DROP POLICY IF EXISTS "practice_memberships_select_admin" ON practice_memberships;
DROP POLICY IF EXISTS "practice_memberships_select_self" ON practice_memberships;
DROP POLICY IF EXISTS "practice_memberships_insert_admin" ON practice_memberships;
DROP POLICY IF EXISTS "practice_memberships_update_admin" ON practice_memberships;
DROP POLICY IF EXISTS "practice_memberships_delete_admin" ON practice_memberships;

CREATE POLICY "practice_memberships_select_admin"
  ON practice_memberships FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "practice_memberships_select_self"
  ON practice_memberships FOR SELECT
  TO authenticated
  USING (user_uid = auth.uid());

CREATE POLICY "practice_memberships_insert_admin"
  ON practice_memberships FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "practice_memberships_update_admin"
  ON practice_memberships FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "practice_memberships_delete_admin"
  ON practice_memberships FOR DELETE
  TO authenticated
  USING (is_admin());

-- =============================================================================
-- PRACTICE_MEDICATION_CARDS policies
-- =============================================================================
DROP POLICY IF EXISTS "practice_medication_cards_select_admin" ON practice_medication_cards;
DROP POLICY IF EXISTS "practice_medication_cards_select_member" ON practice_medication_cards;
DROP POLICY IF EXISTS "practice_medication_cards_insert_admin" ON practice_medication_cards;
DROP POLICY IF EXISTS "practice_medication_cards_insert_member" ON practice_medication_cards;
DROP POLICY IF EXISTS "practice_medication_cards_update_admin" ON practice_medication_cards;
DROP POLICY IF EXISTS "practice_medication_cards_update_member" ON practice_medication_cards;
DROP POLICY IF EXISTS "practice_medication_cards_delete_admin" ON practice_medication_cards;
DROP POLICY IF EXISTS "practice_medication_cards_delete_member" ON practice_medication_cards;

CREATE POLICY "practice_medication_cards_select_admin"
  ON practice_medication_cards FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "practice_medication_cards_select_member"
  ON practice_medication_cards FOR SELECT
  TO authenticated
  USING (is_practice_member(practice_id));

CREATE POLICY "practice_medication_cards_insert_admin"
  ON practice_medication_cards FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "practice_medication_cards_insert_member"
  ON practice_medication_cards FOR INSERT
  TO authenticated
  WITH CHECK (is_practice_member(practice_id));

CREATE POLICY "practice_medication_cards_update_admin"
  ON practice_medication_cards FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "practice_medication_cards_update_member"
  ON practice_medication_cards FOR UPDATE
  TO authenticated
  USING (is_practice_member(practice_id))
  WITH CHECK (is_practice_member(practice_id));

CREATE POLICY "practice_medication_cards_delete_admin"
  ON practice_medication_cards FOR DELETE
  TO authenticated
  USING (is_admin());

CREATE POLICY "practice_medication_cards_delete_member"
  ON practice_medication_cards FOR DELETE
  TO authenticated
  USING (is_practice_member(practice_id));

-- =============================================================================
-- LOGIN_AUDIT policies
-- =============================================================================
DROP POLICY IF EXISTS "login_audit_insert_authenticated" ON login_audit;
DROP POLICY IF EXISTS "login_audit_select_admin" ON login_audit;

CREATE POLICY "login_audit_insert_authenticated"
  ON login_audit FOR INSERT
  TO authenticated
  WITH CHECK (uid = auth.uid());

CREATE POLICY "login_audit_select_admin"
  ON login_audit FOR SELECT
  TO authenticated
  USING (is_admin());

-- =============================================================================
-- AUDIT_LOG policies
-- =============================================================================
DROP POLICY IF EXISTS "audit_log_select_admin" ON audit_log;
DROP POLICY IF EXISTS "audit_log_insert_admin" ON audit_log;

CREATE POLICY "audit_log_select_admin"
  ON audit_log FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "audit_log_insert_admin"
  ON audit_log FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- =============================================================================
-- FIREBASE_UID_MAP policies
-- =============================================================================
-- Internal migration mapping only. Service-role/admin SQL can still use it, but
-- browser clients should never read or mutate Firebase-to-Supabase UID mappings.
DROP POLICY IF EXISTS "firebase_uid_map_no_client_access" ON firebase_uid_map;

CREATE POLICY "firebase_uid_map_no_client_access"
  ON firebase_uid_map FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
