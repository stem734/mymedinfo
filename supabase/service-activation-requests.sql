-- Service activation requests
-- Practice users request that an admin enables a service for their practice.

CREATE TABLE service_activation_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id     uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  practice_name   text NOT NULL,
  requested_by_uid   uuid NOT NULL,
  requested_by_email text NOT NULL,
  service         text NOT NULL CHECK (service IN ('medication', 'healthcheck', 'screening', 'immunisation', 'ltc')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
  requested_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- One pending/approved request per practice per service at a time
  UNIQUE (practice_id, service, status)
);

CREATE INDEX idx_service_requests_practice ON service_activation_requests (practice_id);
CREATE INDEX idx_service_requests_status   ON service_activation_requests (status);

ALTER TABLE service_activation_requests ENABLE ROW LEVEL SECURITY;

-- Practice members can insert requests only for globally available services,
-- and read their own practice's requests.
DROP POLICY IF EXISTS "practice_members_insert" ON service_activation_requests;
CREATE POLICY "practice_members_insert" ON service_activation_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_memberships
      WHERE user_uid = auth.uid()
        AND practice_id = service_activation_requests.practice_id
    )
    AND EXISTS (
      SELECT 1 FROM platform_config
      WHERE id = 1
        AND CASE service_activation_requests.service
          WHEN 'medication' THEN service_medication_enabled
          WHEN 'healthcheck' THEN service_healthcheck_enabled
          WHEN 'screening' THEN service_screening_enabled
          WHEN 'immunisation' THEN service_immunisation_enabled
          WHEN 'ltc' THEN service_ltc_enabled
          ELSE false
        END
    )
  );

CREATE POLICY "practice_members_select" ON service_activation_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM practice_memberships
      WHERE user_uid = auth.uid()
        AND practice_id = service_activation_requests.practice_id
    )
  );

-- Global admins have full access
CREATE POLICY "admins_all" ON service_activation_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()
        AND global_role IN ('owner', 'admin')
    )
  );

-- Ensure the shared updated_at trigger function exists (idempotent)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Auto-update updated_at
CREATE TRIGGER trg_service_requests_updated_at
  BEFORE UPDATE ON service_activation_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
