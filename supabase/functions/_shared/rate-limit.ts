import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
export async function recordAndCheckRateLimit(supabase: SupabaseClient, headers: Headers, config: { eventType: string; email?: string; maxPerEmailPerHour?: number; maxPerIpPerHour?: number; }) {
  const ip = headers.get('cf-connecting-ip') || headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const since = new Date(Date.now() - 3600000).toISOString();
  await supabase.from('rate_limit_events').insert({ event_type: config.eventType, email: config.email, ip_address: ip });
  if (config.maxPerIpPerHour) {
    const { count } = await supabase.from('rate_limit_events').select('id', { count: 'exact', head: true }).eq('event_type', config.eventType).eq('ip_address', ip).gte('created_at', since);
    if ((count ?? 0) > config.maxPerIpPerHour) return { allowed: false };
  }
  if (config.email && config.maxPerEmailPerHour) {
    const { count } = await supabase.from('rate_limit_events').select('id', { count: 'exact', head: true }).eq('event_type', config.eventType).eq('email', config.email).gte('created_at', since);
    if ((count ?? 0) > config.maxPerEmailPerHour) return { allowed: false };
  }
  return { allowed: true };
}
