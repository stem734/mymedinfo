import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getAppBaseUrl, getEmailConfig, sendAuthLinkEmail } from '../_shared/auth-email.ts';
import { createServiceClient, corsHeaders, errorResponse, jsonResponse } from '../_shared/supabase-client.ts';
import { loadUserByEmail, normaliseEmail } from '../_shared/practice-user-management.ts';
import { recordAndCheckRateLimit } from '../_shared/rate-limit.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({})) as { email?: string; portal?: 'admin' | 'practice' };
    if (!body.email || typeof body.email !== 'string') return errorResponse('Email is required');

    const email = normaliseEmail(body.email);
    const supabase = createServiceClient();
    const clientIp = req.headers.get('cf-connecting-ip') ||
                    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                    'unknown';

    if (await recordAndCheckRateLimit(supabase, {
      eventType: 'password_reset',
      email,
      ip: clientIp,
      emailLimit: 5,
      ipLimit: 10,
      windowMs: 3600000,
    })) return jsonResponse({ success: true });

    const emailConfig = getEmailConfig();
    try {
      const user = await loadUserByEmail(supabase, email);
      if (user && emailConfig) {
        const isAdmin = user.global_role === 'owner' || user.global_role === 'admin';
        const kind = body.portal === 'admin' || (body.portal !== 'practice' && isAdmin) ? 'adminReset' : 'practiceReset';
        const appBaseUrl = getAppBaseUrl();
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: `${appBaseUrl}/reset-password` },
        });

        const resetLink = linkData?.properties?.action_link || '';
        if (linkError) {
          console.error('Reset link failed:', linkError);
        } else if (resetLink) {
          await sendAuthLinkEmail(emailConfig, { appBaseUrl, displayName: user.name || email, kind, resetLink, to: email });
        }
      } else if (user && !emailConfig) {
        console.error('Email service not configured (BREVO_API_KEY missing).');
      }
    } catch (innerError) {
      console.error('Processing error:', innerError);
    }
    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Unexpected error:', err);
    return jsonResponse({ success: true });
  }
});
