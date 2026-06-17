import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { createServiceClient, corsHeaders, errorResponse, jsonResponse } from '../_shared/supabase-client.ts';

const VALID_BUILDER_TYPES = ['healthcheck', 'screening', 'immunisation', 'ltc'] as const;
type BuilderType = typeof VALID_BUILDER_TYPES[number];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId } = await assertAdmin(req.headers.get('Authorization'));
    const body = await req.json() as {
      builderType?: string;
      templateId?: string;
      label?: string;
    };

    const builderType = (body.builderType || '').trim() as BuilderType;
    const templateId = (body.templateId || '').trim();
    const label = (body.label || '').trim();

    if (!VALID_BUILDER_TYPES.includes(builderType)) {
      return errorResponse('Invalid builder type', 400);
    }
    if (!templateId) {
      return errorResponse('Template ID is required', 400);
    }

    const supabase = createServiceClient();
    const templateKey = `${builderType}:${templateId}`;
    const now = new Date().toISOString();

    const { data: existing, error: fetchError } = await supabase
      .from('card_templates')
      .select('version, payload')
      .eq('template_key', templateKey)
      .maybeSingle();

    if (fetchError) {
      return errorResponse(`Failed to fetch template: ${fetchError.message}`, 500);
    }

    if (!existing) {
      return jsonResponse({ success: true, templateKey, alreadyDeleted: true });
    }

    const { error: deleteError } = await supabase
      .from('card_templates')
      .delete()
      .eq('template_key', templateKey);

    if (deleteError) {
      return errorResponse(`Failed to delete template: ${deleteError.message}`, 500);
    }

    const { error: revisionError } = await supabase
      .from('card_template_revisions')
      .insert({
        template_key: templateKey,
        builder_type: builderType,
        template_id: templateId,
        label: label || templateId,
        version: (existing.version || 0) + 1,
        action: 'deleted',
        payload: existing.payload,
        restored_from_revision_id: null,
        created_at: now,
        created_by: userId,
      });

    if (revisionError) {
      console.error('Template deleted but revision history failed:', revisionError.message);
    }

    return jsonResponse({ success: true, templateKey });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
