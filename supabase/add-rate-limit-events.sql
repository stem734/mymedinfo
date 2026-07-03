CREATE TABLE IF NOT EXISTS rate_limit_events (
  id bigserial PRIMARY KEY, event_type text NOT NULL, email text, ip_address text NOT NULL, created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_email ON rate_limit_events (email, event_type, created_at DESC) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_ip ON rate_limit_events (ip_address, event_type, created_at DESC);
ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate_limit_events_no_access" ON rate_limit_events FOR ALL TO anon, authenticated USING (false);
