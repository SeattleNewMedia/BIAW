const {
  sendGraphMail,
  isMicrosoftGraphConfigured,
  getFromAddress,
  fetchAccessToken,
} = require('../services/microsoftMailAuth');

function getAuthMode() {
  return process.env.EMAIL_AUTH === 'microsoft-graph'
    ? 'microsoft-graph'
    : 'unsupported';
}

async function sendMail(mailOptions) {
  if (!isMicrosoftGraphConfigured()) {
    throw new Error(
      'Email is not configured. Set EMAIL_AUTH=microsoft-graph and complete Microsoft OAuth setup (see support-biaw-email-setup.md).'
    );
  }

  const to = mailOptions.to;
  const result = await sendGraphMail({
    to,
    subject: mailOptions.subject,
    html: mailOptions.html || mailOptions.text || '',
    attachments: mailOptions.attachments || [],
  });

  return {
    messageId: 'graph-send',
    response: result.response,
  };
}

async function verifyConnection() {
  const authMode = getAuthMode();
  const from = getFromAddress();

  if (!isMicrosoftGraphConfigured()) {
    return {
      ok: false,
      authMode,
      from: from.display,
      microsoftOAuthConfigured: false,
      error: 'MICROSOFT_NOT_CONFIGURED',
    };
  }

  await fetchAccessToken();

  return {
    ok: true,
    authMode,
    from: from.display,
    microsoftOAuthConfigured: true,
    smtpNote:
      'Office 365 password SMTP is disabled; mail is sent via Microsoft Graph OAuth.',
  };
}

function getPublicConfig() {
  const from = getFromAddress();
  return {
    authMode: getAuthMode(),
    from: from.display,
    fromEmail: from.email,
    fromName: from.name,
    microsoftOAuthConfigured: isMicrosoftGraphConfigured(),
    smtpHost: process.env.SMTP_HOST || 'smtp.office365.com',
    smtpPort: process.env.SMTP_PORT || '587',
  };
}

module.exports = {
  sendMail,
  verifyConnection,
  getPublicConfig,
  isMicrosoftGraphConfigured,
  getFromAddress,
};
