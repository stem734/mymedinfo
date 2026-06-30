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
 */
export async function recordAndCheckRateLimit(
  supabase: SupabaseClient,
  config: RateLimitConfig,
): Promise<boolean> {
  const { eventType, email, ip, emailLimit, ipLimit, windowMs } = config;
  const now = Date.now();
  const since = new Date(now - windowMs).toISOString();
  const pruneBefore = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  // 1. Record attempt and prune old entries in parallel
  const [insertResult] = await Promise.all([
    supabase.from('rate_limit_events').insert({ event_type: eventType, email: email || null, ip_address: ip }),
    supabase.from('rate_limit_events').delete().lt('created_at', pruneBefore),
  ]);

  if (insertResult.error) {
    console.error('Rate limit record failed:', insertResult.error);
    return false;
  }

  // 2. Check counts (parallel)
  const queries = [
    supabase.from('rate_limit_events').select('id', { count: 'exact', head: true })
      .eq('event_type', eventType).eq('ip_address', ip).gte('created_at', since),
  ];
  if (email) {
    queries.push(
      supabase.from('rate_limit_events').select('id', { count: 'exact', head: true })
        .eq('event_type', eventType).eq('email', email).gte('created_at', since)
    );
  }

  const results = await Promise.all(queries);
  if ((results[0].count ?? 0) > ipLimit) return true;
  if (email && (results[1]?.count ?? 0) > emailLimit) return true;

  return false;
}
