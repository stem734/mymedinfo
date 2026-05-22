import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { createServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { admin: actingAdmin, userId } = await assertAdmin(req.headers.get('Authorization'));
    const { uid } = await req.json();

    if (!uid) {
      return errorResponse('Administrator uid is required');
    }

    if (uid === userId) {
      return errorResponse('You cannot delete your own administrator account');
    }

    const supabase = createServiceClient();

    // Check target exists
    const { data: targetAdmin, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('uid', uid)
      .in('global_role', ['owner', 'admin'])
      .single();

    if (fetchError || !targetAdmin) {
      return errorResponse('Administrator account not found', 404);
    }

    // Permission check: only owner can delete
    if (targetAdmin.global_role === 'owner' || actingAdmin.global_role !== 'owner') {
      return errorResponse('Only the owner can delete administrator accounts', 403);
    }

    const { count: membershipCount, error: membershipCountError } = await supabase
      .from('practice_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('user_uid', uid);

    if (membershipCountError) {
      return errorResponse(`Failed to inspect practice memberships: ${membershipCountError.message}`, 500);
    }

    if ((membershipCount ?? 0) > 0) {
      const { error: demoteError } = await supabase
        .from('users')
        .update({
          global_role: null,
          updated_at: new Date().toISOString(),
        })
        .eq('uid', uid);

      if (demoteError) {
        return errorResponse(`Failed to remove global administrator access: ${demoteError.message}`, 500);
      }

      return jsonResponse({ success: true, demotedOnly: true });
    }

    const { error: authError } = await supabase.auth.admin.deleteUser(uid);
    if (authError) {
      return errorResponse(`Failed to delete auth user: ${authError.message}`, 500);
    }

    await supabase.from('users').delete().eq('uid', uid);

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
