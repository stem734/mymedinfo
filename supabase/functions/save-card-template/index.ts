import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { createServiceClient, corsHeaders, errorResponse, jsonResponse } from '../_shared/supabase-client.ts';

const VALID_BUILDER_TYPES = ['healthcheck', 'screening', 'immunisation', 'ltc'] as const;
type BuilderType = typeof VALID_BUILDER_TYPES[number];

const isValidHttpUrl = (url: string | undefined): boolean => {
  if (!url || typeof url !== 'string') return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { admin, userId } = await assertAdmin(req.headers.get('Authorization'));

    const body = await req.json() as {
      builderType?: string;
      templateId?: string;
      label?: string;
      payload?: unknown;
      isGpRatified?: boolean;
    };
    const isGpRatified = body.isGpRatified === true;

    if (isGpRatified && admin.is_gp_ratifier !== true) {
      return errorResponse('GP ratifier access is required to clinically ratify global cards', 403);
    }

    const builderType = (body.builderType || '').trim() as BuilderType;
    const templateId = (body.templateId || '').trim();
    const label = (body.label || '').trim();

    if (!VALID_BUILDER_TYPES.includes(builderType)) {
      return errorResponse('Invalid builder type', 400);
    }
    if (!templateId) {
      return errorResponse('Template ID is required', 400);
    }
    if (!label) {
      return errorResponse('Template label is required', 400);
    }
    if (!body.payload || typeof body.payload !== 'object') {
      return errorResponse('Template payload is required', 400);
    }

    // Validate URLs to prevent Stored XSS via javascript: or data: URIs
    if (builderType === 'healthcheck') {
      const p = body.payload as Record<string, unknown>;
      if (p.variants && typeof p.variants === 'object') {
        for (const variant of Object.values(p.variants as Record<string, unknown>)) {
          const v = variant as Record<string, unknown>;
          if (Array.isArray(v?.links)) {
            for (const link of v.links) {
              const l = link as Record<string, unknown>;
              if (!isValidHttpUrl(l.website as string | undefined)) {
                return errorResponse('All website links must be valid HTTP or HTTPS URLs', 400);
              }
            }
          }
        }
      }
    } else {
      const p = body.payload as Record<string, unknown>;
      if (!isValidHttpUrl(p.videoUrl as string | undefined)) {
        return errorResponse('Video URL must be a valid HTTP or HTTPS URL', 400);
      }
      if (Array.isArray(p.nhsLinks)) {
        for (const link of p.nhsLinks) {
          const l = link as Record<string, unknown>;
          if (!isValidHttpUrl(l.url as string | undefined)) {
            return errorResponse('All NHS links must be valid HTTP or HTTPS URLs', 400);
          }
        }
      }
    }

    const supabase = createServiceClient();
    const templateKey = `${builderType}:${templateId}`;
    const now = new Date().toISOString();

    const { data: existingTemplate, error: existingError } = await supabase
      .from('card_templates')
      .select('*')
      .eq('template_key', templateKey)
      .maybeSingle();

    if (existingError) {
      return errorResponse(`Failed to load template: ${existingError.message}`, 500);
    }

    const version = (existingTemplate?.version || 0) + 1;
    const templateRecord = {
      template_key: templateKey,
      builder_type: builderType,
      template_id: templateId,
      label,
      payload: body.payload,
      version,
      created_at: existingTemplate?.created_at || now,
      created_by: existingTemplate?.created_by || userId,
      updated_at: now,
      updated_by: userId,
      is_gp_ratified: isGpRatified,
      gp_ratified_at: isGpRatified ? now : null,
      gp_ratified_by: isGpRatified ? userId : null,
    };

    const { error: upsertError } = await supabase
      .from('card_templates')
      .upsert(templateRecord, { onConflict: 'template_key' });

    if (upsertError) {
      return errorResponse(`Failed to save template: ${upsertError.message}`, 500);
    }

    const { error: revisionError } = await supabase
      .from('card_template_revisions')
      .insert({
        template_key: templateKey,
        builder_type: builderType,
        template_id: templateId,
        label,
        version,
        action: existingTemplate ? 'updated' : 'created',
        payload: body.payload,
        restored_from_revision_id: null,
        created_at: now,
        created_by: userId,
      });

    if (revisionError) {
      return errorResponse(`Template saved but revision history failed: ${revisionError.message}`, 500);
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
