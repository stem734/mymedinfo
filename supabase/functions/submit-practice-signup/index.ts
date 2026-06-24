import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getEmailConfig, sendSignupConfirmationEmail } from '../_shared/auth-email.ts';
import { createServiceClient, corsHeaders, errorResponse, jsonResponse } from '../_shared/supabase-client.ts';

type SignupBody = {
  name?: unknown;
  odsCode?: unknown;
  contactName?: unknown;
  contactEmail?: unknown;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RECENT_EMAIL_SIGNUPS = 3;
const MAX_RECENT_IP_SIGNUPS = 10;

const normaliseText = (value: unknown, maxLength: number) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const isValidOdsCode = (value: string) =>
  /^[A-Z0-9]{3,10}$/.test(value);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const body = await req.json() as SignupBody;
    const name = normaliseText(body.name, 140);
    const odsCode = normaliseText(body.odsCode, 16).toUpperCase();
    const contactName = normaliseText(body.contactName, 140);
    const contactEmail = normaliseText(body.contactEmail, 254).toLowerCase();

    if (!name || !odsCode || !contactName || !contactEmail) {
      return errorResponse('Organisation name, ODS code, contact name, and contact email are required');
    }

    if (!isValidOdsCode(odsCode)) {
      return errorResponse('Enter a valid ODS code using letters and numbers only');
    }

    if (!isValidEmail(contactEmail)) {
      return errorResponse('Enter a valid contact email address');
    }

    const supabase = createServiceClient();

    const [
      { data: existingByOds, error: odsLookupError },
      { data: existingByName, error: nameLookupError },
    ] = await Promise.all([
      supabase
        .from('practices')
        .select('id, is_active')
        .eq('ods_code', odsCode)
        .limit(1),
      supabase
        .from('practices')
        .select('id, is_active')
        .eq('name_lowercase', name.toLowerCase())
        .limit(1),
    ]);

    if (odsLookupError || nameLookupError) {
      return errorResponse('Unable to check existing practice registrations', 500);
    }

    const existingPractice = existingByOds?.[0] || existingByName?.[0];
    if (existingPractice) {
      return jsonResponse({
        success: true,
        status: existingPractice.is_active ? 'already_registered' : 'pending_review',
      });
    }

    const since = new Date(Date.now() - DAY_MS).toISOString();

    // Extract client IP from request headers
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                    req.headers.get('cf-connecting-ip') ||
                    req.headers.get('x-client-ip') ||
                    'unknown';

    const [
      { count: recentEmailSignups, error: emailCountError },
      { count: recentIpSignups, error: ipCountError },
    ] = await Promise.all([
      supabase
        .from('practices')
        .select('id', { count: 'exact', head: true })
        .eq('contact_email', contactEmail)
        .gte('signed_up_at', since),
      supabase
        .from('practices')
        .select('id', { count: 'exact', head: true })
        .eq('signup_ip', clientIp)
        .gte('signed_up_at', since),
    ]);

    if (emailCountError || ipCountError) {
      return errorResponse('Unable to validate registration request', 500);
    }

    if ((recentEmailSignups ?? 0) >= MAX_RECENT_EMAIL_SIGNUPS) {
      return errorResponse('Too many registration attempts from this contact email. Please try again tomorrow.', 429);
    }

    if ((recentIpSignups ?? 0) >= MAX_RECENT_IP_SIGNUPS) {
      return errorResponse('Too many registration attempts from this IP address. Please try again tomorrow.', 429);
    }

    const { error: insertError } = await supabase.from('practices').insert({
      name,
      ods_code: odsCode,
      contact_email: contactEmail,
      contact_name: contactName,
      signup_ip: clientIp,
      is_active: false,
      auth_uid: null,
      selected_medications: [],
      medication_review_dates: {},
      link_visit_count: 0,
      patient_rating_count: 0,
      patient_rating_total: 0,
      last_accessed: null,
    });

    if (insertError) {
      console.error('Registration submission error:', insertError);
      return errorResponse('Failed to submit registration', 500);
    }

    // Best-effort confirmation email. The registration is already saved, so a
    // mail failure must never fail the request — just log it.
    try {
      const emailConfig = getEmailConfig();
      if (emailConfig) {
        await sendSignupConfirmationEmail(emailConfig, {
          practiceName: name,
          contactName,
          to: contactEmail,
        });
      } else {
        console.error('Signup confirmation skipped: email service not configured (BREVO_API_KEY missing).');
      }
    } catch (emailError) {
      console.error('Signup confirmation email failed:', emailError);
    }

    return jsonResponse({ success: true, status: 'submitted' });
  } catch (err) {
    console.error('Unexpected edge function error:', err);
    return errorResponse('Internal error', 500);
  }
});
