-- Moves GP ratifier status to the global user profile.
-- Run this on existing Supabase projects before deploying the updated app.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_gp_ratifier boolean NOT NULL DEFAULT false;

ALTER TABLE medications
  ADD COLUMN IF NOT EXISTS is_gp_ratified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gp_ratified_at timestamptz,
  ADD COLUMN IF NOT EXISTS gp_ratified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE card_templates
  ADD COLUMN IF NOT EXISTS is_gp_ratified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gp_ratified_at timestamptz,
  ADD COLUMN IF NOT EXISTS gp_ratified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE practice_memberships
  DROP CONSTRAINT IF EXISTS practice_memberships_role_check;

-- Preserve any rows created while GP was modelled as a practice role by making
-- the user a global GP ratifier, then restore the practice access role.
UPDATE users
SET is_gp_ratifier = true
WHERE uid IN (
  SELECT user_uid
  FROM practice_memberships
  WHERE role = 'gp'
);

UPDATE practice_memberships
SET role = 'admin'
WHERE role = 'gp';

ALTER TABLE practice_memberships
  DROP COLUMN IF EXISTS is_gp;

ALTER TABLE practice_memberships
  ADD CONSTRAINT practice_memberships_role_check
  CHECK (role IN ('admin', 'editor'));

COMMIT;
