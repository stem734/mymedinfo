import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { assertAdmin } from '../_shared/assert-admin.ts';
import { createServiceClient, corsHeaders, jsonResponse, errorResponse } from '../_shared/supabase-client.ts';

const BUILT_IN_MAX_FAMILY = 5;

const normaliseMedicationFamilyName = (value: string) =>
  value
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(starting treatment|reauthorisation|first initiation|annual review|review)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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

    const data = await req.json() as {
      code?: string;
      requestedCode?: string;
      medicationName?: string;
      title: string;
      description: string;
      badge: string;
      category?: string;
      keyInfo: string[];
      nhsLink: string;
      trendLinks: { title: string; url: string }[];
      sickDaysNeeded: boolean;
      contentReviewDate?: string;
      linkExpiryValue?: number;
      linkExpiryUnit?: 'weeks' | 'months';
      isGpRatified?: boolean;
    };
    const isGpRatified = data.isGpRatified === true;

    if (isGpRatified && admin.is_gp_ratifier !== true) {
      return errorResponse('GP ratifier access is required to clinically ratify global cards', 403);
    }

    if (!data.title || !data.description || !data.badge || !data.contentReviewDate || typeof data.linkExpiryValue !== 'number') {
      return errorResponse('Title, description, type, review date, and expiry value are required');
    }

    // Validate URLs to prevent XSS via javascript: or data: URIs
    if (!isValidHttpUrl(data.nhsLink)) {
      return errorResponse('NHS link must be a valid HTTP or HTTPS URL', 400);
    }

    if (data.trendLinks && Array.isArray(data.trendLinks)) {
      for (const link of data.trendLinks) {
        if (!isValidHttpUrl(link.url)) {
          return errorResponse('All trend links must be valid HTTP or HTTPS URLs', 400);
        }
      }
    }

    const supabase = createServiceClient();
    const badge = data.badge === 'REAUTH' ? 'REAUTH' : 'NEW';
    const existingCode = typeof data.code === 'string' ? data.code.trim() : '';
    const requestedCode = typeof data.requestedCode === 'string' ? data.requestedCode.trim() : '';
    const familyName = normaliseMedicationFamilyName(
      typeof data.medicationName === 'string' && data.medicationName.trim()
        ? data.medicationName
        : data.title,
    );

    let medicationCode = existingCode;

    if (!medicationCode) {
      // Load all medications to find matching family codes
      const { data: allMeds } = await supabase
        .from('medications')
        .select('code, title');

      const medications = allMeds || [];

      const matchingFamilyCode = medications.find((med) => {
        const docTitle = typeof med.title === 'string' ? med.title : '';
        const docCode = typeof med.code === 'string' ? med.code : '';
        const docFamilyName = normaliseMedicationFamilyName(docTitle);

        if (!docCode || !docFamilyName || docFamilyName !== familyName) return false;
        return badge === 'REAUTH' ? docCode.endsWith('01') : docCode.endsWith('02');
      })?.code;

      if (typeof matchingFamilyCode === 'string' && matchingFamilyCode.length >= 3) {
        const familyBase = parseInt(matchingFamilyCode.slice(0, -2), 10);
        if (!isNaN(familyBase)) {
          medicationCode = String(familyBase * 100 + (badge === 'REAUTH' ? 2 : 1));
        }
      }

      if (!medicationCode && requestedCode) {
        medicationCode = requestedCode;
      }

      if (!medicationCode) {
        const highestFamily = medications.reduce((maxFamily, med) => {
          const parsedCode = parseInt(typeof med.code === 'string' ? med.code : '', 10);
          if (isNaN(parsedCode)) return maxFamily;
          return Math.max(maxFamily, Math.floor(parsedCode / 100));
        }, BUILT_IN_MAX_FAMILY);

        const nextFamily = highestFamily + 1;
        medicationCode = String(nextFamily * 100 + (badge === 'REAUTH' ? 2 : 1));
      }
    }

    if (requestedCode) {
      medicationCode = requestedCode;
    }

    // Check if requested code conflicts with another medication
    if (requestedCode && requestedCode !== existingCode) {
      const { data: conflicting } = await supabase
        .from('medications')
        .select('code, is_deleted')
        .eq('code', requestedCode)
        .single();

      if (conflicting && !conflicting.is_deleted) {
        return errorResponse(`Code ${requestedCode} is already in use`, 409);
      }
    }

    const now = new Date().toISOString();

    // Check if medication already exists
    const { data: existingDoc } = await supabase
      .from('medications')
      .select('*')
      .eq('code', medicationCode)
      .single();

    const action = existingDoc ? 'updated' : 'created';

    const medDoc = {
      code: medicationCode,
      title: data.title,
      description: data.description,
      badge,
      category: typeof data.category === 'string' && data.category.trim() ? data.category : 'Medication Information',
      key_info_mode: data.keyInfoMode ?? null,
      key_info: data.keyInfo || [],
      do_key_info: data.doKeyInfo || [],
      dont_key_info: data.dontKeyInfo || [],
      general_key_info: data.generalKeyInfo || [],
      nhs_link: data.nhsLink || '',
      trend_links: data.trendLinks || [],
      sick_days_needed: data.sickDaysNeeded || false,
      review_months: 12,
      content_review_date: data.contentReviewDate || '',
      link_expiry_value: typeof data.linkExpiryValue === 'number' ? data.linkExpiryValue : null,
      link_expiry_unit: data.linkExpiryUnit || null,
      is_deleted: false,
      updated_at: now,
      updated_by: userId,
      created_at: existingDoc?.created_at || now,
      created_by: existingDoc?.created_by || userId,
      is_gp_ratified: isGpRatified,
      gp_ratified_at: isGpRatified ? now : null,
      gp_ratified_by: isGpRatified ? userId : null,
    };

    const { error: upsertError } = await supabase
      .from('medications')
      .upsert(medDoc, { onConflict: 'code' });

    if (upsertError) {
      return errorResponse(`Failed to save medication: ${upsertError.message}`, 500);
    }

    const templateKey = `medication:${medicationCode}`;
    const { data: existingTemplate, error: existingTemplateError } = await supabase
      .from('card_templates')
      .select('*')
      .eq('template_key', templateKey)
      .maybeSingle();

    if (existingTemplateError) {
      return errorResponse(`Failed to load medication history: ${existingTemplateError.message}`, 500);
    }

    const version = (existingTemplate?.version || 0) + 1;
    const templateRecord = {
      template_key: templateKey,
      builder_type: 'medication',
      template_id: medicationCode,
      label: data.title,
      payload: medDoc,
      version,
      created_at: existingTemplate?.created_at || now,
      created_by: existingTemplate?.created_by || userId,
      updated_at: now,
      updated_by: userId,
      is_gp_ratified: isGpRatified,
      gp_ratified_at: isGpRatified ? now : null,
      gp_ratified_by: isGpRatified ? userId : null,
    };

    const { error: templateUpsertError } = await supabase
      .from('card_templates')
      .upsert(templateRecord, { onConflict: 'template_key' });

    if (templateUpsertError) {
      return errorResponse(`Medication saved but history update failed: ${templateUpsertError.message}`, 500);
    }

    const { error: revisionError } = await supabase
      .from('card_template_revisions')
      .insert({
        template_key: templateKey,
        builder_type: 'medication',
        template_id: medicationCode,
        label: data.title,
        version,
        action,
        payload: medDoc,
        restored_from_revision_id: null,
        created_at: now,
        created_by: userId,
      });

    if (revisionError) {
      return errorResponse(`Medication saved but revision history failed: ${revisionError.message}`, 500);
    }

    // If code changed, delete the old one
    if (existingCode && requestedCode && requestedCode !== existingCode) {
      await supabase.from('medications').delete().eq('code', existingCode);
    }

    return jsonResponse({ success: true, code: medicationCode });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
