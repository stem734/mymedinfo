/**
 * Send password reset emails to all migrated users — via Brevo.
 *
 * Generates a Supabase recovery link for each user with the service role and
 * delivers it through Brevo, matching the app's Edge Function email path.
 *
 * Prerequisites:
 *   - SUPABASE_URL and SUPABASE_SERVICE_KEY env vars set
 *   - BREVO_API_KEY env var set (same key as the Edge Function secret)
 *   - Optional: BREVO_FROM_EMAIL (default no-reply@mymedinfo.info),
 *     BREVO_FROM_NAME (default MyMedInfo), APP_BASE_URL (default
 *     https://www.mymedinfo.info)
 *   - Supabase Auth "Redirect URLs" includes <APP_BASE_URL>/reset-password
 *
 * Usage:
 *   npx tsx scripts/send-password-resets.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_FROM_EMAIL = process.env.BREVO_FROM_EMAIL || 'no-reply@mymedinfo.info';
const BREVO_FROM_NAME = process.env.BREVO_FROM_NAME || 'MyMedInfo';
const APP_BASE_URL = (process.env.APP_BASE_URL || 'https://www.mymedinfo.info').replace(/\/$/, '');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.');
  process.exit(1);
}

if (!BREVO_API_KEY) {
  console.error('Missing BREVO_API_KEY environment variable.');
  process.exit(1);
}

const brevoApiKey = BREVO_API_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function sendBrevoReset(toEmail: string, toName: string, resetLink: string) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': brevoApiKey,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: BREVO_FROM_NAME, email: BREVO_FROM_EMAIL },
      to: [{ email: toEmail, name: toName || toEmail }],
      subject: 'Reset your MyMedInfo password',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #212b32;">
          <h2 style="color: #005eb8;">Reset your MyMedInfo password</h2>
          <p>Use the button below to set a new password for your MyMedInfo account.</p>
          <p style="margin: 24px 0;">
            <a href="${resetLink}" style="background: #005eb8; color: white; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">Reset Password</a>
          </p>
          <p>If the button does not work, copy and paste this link into your browser:</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <p>If you did not request this, you can safely ignore this email.</p>
        </div>
      `,
      textContent: `Use this secure link to reset your MyMedInfo password:\n${resetLink}\n\nIf you did not request this, you can ignore this email.\n`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Brevo send failed (${response.status}): ${detail || 'unknown error'}`);
  }
}

async function main() {
  const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });

  if (error) {
    console.error('Failed to list users:', error.message);
    process.exit(1);
  }

  console.log(`Found ${users.length} users. Sending password reset emails via Brevo...\n`);

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    if (!user.email) continue;

    try {
      const { data, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: user.email,
        options: { redirectTo: `${APP_BASE_URL}/reset-password` },
      });

      if (linkError) throw linkError;

      const resetLink = data?.properties?.action_link;
      if (!resetLink) throw new Error('No reset link was generated');

      const displayName = (user.user_metadata?.name as string | undefined) || user.email;
      await sendBrevoReset(user.email, displayName, resetLink);

      console.log(`  ✓ ${user.email}`);
      sent++;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      console.error(`  ✗ ${user.email}: ${message}`);
      failed++;
    }

    // Small delay to stay within Brevo / Supabase rate limits.
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone. Sent: ${sent}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
