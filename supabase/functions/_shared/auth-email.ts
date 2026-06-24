export type AuthEmailKind = 'adminSetup' | 'adminReset' | 'practiceSetup' | 'practiceReset';

export type EmailConfig = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
};

type AuthEmailOptions = {
  appBaseUrl: string;
  displayName: string;
  kind: AuthEmailKind;
  resetLink: string;
  to: string;
};

type EmailMessage = {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
};

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export function getAppBaseUrl() {
  return (Deno.env.get('APP_BASE_URL') || 'https://www.mymedinfo.info').replace(/\/$/, '');
}

/**
 * Read the transactional email provider configuration (Brevo).
 * Only BREVO_API_KEY is required; the from address/name fall back to the
 * MyMedInfo domain that is authorised in Brevo. Returns null when unconfigured
 * so callers can surface a clear "email service not configured" message.
 */
export function getEmailConfig(): EmailConfig | null {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) {
    return null;
  }

  const fromEmail = Deno.env.get('BREVO_FROM_EMAIL') || 'no-reply@mymedinfo.info';
  const fromName = Deno.env.get('BREVO_FROM_NAME') || 'MyMedInfo';

  return { apiKey, fromEmail, fromName };
}

/**
 * Low-level send via the Brevo transactional email API. Throws with the
 * provider's error message on failure so callers can log/surface it.
 */
export async function sendEmail(config: EmailConfig, message: EmailMessage) {
  const response = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': config.apiKey,
      'accept': 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: config.fromName, email: config.fromEmail },
      to: [{ email: message.to, name: message.toName || message.to }],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
    }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json() as { message?: string; code?: string };
      detail = body?.message || body?.code || JSON.stringify(body);
    } catch {
      detail = await response.text().catch(() => '');
    }
    throw new Error(`Brevo send failed (${response.status}): ${detail || 'unknown error'}`);
  }
}

export async function sendAuthLinkEmail(config: EmailConfig, options: AuthEmailOptions) {
  const content = getEmailContent(options.kind, options.appBaseUrl);
  const displayName = escapeHtml(options.displayName);
  const resetLink = escapeHtml(options.resetLink);
  const signInUrl = escapeHtml(content.signInUrl);

  await sendEmail(config, {
    to: options.to,
    toName: options.displayName,
    subject: content.subject,
    text: content.text(options.displayName, options.resetLink),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #212b32;">
        <h2 style="color: #005eb8;">${content.heading}</h2>
        <p>Hello ${displayName},</p>
        <p>${content.body}</p>
        <p style="margin: 24px 0;">
          <a href="${resetLink}" style="background: #005eb8; color: white; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">${content.buttonLabel}</a>
        </p>
        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        ${content.signInUrl ? `<p>After setting your password, sign in at <a href="${signInUrl}">${signInUrl}</a>.</p>` : '<p>If you did not request this, you can ignore this email.</p>'}
      </div>
    `,
  });
}

/**
 * Confirmation email sent to a practice contact when they submit the public
 * registration form. Informational only — no auth link, since the account is
 * not provisioned until an admin approves the registration.
 */
export async function sendSignupConfirmationEmail(config: EmailConfig, options: {
  practiceName: string;
  contactName: string;
  to: string;
}) {
  const practiceName = escapeHtml(options.practiceName);
  const contactName = escapeHtml(options.contactName || 'there');

  await sendEmail(config, {
    to: options.to,
    toName: options.contactName || options.to,
    subject: 'We have received your MyMedInfo registration',
    text: `Hello ${options.contactName || 'there'},\n\nThank you for registering ${options.practiceName} with MyMedInfo. Your application is now under review by the Nottingham West PCN team.\n\nWe will contact you at this email address once your registration has been processed.\n\nIf you did not request this, you can safely ignore this email.\n`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #212b32;">
        <h2 style="color: #005eb8;">Registration received</h2>
        <p>Hello ${contactName},</p>
        <p>Thank you for registering <strong>${practiceName}</strong> with MyMedInfo. Your application is now under review by the Nottingham West PCN team.</p>
        <p>We will contact you at this email address once your registration has been processed.</p>
        <p style="color: #4c6272; font-size: 0.9em;">If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

function getEmailContent(kind: AuthEmailKind, appBaseUrl: string) {
  switch (kind) {
    case 'adminSetup':
      return {
        subject: 'Set up your MyMedInfo administrator account',
        heading: 'Welcome to MyMedInfo',
        body: 'Your MyMedInfo administrator account has been created. Use the button below to set your password.',
        buttonLabel: 'Set Your Password',
        signInUrl: `${appBaseUrl}/admin`,
        text: (displayName: string, resetLink: string) =>
          `Hello ${displayName},\n\nYour MyMedInfo administrator account has been created. Set your password using this secure link:\n${resetLink}\n\nAfter setting your password, sign in at ${appBaseUrl}/admin\n`,
      };
    case 'adminReset':
      return {
        subject: 'Reset your MyMedInfo administrator password',
        heading: 'Reset your MyMedInfo password',
        body: 'Use the button below to reset your MyMedInfo administrator password.',
        buttonLabel: 'Reset Password',
        signInUrl: '',
        text: (displayName: string, resetLink: string) =>
          `Hello ${displayName},\n\nUse this secure link to reset your MyMedInfo administrator password:\n${resetLink}\n\nIf you did not request this, you can ignore this email.\n`,
      };
    case 'practiceSetup':
      return {
        subject: 'Set up your MyMedInfo practice account',
        heading: 'Welcome to MyMedInfo',
        body: 'Your MyMedInfo practice account has been created. Use the button below to set your password.',
        buttonLabel: 'Set Your Password',
        signInUrl: `${appBaseUrl}/practice`,
        text: (displayName: string, resetLink: string) =>
          `Hello ${displayName},\n\nYour MyMedInfo practice account has been created. Set your password using this secure link:\n${resetLink}\n\nAfter setting your password, sign in at ${appBaseUrl}/practice\n`,
      };
    case 'practiceReset':
      return {
        subject: 'Reset your MyMedInfo practice password',
        heading: 'Reset your MyMedInfo password',
        body: 'Use the button below to reset your MyMedInfo practice password.',
        buttonLabel: 'Reset Password',
        signInUrl: '',
        text: (displayName: string, resetLink: string) =>
          `Hello ${displayName},\n\nUse this secure link to reset your MyMedInfo practice password:\n${resetLink}\n\nIf you did not request this, you can ignore this email.\n`,
      };
  }
}
