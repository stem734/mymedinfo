-- Platform-wide configuration singleton.
-- Stores global service availability flags that override per-practice settings.

CREATE TABLE IF NOT EXISTS platform_config (
  id integer PRIMARY KEY DEFAULT 1,
  service_medication_enabled boolean NOT NULL DEFAULT true,
  service_healthcheck_enabled boolean NOT NULL DEFAULT false,
  service_screening_enabled boolean NOT NULL DEFAULT false,
  service_immunisation_enabled boolean NOT NULL DEFAULT false,
  service_ltc_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_config_singleton CHECK (id = 1)
);

ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;

-- Everyone can read (practice portal needs to check global availability)
CREATE POLICY "platform_config_read_all" ON platform_config
  FOR SELECT USING (true);

-- Only active admins/owners can update
CREATE POLICY "platform_config_admin_update" ON platform_config
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()
        AND global_role IN ('owner', 'admin')
        AND is_active = true
    )
  );

-- Seed the single row (defaults: medication on, others off)
INSERT INTO platform_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
