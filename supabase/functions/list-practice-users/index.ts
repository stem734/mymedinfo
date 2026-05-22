import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { createServiceClient, corsHeaders, errorResponse, jsonResponse } from '../_shared/supabase-client.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    await assertAdmin(req.headers.get('Authorization'));
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('users')
      .select(`
        uid,
        email,
        name,
        is_active,
        global_role,
        memberships:practice_memberships(
          id,
          practice_id,
          user_uid,
          role,
          is_default,
          practice:practices(
            id,
            name,
            is_active
          )
        )
      `)
      .order('email');

    if (error) {
      console.error('List users error:', error);
      return errorResponse('Failed to load users', 500);
    }

    return jsonResponse({
      users: data || [],
    });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
