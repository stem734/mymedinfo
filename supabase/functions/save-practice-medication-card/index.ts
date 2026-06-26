import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertClinicalRatifier } from '../_shared/assert-practice-access.ts';
import { CUSTOM_CARD_DISCLAIMER_VERSION } from '../_shared/practice-card-constants.ts';
import { createServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts';

type TrendLink = {
  title?: string;
  url?: string;
};

const normaliseStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : [];

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
    const body = await req.json() as {
      practiceId?: string;
      code?: string;
      title?: string;
      description?: string;
      badge?: string;
      category?: string;
      keyInfoMode?: string;
      keyInfo?: string[];
      doKeyInfo?: string[];
      dontKeyInfo?: string[];
      generalKeyInfo?: string[];
      nhsLink?: string;
      trendLinks?: TrendLink[];
      sickDaysNeeded?: boolean;
      reviewMonths?: number;
      contentReviewDate?: string;
      linkExpiryValue?: number;
      linkExpiryUnit?: 'weeks' | 'months';
      disclaimerAccepted?: boolean;
    };

    if (!body.practiceId || !body.code) {
      return errorResponse('practiceId and code are required');
    }

    if (body.disclaimerAccepted !== true) {
      return errorResponse('The custom medication disclaimer must be accepted');
    }

    if (!body.title?.trim() || !body.description?.trim() || !body.category?.trim()) {
      return errorResponse('Title, description, and category are required');
    }

    // Validate URLs to prevent XSS via javascript: or data: URIs
    if (!isValidHttpUrl(body.nhsLink)) {
      return errorResponse('NHS link must be a valid HTTP or HTTPS URL', 400);
    }

    if (body.trendLinks && Array.isArray(body.trendLinks)) {
      for (const link of body.trendLinks) {
        if (!isValidHttpUrl(link.url)) {
          return errorResponse('All trend links must be valid HTTP or HTTPS URLs', 400);
        }
      }
    }

    const badge = body.badge === 'REAUTH' || body.badge === 'GENERAL' ? body.badge : 'NEW';
    const keyInfoMode = body.keyInfoMode === 'dont' ? 'dont' : 'do';
    const keyInfo = normaliseStringArray(body.keyInfo);
    const doKeyInfo = normaliseStringArray(body.doKeyInfo);
    const dontKeyInfo = normaliseStringArray(body.dontKeyInfo);
    const generalKeyInfo = normaliseStringArray(body.generalKeyInfo);
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
      source_type: 'custom',
      title: body.title.trim(),
      description: body.description.trim(),
      badge,
      category: body.category.trim(),
      key_info_mode: keyInfoMode,
      key_info: keyInfo,
      do_key_info: doKeyInfo.length > 0 ? doKeyInfo : keyInfoMode === 'do' ? keyInfo : [],
      dont_key_info: dontKeyInfo.length > 0 ? dontKeyInfo : keyInfoMode === 'dont' ? keyInfo : [],
      general_key_info: generalKeyInfo,
      nhs_link: typeof body.nhsLink === 'string' ? body.nhsLink.trim() : '',
      trend_links: Array.isArray(body.trendLinks)
        ? body.trendLinks
            .map((item) => ({
              title: typeof item.title === 'string' ? item.title.trim() : '',
              url: typeof item.url === 'string' ? item.url.trim() : '',
            }))
            .filter((item) => item.title && item.url)
        : [],
      sick_days_needed: body.sickDaysNeeded === true,
      review_months: typeof body.reviewMonths === 'number' && body.reviewMonths > 0 ? body.reviewMonths : 12,
      content_review_date: typeof body.contentReviewDate === 'string' ? body.contentReviewDate : '',
      link_expiry_value: typeof body.linkExpiryValue === 'number' && body.linkExpiryValue > 0 ? body.linkExpiryValue : null,
      link_expiry_unit: body.linkExpiryUnit === 'weeks' || body.linkExpiryUnit === 'months' ? body.linkExpiryUnit : null,
      disclaimer_version: CUSTOM_CARD_DISCLAIMER_VERSION,
      accepted_at: now,
      accepted_by: userId,
      updated_at: now,
      updated_by: userId,
    };

    const { error: upsertError } = await supabase
      .from('practice_medication_cards')
      .upsert(nextDoc, { onConflict: 'practice_id,code' });

    if (upsertError) {
      return errorResponse(`Failed to save practice medication card: ${upsertError.message}`, 500);
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
