import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { createServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts';
import {
  assertNoOtherUserWithEmail,
  assertPracticeIdsExist,
  normaliseEmail,
  normalisePracticeRole,
  replacePracticeMemberships,
} from '../_shared/practice-user-management.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { admin: actingAdmin } = await assertAdmin(req.headers.get('Authorization'));

    const body = await req.json() as {
      uid?: string;
      email?: string;
      name?: string;
      isActive?: boolean;
      role?: string;
      isGpRatifier?: boolean;
      practiceIds?: string[];
      defaultPracticeId?: string;
    };

    if (!body.uid || !body.email || typeof body.email !== 'string') {
      return errorResponse('uid and email are required');
    }

    const supabase = createServiceClient();
    const email = normaliseEmail(body.email);
    const displayName = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : email;
    const role = normalisePracticeRole(body.role);
    const requestedPracticeIds = Array.isArray(body.practiceIds) ? body.practiceIds : [];

    const { data: targetPracticeUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('uid', body.uid)
      .single();

    if (fetchError || !targetPracticeUser) {
      return errorResponse('User account not found', 404);
    }

    // Permission check: only owner can modify privileged users or change GP ratifier status.
    const isTargetPrivileged = !!(targetPracticeUser.global_role || targetPracticeUser.is_gp_ratifier);
    const isChangingPrivilegedFields = body.isGpRatifier !== undefined && body.isGpRatifier !== targetPracticeUser.is_gp_ratifier;

    if ((isTargetPrivileged || isChangingPrivilegedFields) && actingAdmin.global_role !== 'owner') {
      return errorResponse('Only the owner can modify privileged users or change GP ratifier status', 403);
    }

    if (requestedPracticeIds.length === 0 && !targetPracticeUser.global_role) {
      return errorResponse('At least one practice must be assigned');
    }

    const practiceIds = requestedPracticeIds.length > 0
      ? await assertPracticeIdsExist(supabase, requestedPracticeIds)
      : [];

    await assertNoOtherUserWithEmail(supabase, email, body.uid);

    const { error: authError } = await supabase.auth.admin.updateUserById(body.uid, {
      email,
      user_metadata: { name: displayName },
      ban_duration: body.isActive === false ? '876600h' : body.isActive === true ? 'none' : undefined, // 876600h is 100 years
    });

    if (authError) {
      return errorResponse(`Failed to update auth user: ${authError.message}`, 500);
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({
        email,
        name: displayName,
        is_active: body.isActive === false ? false : body.isActive === true ? true : targetPracticeUser.is_active,
        global_role: targetPracticeUser.global_role || null,
        is_gp_ratifier: body.isGpRatifier === false ? false : body.isGpRatifier === true ? true : targetPracticeUser.is_gp_ratifier,
        updated_at: new Date().toISOString(),
      })
      .eq('uid', body.uid);

    if (updateError) {
      return errorResponse(`Failed to update user: ${updateError.message}`, 500);
    }

    await replacePracticeMemberships(supabase, body.uid, practiceIds, body.defaultPracticeId, role);

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
