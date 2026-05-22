import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { Resend } from 'https://esm.sh/resend@6';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { createServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts';
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
      name?: string;
      practiceIds?: string[];
      defaultPracticeId?: string;
    };

    if (!body.email || typeof body.email !== 'string') {
      return errorResponse('Practice user email is required');
    }

    const supabase = createServiceClient();
    const email = normaliseEmail(body.email);
    const displayName = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : email;
    const practiceIds = await assertPracticeIdsExist(supabase, Array.isArray(body.practiceIds) ? body.practiceIds : []);

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

      await addPracticeMemberships(supabase, existingUser.uid, practiceIds, body.defaultPracticeId);

      return jsonResponse({
        success: true,
        uid: existingUser.uid,
        created: false,
        resetLink: '',
      });
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

    await addPracticeMemberships(supabase, userRecord.user.id, practiceIds, body.defaultPracticeId);

    const appBaseUrl = (Deno.env.get('APP_BASE_URL') || 'https://www.mymedinfo.info').replace(/\/$/, '');
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
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL');

    if (resendApiKey && resendFromEmail && resetLink) {
      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: resendFromEmail,
        to: email,
        subject: 'Set up your MyMedInfo practice account',
        text: `Hello ${displayName},\n\nYour MyMedInfo practice account has been created. Set your password using this secure link:\n${resetLink}\n\nAfter setting your password, sign in at ${appBaseUrl}/practice\n`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #212b32;">
            <h2 style="color: #005eb8;">Welcome to MyMedInfo</h2>
            <p>Hello ${displayName},</p>
            <p>Your MyMedInfo practice account has been created. Use the button below to set your password.</p>
            <p style="margin: 24px 0;">
              <a href="${resetLink}" style="background: #005eb8; color: white; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">Set Your Password</a>
            </p>
            <p>If the button does not work, copy and paste this link into your browser:</p>
            <p><a href="${resetLink}">${resetLink}</a></p>
            <p>After setting your password, sign in at <a href="${appBaseUrl}/practice">${appBaseUrl}/practice</a>.</p>
          </div>
        `,
      });
    }

    return jsonResponse({
      success: true,
      uid: userRecord.user.id,
      created: true,
      resetLink,
    });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
