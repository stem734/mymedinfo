import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { getAppBaseUrl, getResendConfig, sendAuthLinkEmail } from '../_shared/auth-email.ts';
import { createServiceClient, corsHeaders, errorResponse, jsonResponse } from '../_shared/supabase-client.ts';
import {
  addPracticeMemberships,
  assertPracticeIdsExist,
  loadUserByEmail,
  normaliseEmail,
} from '../_shared/practice-user-management.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    await assertAdmin(req.headers.get('Authorization'));

    const body = await req.json() as {
      email?: string;
      practiceId?: string;
      name?: string;
    };

    if (!body.email || typeof body.email !== 'string' || !body.practiceId || typeof body.practiceId !== 'string') {
      return errorResponse('Email and practiceId are required');
    }

    const supabase = createServiceClient();
    const email = normaliseEmail(body.email);
    const displayName = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : email;
    const [practiceId] = await assertPracticeIdsExist(supabase, [body.practiceId]);
    const emailConfig = getResendConfig();

    const existingUser = await loadUserByEmail(supabase, email);
    if (existingUser) {
      const { error: authError } = await supabase.auth.admin.updateUserById(existingUser.uid, {
        email,
        user_metadata: { name: displayName },
      });

      if (authError) {
        console.error('Auth update error:', authError);
        return errorResponse('Failed to update existing auth user', 500);
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({
          email,
          name: displayName,
          is_active: true,
          global_role: existingUser.global_role || null,
          updated_at: new Date().toISOString(),
        })
        .eq('uid', existingUser.uid);

      if (updateError) {
        console.error('User update error:', updateError);
        return errorResponse('Failed to update user', 500);
      }

      await addPracticeMemberships(supabase, existingUser.uid, [practiceId], practiceId);

      await supabase
        .from('practices')
        .update({ contact_email: email, updated_at: new Date().toISOString() })
        .eq('id', practiceId);

      return jsonResponse({
        success: true,
        uid: existingUser.uid,
        created: false,
      });
    }

    if (!emailConfig) {
      return errorResponse('Email service is not configured', 500);
    }

    const tempPassword = crypto.randomUUID() + crypto.randomUUID();
    const { data: userRecord, error: createError } = await supabase.auth.admin.createUser({
      email,
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
      email,
      name: displayName,
      is_active: true,
      global_role: null,
      created_at: now,
      updated_at: now,
    });

    if (insertError) {
      console.error('User record insertion error:', insertError);
      return errorResponse('Failed to create user record', 500);
    }

    await addPracticeMemberships(supabase, userRecord.user.id, [practiceId], practiceId);

    const { error: contactError } = await supabase
      .from('practices')
      .update({ contact_email: email, updated_at: now })
      .eq('id', practiceId);

    if (contactError) {
      console.error('Practice contact update error:', contactError);
      return errorResponse('Failed to update practice contact email', 500);
    }

    const appBaseUrl = getAppBaseUrl();
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
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
      kind: 'practiceSetup',
      resetLink,
      to: email,
    });

    return jsonResponse({
      success: true,
      uid: userRecord.user.id,
      created: true,
    });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
