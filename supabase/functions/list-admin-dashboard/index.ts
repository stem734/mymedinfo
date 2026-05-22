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

    const [
      { data: practices, error: practicesError },
      { data: admins, error: adminsError },
      { data: loginAudit, error: loginAuditError },
    ] = await Promise.all([
      supabase.from('practices').select('*').order('name'),
      supabase
        .from('users')
        .select('uid, email, name, is_active, global_role')
        .in('global_role', ['owner', 'admin'])
        .order('email'),
      supabase.from('login_audit').select('*').order('created_at', { ascending: false }).limit(100),
    ]);

    if (practicesError) {
      return errorResponse(`Failed to load practices: ${practicesError.message}`, 500);
    }

    if (adminsError) {
      return errorResponse(`Failed to load administrators: ${adminsError.message}`, 500);
    }

    if (loginAuditError) {
      return errorResponse(`Failed to load login audit: ${loginAuditError.message}`, 500);
    }

    return jsonResponse({
      practices: practices || [],
      admins: admins || [],
      loginAudit: loginAudit || [],
    });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
