import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { createServiceClient, corsHeaders, errorResponse, jsonResponse } from '../_shared/supabase-client.ts';

type RequestedGlobalRole = 'owner' | 'admin' | null;

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

    if (body.globalRole !== 'owner' && body.globalRole !== 'admin' && body.globalRole !== null) {
      return errorResponse('globalRole must be "owner", "admin", or null');
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

    if (body.globalRole === 'owner' && actingAdmin.global_role !== 'owner') {
      return errorResponse('Only an owner can promote another user to owner', 403);
    }

    if (body.globalRole === null && targetUser.global_role === 'admin' && actingAdmin.global_role !== 'owner') {
      return errorResponse('Only the owner can remove administrator access', 403);
    }

    if (targetUser.global_role === 'owner' && body.globalRole !== 'owner') {
      if (actingAdmin.global_role !== 'owner') {
        return errorResponse('Only an owner can change owner access', 403);
      }

      const { count: ownerCount, error: ownerCountError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('global_role', 'owner');

      if (ownerCountError) {
        return errorResponse(`Failed to inspect owner accounts: ${ownerCountError.message}`, 500);
      }

      if ((ownerCount ?? 0) <= 1) {
        return errorResponse('At least one owner account must remain', 403);
      }
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

    if (nextRole === 'owner' || nextRole === 'admin') {
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
