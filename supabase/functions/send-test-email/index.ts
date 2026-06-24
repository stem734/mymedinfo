import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { getAppBaseUrl, getEmailConfig, sendEmail } from '../_shared/auth-email.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/supabase-client.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { admin } = await assertAdmin(req.headers.get('Authorization'));
    const body = await req.json().catch(() => ({})) as { to?: string };

    const requestedTo = typeof body.to === 'string' ? body.to.trim().toLowerCase() : '';
    const to = requestedTo || admin.email;
    if (!to) {
      return errorResponse('No recipient email address available');
    }

    const emailConfig = getEmailConfig();
    if (!emailConfig) {
      // Return directly (not via errorResponse, which masks 5xx messages) so the
      // admin sees the actual reason in the test button result.
      return jsonResponse({ error: 'Email service is not configured. Set BREVO_API_KEY as a Supabase Edge Function secret.' }, 503);
    }

    const appBaseUrl = getAppBaseUrl();

    try {
      await sendEmail(emailConfig, {
        to,
        toName: admin.name || to,
        subject: 'MyMedInfo test email',
        text: `This is a test email from MyMedInfo, sent via Brevo.\n\nIf you received this, transactional email delivery is working correctly.\n\nSent from ${appBaseUrl}\n`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #212b32;">
            <h2 style="color: #005eb8;">MyMedInfo test email</h2>
            <p>This is a test email sent via <strong>Brevo</strong>.</p>
            <p>If you can read this, transactional email delivery is working correctly.</p>
            <p style="color: #4c6272; font-size: 0.9em;">Sent from ${appBaseUrl} using the sender <strong>${emailConfig.fromEmail}</strong>.</p>
          </div>
        `,
      });
    } catch (sendError) {
      // Surface the provider's error message so the admin can diagnose (e.g.
      // unauthorised sender, invalid key). These messages contain no secrets.
      const message = sendError instanceof Error ? sendError.message : 'Failed to send test email';
      return jsonResponse({ error: message }, 502);
    }

    return jsonResponse({ success: true, to, from: emailConfig.fromEmail });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
