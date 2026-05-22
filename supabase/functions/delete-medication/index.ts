import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { createServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId } = await assertAdmin(req.headers.get('Authorization'));
    const { code } = await req.json();

    if (!code) {
      return errorResponse('Medication code is required');
    }

    const supabase = createServiceClient();
    const now = new Date().toISOString();

    // Get existing doc for audit
    const { data: existingDoc } = await supabase
      .from('medications')
      .select('*')
      .eq('code', code)
      .single();

    const deleteData = {
      is_deleted: true,
      deleted_at: now,
      deleted_by: userId,
    };

    const { error: deleteError } = await supabase
      .from('medications')
      .delete()
      .eq('code', code);

    if (deleteError) {
      return errorResponse(`Failed to delete medication: ${deleteError.message}`, 500);
    }

    const templateKey = `medication:${code}`;
    const { data: existingTemplate, error: existingTemplateError } = await supabase
      .from('card_templates')
      .select('*')
      .eq('template_key', templateKey)
      .maybeSingle();

    if (existingTemplateError) {
      return errorResponse(`Medication deleted but history lookup failed: ${existingTemplateError.message}`, 500);
    }

    const version = (existingTemplate?.version || 0) + 1;
    const payload = existingDoc
      ? { ...existingDoc, ...deleteData }
      : { code, ...deleteData };
    const templateRecord = {
      template_key: templateKey,
      builder_type: 'medication',
      template_id: code,
      label: existingDoc?.title || code,
      payload,
      version,
      created_at: existingTemplate?.created_at || now,
      created_by: existingTemplate?.created_by || userId,
      updated_at: now,
      updated_by: userId,
    };

    const { error: templateUpsertError } = await supabase
      .from('card_templates')
      .upsert(templateRecord, { onConflict: 'template_key' });

    if (templateUpsertError) {
      return errorResponse(`Medication deleted but history update failed: ${templateUpsertError.message}`, 500);
    }

    const { error: revisionError } = await supabase
      .from('card_template_revisions')
      .insert({
        template_key: templateKey,
        builder_type: 'medication',
        template_id: code,
        label: existingDoc?.title || code,
        version,
        action: 'deleted',
        payload,
        restored_from_revision_id: null,
        created_at: now,
        created_by: userId,
      });

    if (revisionError) {
      return errorResponse(`Medication deleted but revision history failed: ${revisionError.message}`, 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
