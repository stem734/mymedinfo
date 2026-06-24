import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { getAppBaseUrl, getResendConfig, sendAuthLinkEmail } from '../_shared/auth-email.ts';
import { createServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts';
import { loadUserByEmail, normaliseEmail } from '../_shared/practice-user-management.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    await assertAdmin(req.headers.get('Authorization'));
    const { email, name } = await req.json();

    if (!email || typeof email !== 'string') {
      return errorResponse('Admin email is required');
    }

    const supabase = createServiceClient();
    const normalisedEmail = normaliseEmail(email);
    const displayName = typeof name === 'string' && name.trim() ? name.trim() : normalisedEmail;
    const existingUser = await loadUserByEmail(supabase, normalisedEmail);
    if (existingUser) {
      const { error: authError } = await supabase.auth.admin.updateUserById(existingUser.uid, {
        email: normalisedEmail,
        user_metadata: { name: displayName },
      });

      if (authError) {
        console.error('Auth update error:', authError);
        return errorResponse('Failed to update existing auth user', 500);
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({
          email: normalisedEmail,
          name: displayName,
          is_active: true,
          global_role: existingUser.global_role || 'admin',
          updated_at: new Date().toISOString(),
        })
        .eq('uid', existingUser.uid);

      if (updateError) {
        console.error('User update error:', updateError);
        return errorResponse('Failed to update user record', 500);
      }

      const emailConfig = getResendConfig();
      let emailSent = false;

      if (emailConfig) {
        const appBaseUrl = getAppBaseUrl();
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'recovery',
          email: normalisedEmail,
          options: { redirectTo: `${appBaseUrl}/reset-password` },
        });

        if (linkError) {
          console.error('Reset link generation error:', linkError);
          return errorResponse('Failed to generate reset link', 500);
        }

        const resetLink = linkData?.properties?.action_link || '';
        if (!resetLink) {
          return errorResponse('Failed to generate reset link', 500);
        }

        await sendAuthLinkEmail(emailConfig, {
          appBaseUrl,
          displayName,
          kind: 'adminReset',
          resetLink,
          to: normalisedEmail,
        });
        emailSent = true;
      }

      return jsonResponse({
        success: true,
        uid: existingUser.uid,
        created: false,
        emailSent,
      });
    }

    const emailConfig = getResendConfig();
    if (!emailConfig) {
      return errorResponse('Email service is not configured', 500);
    }

    // Create auth user with a random temp password
    const tempPassword = crypto.randomUUID() + crypto.randomUUID();
    const { data: userRecord, error: createError } = await supabase.auth.admin.createUser({
      email: normalisedEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: displayName },
    });

    if (createError || !userRecord.user) {
      console.error('Auth create error:', createError);
      return errorResponse('Failed to create auth user', 500);
    }

    const now = new Date().toISOString();
    const { error: insertError } = await supabase.from('users').insert({
      uid: userRecord.user.id,
      email: normalisedEmail,
      name: displayName,
      is_active: true,
      global_role: 'admin',
      created_at: now,
      updated_at: now,
    });

    if (insertError) {
      console.error('User record insertion error:', insertError);
      return errorResponse('Failed to create user record', 500);
    }

    const appBaseUrl = getAppBaseUrl();
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: normalisedEmail,
      options: { redirectTo: `${appBaseUrl}/reset-password` },
    });

    if (linkError) {
      console.error('Reset link generation error:', linkError);
      return errorResponse('Failed to generate reset link', 500);
    }

    const resetLink = linkData?.properties?.action_link || '';
    if (!resetLink) {
      return errorResponse('Failed to generate reset link', 500);
    }

    await sendAuthLinkEmail(emailConfig, {
      appBaseUrl,
      displayName,
      kind: 'adminSetup',
      resetLink,
      to: normalisedEmail,
    });

    return jsonResponse({ success: true, uid: userRecord.user.id, created: true });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
