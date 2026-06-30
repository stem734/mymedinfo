import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface RateLimitConfig {
  eventType: string;
  email?: string;
  ip: string;
  emailLimit: number;
  ipLimit: number;
  windowMs: number;
}

/**
 * Records a request attempt and checks if it exceeds the rate limit.
 * Returns true if the limit is exceeded.
 * NOTE: rate_limit_events table should be periodically pruned of old entries.
 */
export async function recordAndCheckRateLimit(
  supabase: SupabaseClient,
  config: RateLimitConfig,
): Promise<boolean> {
  const { eventType, email, ip, emailLimit, ipLimit, windowMs } = config;
  const since = new Date(Date.now() - windowMs).toISOString();

  // Record current attempt
  const { error: insertError } = await supabase.from('rate_limit_events').insert({
    event_type: eventType,
    email: email || null,
    ip_address: ip,
  });

  if (insertError) {
    console.error('Rate limit record failed:', insertError);
    return false;
  }

  // IP-based check
  const { count: ipCount } = await supabase
    .from('rate_limit_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', eventType)
    .eq('ip_address', ip)
    .gte('created_at', since);

  if ((ipCount ?? 0) > ipLimit) return true;

  // Email-based check
  if (email) {
    const { count: emailCount } = await supabase
      .from('rate_limit_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', eventType)
      .eq('email', email)
      .gte('created_at', since);

    if ((emailCount ?? 0) > emailLimit) return true;
  }

  return false;
}
