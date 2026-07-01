import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface RateLimitResult {
  allowed: boolean;
  error?: string;
}

export interface RateLimitOptions {
  eventType: string;
  email?: string;
  ip: string;
  emailLimit: number;
  ipLimit: number;
  windowMinutes: number;
}

/**
 * Records an attempt and checks if it exceeds the specified rate limits.
 * Multi-dimensional: checks both email and IP address.
 */
export async function recordAndCheckRateLimit(
  supabase: SupabaseClient,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { eventType, email, ip, emailLimit, ipLimit, windowMinutes } = options;
  const now = new Date();
  const since = new Date(now.getTime() - windowMinutes * 60 * 1000).toISOString();

  // 1. Opportunistic garbage collection (older than 24h)
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from('rate_limit_events')
    .delete()
    .lt('created_at', oneDayAgo);

  // 2. Record this attempt
  const { error: insertError } = await supabase.from('rate_limit_events').insert({
    event_type: eventType,
    email: email || null,
    ip_address: ip,
  });

  if (insertError) {
    console.error('Rate limit record error:', insertError);
    // Continue anyway; don't block users if the audit log is failing
  }

  // 3. Check IP-based limit
  const { count: ipCount, error: ipError } = await supabase
    .from('rate_limit_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', eventType)
    .eq('ip_address', ip)
    .gte('created_at', since);

  if (ipError) {
    console.error('Rate limit IP check error:', ipError);
  } else if ((ipCount ?? 0) > ipLimit) {
    return {
      allowed: false,
      error: `Too many attempts from this IP address. Please try again in ${windowMinutes} minutes.`,
    };
  }

  // 4. Check email-based limit (if email provided)
  if (email) {
    const { count: emailCount, error: emailError } = await supabase
      .from('rate_limit_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', eventType)
      .eq('email', email)
      .gte('created_at', since);

    if (emailError) {
      console.error('Rate limit email check error:', emailError);
    } else if ((emailCount ?? 0) > emailLimit) {
      return {
        allowed: false,
        error: `Too many attempts for this email address. Please try again in ${windowMinutes} minutes.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Extract client IP address from standard headers.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    headers.get('x-client-ip') ||
    'unknown'
  );
}
