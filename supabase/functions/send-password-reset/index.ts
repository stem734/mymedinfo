import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getAppBaseUrl, getEmailConfig, sendAuthLinkEmail } from '../_shared/auth-email.ts';
import { createServiceClient, corsHeaders, errorResponse, jsonResponse } from '../_shared/supabase-client.ts';
import { loadUserByEmail, normaliseEmail } from '../_shared/practice-user-management.ts';
import { getClientIp, recordAndCheckRateLimit } from '../_shared/rate-limit.ts';

/**
 * Public "forgot password" endpoint (no auth required).
 *
 * Enumeration-safe: always returns { success: true } regardless of whether the
 * address belongs to a real account, so the response cannot be used to probe
 * which emails exist. Any real failure is logged server-side only. A reset link
 * is only ever generated/sent for an address that already has an account, so
 * this cannot be used to email arbitrary recipients.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      email?: string;
      portal?: 'admin' | 'practice';
    };

    if (!body.email || typeof body.email !== 'string') {
      return errorResponse('Email is required');
    }

    const email = normaliseEmail(body.email);
    const supabase = createServiceClient();

    // Enforce rate limits (5 per email, 10 per IP per hour)
    const rateLimit = await recordAndCheckRateLimit(supabase, {
      eventType: 'password_reset',
      email,
      ip: getClientIp(req.headers),
      emailLimit: 5,
      ipLimit: 10,
      windowMinutes: 60,
    });

    if (!rateLimit.allowed) {
      console.warn('Password reset rejected: rate limit exceeded', { email, error: rateLimit.error });
      return jsonResponse({ success: true });
    }

    const emailConfig = getEmailConfig();

    // Do the real work only when an account exists and email is configured.
    // Everything here is best-effort; we never surface its outcome to the caller.
    try {
      const user = await loadUserByEmail(supabase, email);
      if (user && emailConfig) {
        const isAdmin = user.global_role === 'owner' || user.global_role === 'admin';
        const kind = body.portal === 'admin' || (body.portal !== 'practice' && isAdmin)
          ? 'adminReset'
          : 'practiceReset';

        const appBaseUrl = getAppBaseUrl();
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: `${appBaseUrl}/reset-password` },
        });

        const resetLink = linkData?.properties?.action_link || '';
        if (linkError) {
          console.error('Password reset link generation failed:', linkError);
        } else if (resetLink) {
          await sendAuthLinkEmail(emailConfig, {
            appBaseUrl,
            displayName: user.name || email,
            kind,
            resetLink,
            to: email,
          });
        }
      } else if (user && !emailConfig) {
        console.error('Password reset requested but email service is not configured (BREVO_API_KEY missing).');
      }
    } catch (innerError) {
      // Swallow: never reveal whether the address exists or that sending failed.
      console.error('Password reset processing error:', innerError);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    // Still generic — avoid leaking anything to the caller.
    return jsonResponse({ success: true });
  }
});
