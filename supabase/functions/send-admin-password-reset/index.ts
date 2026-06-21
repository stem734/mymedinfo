import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { getAppBaseUrl, getResendConfig, sendAuthLinkEmail } from '../_shared/auth-email.ts';
import { createServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts';

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
    const emailConfig = getResendConfig();
    if (!emailConfig) {
      return errorResponse('Email service is not configured', 500);
    }

    // Get user record
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(uid);
    if (userError || !user?.email) {
      return errorResponse('Administrator does not have an email address', 404);
    }

    const { data: adminData } = await supabase
      .from('users')
      .select('name, global_role')
      .eq('uid', uid)
      .single();

    if (!adminData?.global_role) {
      return errorResponse('Administrator account not found', 404);
    }

    const displayName = adminData.name || user.email;

    // Generate password reset link only after confirming the target is an admin.
    const appBaseUrl = getAppBaseUrl();
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: user.email,
      options: { redirectTo: `${appBaseUrl}/reset-password` },
    });

    if (linkError) {
      console.error('Reset link generation error:', linkError);
      return errorResponse('Failed to generate password reset link', 500);
    }

    const resetLink = linkData?.properties?.action_link || '';

    if (!resetLink) {
      return errorResponse('Failed to generate password reset link', 500);
    }

    await sendAuthLinkEmail(emailConfig, {
      appBaseUrl,
      displayName,
      kind: 'adminReset',
      resetLink,
      to: user.email,
    });

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
