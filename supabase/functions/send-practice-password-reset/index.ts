import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { getAppBaseUrl, getEmailConfig, sendAuthLinkEmail } from '../_shared/auth-email.ts';
import { createServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    await assertAdmin(req.headers.get('Authorization'));
    const { uid } = await req.json() as { uid?: string };

    if (!uid) {
      return errorResponse('Practice user uid is required');
    }

    const supabase = createServiceClient();
    const emailConfig = getEmailConfig();
    if (!emailConfig) {
      return errorResponse('Email service is not configured', 500);
    }

    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(uid);
    if (userError || !user?.email) {
      return errorResponse('Practice user does not have an email address', 404);
    }

    const { data: practiceUser } = await supabase
      .from('users')
      .select('name')
      .eq('uid', uid)
      .single();

    const appBaseUrl = getAppBaseUrl();
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: user.email,
      options: { redirectTo: `${appBaseUrl}/reset-password` },
    });

    if (linkError) {
      return errorResponse(`Failed to generate password reset link: ${linkError.message}`, 500);
    }

    const resetLink = linkData?.properties?.action_link || '';
    const displayName = practiceUser?.name || user.email;

    if (!resetLink) {
      return errorResponse('Failed to generate password reset link', 500);
    }

    await sendAuthLinkEmail(emailConfig, {
      appBaseUrl,
      displayName,
      kind: 'practiceReset',
      resetLink,
      to: user.email,
    });

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
