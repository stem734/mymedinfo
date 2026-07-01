-- =============================================================================
-- Migration: Add rate_limit_events table for tracking sensitive operations.
-- Used by Edge Functions to enforce email and IP-based rate limits.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id          bigserial PRIMARY KEY,
  event_type  text NOT NULL,
  email       text,
  ip_address  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for checking recent attempts by email
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_email_type_time
  ON public.rate_limit_events (email, event_type, created_at DESC)
  WHERE email IS NOT NULL;

-- Index for checking recent attempts by IP
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_ip_type_time
  ON public.rate_limit_events (ip_address, event_type, created_at DESC);

-- Index for garbage collection
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_created_at
  ON public.rate_limit_events (created_at);

-- Deny all client access via RLS. This table is for server-side use only.
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_limit_events_no_client_access" ON public.rate_limit_events;
CREATE POLICY "rate_limit_events_no_client_access"
  ON public.rate_limit_events FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
