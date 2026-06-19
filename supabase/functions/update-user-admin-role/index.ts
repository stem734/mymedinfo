import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { createServiceClient, corsHeaders, errorResponse, jsonResponse } from '../_shared/supabase-client.ts';

type RequestedGlobalRole = 'admin' | null;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { admin: actingAdmin, userId } = await assertAdmin(req.headers.get('Authorization'));
    const body = await req.json() as {
      uid?: string;
      globalRole?: RequestedGlobalRole;
    };

    if (!body.uid || typeof body.uid !== 'string') {
      return errorResponse('User uid is required');
    }

    if (body.globalRole !== 'admin' && body.globalRole !== null) {
      return errorResponse('globalRole must be "admin" or null');
    }

    if (body.uid === userId && body.globalRole === null) {
      return errorResponse('You cannot remove your own administrator access');
    }

    const supabase = createServiceClient();
    const { data: targetUser, error: fetchError } = await supabase
      .from('users')
      .select('uid, email, global_role')
      .eq('uid', body.uid)
      .single();

    if (fetchError || !targetUser) {
      return errorResponse('User account not found', 404);
    }

    if (targetUser.global_role === 'owner') {
      return errorResponse('The owner account cannot be demoted or changed by this action', 403);
    }

    if (body.globalRole === null && targetUser.global_role === 'admin' && actingAdmin.global_role !== 'owner') {
      return errorResponse('Only the owner can remove administrator access', 403);
    }

    const nextRole = body.globalRole;
    const updatePayload: {
      global_role: RequestedGlobalRole;
      updated_at: string;
      is_active?: boolean;
    } = {
      global_role: nextRole,
      updated_at: new Date().toISOString(),
    };

    if (nextRole === 'admin') {
      updatePayload.is_active = true;
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('uid', body.uid);

    if (updateError) {
      return errorResponse(`Failed to update administrator access: ${updateError.message}`, 500);
    }

    return jsonResponse({
      success: true,
      uid: body.uid,
      globalRole: nextRole,
      changed: targetUser.global_role !== nextRole,
    });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
