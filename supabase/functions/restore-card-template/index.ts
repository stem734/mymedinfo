import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { createServiceClient, corsHeaders, errorResponse, jsonResponse } from '../_shared/supabase-client.ts';

const VALID_BUILDER_TYPES = ['healthcheck', 'screening', 'immunisation', 'ltc', 'medication'] as const;
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
      revisionId?: string;
    };

    const builderType = (body.builderType || '').trim() as BuilderType;
    const templateId = (body.templateId || '').trim();
    const revisionId = (body.revisionId || '').trim();

    if (!VALID_BUILDER_TYPES.includes(builderType)) {
      return errorResponse('Invalid builder type', 400);
    }
    if (!templateId || !revisionId) {
      return errorResponse('Template ID and revision ID are required', 400);
    }

    const supabase = createServiceClient();
    const templateKey = `${builderType}:${templateId}`;

    const { data: revision, error: revisionError } = await supabase
      .from('card_template_revisions')
      .select('*')
      .eq('id', revisionId)
      .eq('template_key', templateKey)
      .maybeSingle();

    if (revisionError) {
      return errorResponse(`Failed to load revision: ${revisionError.message}`, 500);
    }
    if (!revision) {
      return errorResponse('Revision not found', 404);
    }

    const { data: latestRevisions, error: latestRevisionsError } = await supabase
      .from('card_template_revisions')
      .select('id')
      .eq('template_key', templateKey)
      .order('created_at', { ascending: false })
      .limit(4);

    if (latestRevisionsError) {
      return errorResponse(`Failed to validate restore window: ${latestRevisionsError.message}`, 500);
    }

    const restorableRevisionIds = (latestRevisions || []).slice(1, 4).map((item) => item.id);
    if (!restorableRevisionIds.includes(revisionId)) {
      return errorResponse('Only the latest 3 previous versions can be restored', 400);
    }

    const { data: existingTemplate, error: existingError } = await supabase
      .from('card_templates')
      .select('*')
      .eq('template_key', templateKey)
      .maybeSingle();

    if (existingError) {
      return errorResponse(`Failed to load current template: ${existingError.message}`, 500);
    }

    const now = new Date().toISOString();
    const version = (existingTemplate?.version || 0) + 1;

    if (builderType === 'medication') {
      const payload = revision.payload as Record<string, unknown>;
      const medicationCode = typeof payload.code === 'string' && payload.code.trim()
        ? payload.code.trim()
        : templateId;

      const medicationRecord = {
        code: medicationCode,
        title: payload.title,
        description: payload.description,
        badge: payload.badge,
        category: payload.category,
        key_info_mode: payload.key_info_mode ?? null,
        key_info: Array.isArray(payload.key_info) ? payload.key_info : [],
        do_key_info: Array.isArray(payload.do_key_info) ? payload.do_key_info : [],
        dont_key_info: Array.isArray(payload.dont_key_info) ? payload.dont_key_info : [],
        general_key_info: Array.isArray(payload.general_key_info) ? payload.general_key_info : [],
        nhs_link: typeof payload.nhs_link === 'string' ? payload.nhs_link : '',
        trend_links: Array.isArray(payload.trend_links) ? payload.trend_links : [],
        sick_days_needed: Boolean(payload.sick_days_needed),
        review_months: typeof payload.review_months === 'number' ? payload.review_months : 12,
        content_review_date: typeof payload.content_review_date === 'string' ? payload.content_review_date : '',
        link_expiry_value: typeof payload.link_expiry_value === 'number' ? payload.link_expiry_value : null,
        link_expiry_unit: payload.link_expiry_unit === 'weeks' || payload.link_expiry_unit === 'months'
          ? payload.link_expiry_unit
          : null,
        is_deleted: Boolean(payload.is_deleted),
        deleted_at: payload.is_deleted ? (typeof payload.deleted_at === 'string' ? payload.deleted_at : now) : null,
        deleted_by: payload.is_deleted ? (typeof payload.deleted_by === 'string' ? payload.deleted_by : userId) : null,
        updated_at: now,
        updated_by: userId,
        created_at: typeof payload.created_at === 'string' ? payload.created_at : now,
        created_by: typeof payload.created_by === 'string' ? payload.created_by : userId,
      };

      const { error: medicationUpsertError } = await supabase
        .from('medications')
        .upsert(medicationRecord, { onConflict: 'code' });

      if (medicationUpsertError) {
        return errorResponse(`Failed to restore medication: ${medicationUpsertError.message}`, 500);
      }
    }

    const templateRecord = {
      template_key: templateKey,
      builder_type: builderType,
      template_id: templateId,
      label: revision.label,
      payload: revision.payload,
      version,
      created_at: existingTemplate?.created_at || now,
      created_by: existingTemplate?.created_by || revision.created_by || userId,
      updated_at: now,
      updated_by: userId,
    };

    const { error: upsertError } = await supabase
      .from('card_templates')
      .upsert(templateRecord, { onConflict: 'template_key' });

    if (upsertError) {
      return errorResponse(`Failed to restore template: ${upsertError.message}`, 500);
    }

    const { error: insertRevisionError } = await supabase
      .from('card_template_revisions')
      .insert({
        template_key: templateKey,
        builder_type: builderType,
        template_id: templateId,
        label: revision.label,
        version,
        action: 'restored',
        payload: revision.payload,
        restored_from_revision_id: revision.id,
        created_at: now,
        created_by: userId,
      });

    if (insertRevisionError) {
      return errorResponse(`Template restored but revision history failed: ${insertRevisionError.message}`, 500);
    }

    return jsonResponse({
      success: true,
      templateKey,
      version,
    });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
