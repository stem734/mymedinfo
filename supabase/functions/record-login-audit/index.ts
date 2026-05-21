import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createServiceClient, getAuthUser, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const user = await getAuthUser(req.headers.get('Authorization'));
    const { portal, userAgent } = await req.json() as {
      portal?: 'admin' | 'practice';
      userAgent?: string;
    };

    const supabase = createServiceClient();

    const { data: appUserData } = await supabase
      .from('users')
      .select('uid, email, name, global_role')
      .eq('uid', user.id)
      .single();

    if (!appUserData) {
      return errorResponse('No linked account found for login audit', 404);
    }

    // Get client IP from headers
    const forwarded = req.headers.get('x-forwarded-for');
    const ipAddress = forwarded ? forwarded.split(',')[0].trim() : '';

    let auditRecord;

    if (portal === 'admin') {
      if (!appUserData.global_role) {
        return errorResponse('Administrator access required for admin login audit', 403);
      }

      auditRecord = {
        uid: user.id,
        email: appUserData.email,
        actor_type: 'admin' as const,
        actor_name: appUserData.name || appUserData.email,
        admin_role: appUserData.global_role,
        portal: 'admin' as const,
        user_agent: typeof userAgent === 'string' ? userAgent.slice(0, 500) : '',
        ip_address: ipAddress,
      };
    } else {
      const { data: membership } = await supabase
        .from('practice_memberships')
        .select('practice_id')
        .eq('user_uid', user.id)
        .limit(1)
        .maybeSingle();

      if (!membership) {
        return errorResponse('No linked practice membership found for login audit', 404);
      }

      auditRecord = {
        uid: user.id,
        email: typeof appUserData.email === 'string' ? appUserData.email : user.email || '',
        actor_type: 'practice' as const,
        actor_name: typeof appUserData.name === 'string' ? appUserData.name : 'Practice user',
        actor_id: user.id,
        portal: 'practice' as const,
        user_agent: typeof userAgent === 'string' ? userAgent.slice(0, 500) : '',
        ip_address: ipAddress,
      };
    }

    const { error } = await supabase.from('login_audit').insert(auditRecord);
    if (error) {
      console.error('Audit recording error:', error);
      return errorResponse('Failed to record audit', 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
