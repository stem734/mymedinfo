import { Resend } from 'https://esm.sh/resend@6';

export type AuthEmailKind = 'adminSetup' | 'adminReset' | 'practiceSetup' | 'practiceReset';

type ResendConfig = {
  apiKey: string;
  fromEmail: string;
};

type AuthEmailOptions = {
  appBaseUrl: string;
  displayName: string;
  kind: AuthEmailKind;
  resetLink: string;
  to: string;
};

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

export function getResendConfig(): ResendConfig | null {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL');

  if (!apiKey || !fromEmail) {
    return null;
  }

  return { apiKey, fromEmail };
}

export async function sendAuthLinkEmail(config: ResendConfig, options: AuthEmailOptions) {
  const resend = new Resend(config.apiKey);
  const content = getEmailContent(options.kind, options.appBaseUrl);
  const displayName = escapeHtml(options.displayName);
  const resetLink = escapeHtml(options.resetLink);
  const signInUrl = escapeHtml(content.signInUrl);

  await resend.emails.send({
    from: config.fromEmail,
    to: options.to,
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
