import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { createServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { admin: actingAdmin, userId } = await assertAdmin(req.headers.get('Authorization'));
    const { uid } = await req.json() as { uid?: string };

    if (!uid) {
      return errorResponse('User uid is required');
    }

    if (uid === userId) {
      return errorResponse('You cannot delete your own user account');
    }

    const supabase = createServiceClient();
    const { data: targetPracticeUser, error: fetchError } = await supabase
      .from('users')
      .select('uid, global_role')
      .eq('uid', uid)
      .single();

    if (fetchError || !targetPracticeUser) {
      return errorResponse('User account not found', 404);
    }

    if (targetPracticeUser.global_role === 'owner') {
      return errorResponse('Owner accounts cannot be deleted from this action', 403);
    }

    if (targetPracticeUser.global_role && actingAdmin.global_role !== 'owner') {
      return errorResponse('Only the owner can delete users who also have global administrator access', 403);
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
