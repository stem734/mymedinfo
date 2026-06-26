import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertClinicalRatifier } from '../_shared/assert-practice-access.ts';
import { GLOBAL_TEMPLATE_DISCLAIMER_VERSION } from '../_shared/practice-card-constants.ts';
import { createServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json() as {
      practiceId?: string;
      code?: string;
      disclaimerAccepted?: boolean;
    };

    if (!body.practiceId || !body.code) {
      return errorResponse('practiceId and code are required');
    }

    if (body.disclaimerAccepted !== true) {
      return errorResponse('The global template disclaimer must be accepted');
    }

    let userId: string;
    try {
      ({ userId } = await assertClinicalRatifier(req.headers.get('Authorization'), body.practiceId));
    } catch (accessError) {
      return errorResponse(accessError instanceof Error ? accessError.message : 'Practice access required', 403);
    }

    const supabase = createServiceClient();

    const { data: medication, error: medicationError } = await supabase
      .from('medications')
      .select('code')
      .eq('code', body.code)
      .eq('is_deleted', false)
      .single();

    if (medicationError || !medication) {
      return errorResponse('Medication code not found in the global library', 404);
    }

    const { data: existingDoc } = await supabase
      .from('practice_medication_cards')
      .select('*')
      .eq('practice_id', body.practiceId)
      .eq('code', body.code)
      .maybeSingle();

    const now = new Date().toISOString();
    const nextDoc = {
      practice_id: body.practiceId,
      code: body.code,
      source_type: 'global',
      title: null,
      description: null,
      badge: null,
      category: null,
      key_info: null,
      nhs_link: null,
      trend_links: null,
      sick_days_needed: null,
      review_months: null,
      content_review_date: null,
      disclaimer_version: GLOBAL_TEMPLATE_DISCLAIMER_VERSION,
      accepted_at: now,
      accepted_by: userId,
      updated_at: now,
      updated_by: userId,
    };

    const { error: upsertError } = await supabase
      .from('practice_medication_cards')
      .upsert(nextDoc, { onConflict: 'practice_id,code' });

    if (upsertError) {
      return errorResponse(`Failed to accept global medication card: ${upsertError.message}`, 500);
    }

    await supabase.from('audit_log').insert({
      action: existingDoc ? 'updated' : 'created',
      actor_uid: userId,
      code: body.code,
      timestamp: now,
      previous_state: existingDoc || null,
      new_state: nextDoc,
    });

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
