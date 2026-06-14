-- Add IP-based rate limiting for practice signups
ALTER TABLE practices ADD COLUMN signup_ip text DEFAULT 'unknown';

-- Create index for IP-based rate limiting queries
CREATE INDEX idx_practices_signup_ip_signed_up_at ON practices (signup_ip, signed_up_at DESC)
  WHERE signup_ip IS NOT NULL;
