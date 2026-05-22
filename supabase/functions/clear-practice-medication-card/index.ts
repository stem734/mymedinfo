import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertPracticeAccess } from '../_shared/assert-practice-access.ts';
import { createServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json() as {
      practiceId?: string;
      code?: string;
    };

    if (!body.practiceId || !body.code) {
      return errorResponse('practiceId and code are required');
    }

    const { userId } = await assertPracticeAccess(req.headers.get('Authorization'), body.practiceId);
    const supabase = createServiceClient();

    const { data: existingDoc } = await supabase
      .from('practice_medication_cards')
      .select('*')
      .eq('practice_id', body.practiceId)
      .eq('code', body.code)
      .maybeSingle();

    if (!existingDoc) {
      return jsonResponse({ success: true });
    }

    const { error: deleteError } = await supabase
      .from('practice_medication_cards')
      .delete()
      .eq('practice_id', body.practiceId)
      .eq('code', body.code);

    if (deleteError) {
      return errorResponse(`Failed to clear practice medication card: ${deleteError.message}`, 500);
    }

    await supabase.from('audit_log').insert({
      action: 'deleted',
      actor_uid: userId,
      code: body.code,
      timestamp: new Date().toISOString(),
      previous_state: existingDoc,
      new_state: null,
    });

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
