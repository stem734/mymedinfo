/**
 * Shared utility for sending transactional emails via Brevo API v3.
 */

export interface BrevoRecipient {
  email: string;
  name?: string;
}

export interface BrevoEmailOptions {
  to: BrevoRecipient[];
  subject: string;
  htmlContent: string;
  textContent?: string;
}

/**
 * Sends a transactional email using Brevo's REST API.
 *
 * Requires BREVO_API_KEY and BREVO_FROM_EMAIL environment variables.
 */
export async function sendTransactionalEmail(options: BrevoEmailOptions) {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  const fromEmail = Deno.env.get('BREVO_FROM_EMAIL');
  const fromName = Deno.env.get('BREVO_FROM_NAME') || 'MyMedInfo';

  if (!apiKey || !fromEmail) {
    console.error('Brevo configuration missing: BREVO_API_KEY or BREVO_FROM_EMAIL');
    throw new Error('Email service configuration is incomplete');
  }

  const payload = {
    sender: { name: fromName, email: fromEmail },
    to: options.to,
    subject: options.subject,
    htmlContent: options.htmlContent,
    textContent: options.textContent,
  };

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Brevo API error:', {
      status: response.status,
      statusText: response.statusText,
      error: errorData,
    });
    throw new Error(`Failed to send email via Brevo: ${response.statusText}`);
  }

  return await response.json();
}
