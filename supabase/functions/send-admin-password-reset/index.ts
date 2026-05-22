import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { createServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts';
import { Resend } from 'https://esm.sh/resend@6';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    await assertAdmin(req.headers.get('Authorization'));
    const { uid } = await req.json();

    if (!uid) {
      return errorResponse('Administrator uid is required');
    }

    const supabase = createServiceClient();

    // Get user record
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(uid);
    if (userError || !user?.email) {
      return errorResponse('Administrator does not have an email address', 404);
    }

    // Generate password reset link
    const appBaseUrl = (Deno.env.get('APP_BASE_URL') || 'https://www.mymedinfo.info').replace(/\/$/, '');
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: user.email,
      options: { redirectTo: `${appBaseUrl}/reset-password` },
    });

    const resetLink = linkData?.properties?.action_link || '';

    // Send email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL');

    const { data: adminData } = await supabase
      .from('users')
      .select('name, global_role')
      .eq('uid', uid)
      .single();

    if (!adminData?.global_role) {
      return errorResponse('Administrator account not found', 404);
    }

    const displayName = adminData.name || user.email;

    if (resendApiKey && resendFromEmail && resetLink) {
      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: resendFromEmail,
        to: user.email,
        subject: 'Reset your MyMedInfo administrator password',
        text: `Hello ${displayName},\n\nUse this secure link to reset your MyMedInfo administrator password:\n${resetLink}\n\nIf you did not request this, you can ignore this email.\n`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #212b32;">
            <h2 style="color: #005eb8;">Reset your MyMedInfo password</h2>
            <p>Hello ${displayName},</p>
            <p>Use the button below to reset your MyMedInfo administrator password.</p>
            <p style="margin: 24px 0;">
              <a href="${resetLink}" style="background: #005eb8; color: white; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">Reset Password</a>
            </p>
            <p>If the button does not work, copy and paste this link into your browser:</p>
            <p><a href="${resetLink}">${resetLink}</a></p>
            <p>If you did not request this, you can ignore this email.</p>
          </div>
        `,
      });
    }

    return jsonResponse({ success: true, resetLink });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
