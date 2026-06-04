const {
  getFromAddress,
  isMicrosoftGraphConfigured,
  sendMailViaGraph,
} = require('./microsoftMailAuth');

function getAuthMode() {
  const mode = (process.env.EMAIL_AUTH || 'microsoft-graph').trim().toLowerCase();
  if (mode === 'microsoft-graph' || mode === 'graph') {
    return 'microsoft-graph';
  }
  return mode;
}

function assertEmailConfigured() {
  if (getAuthMode() !== 'microsoft-graph') {
    throw new Error(`Unsupported EMAIL_AUTH mode: ${getAuthMode()}`);
  }
  if (!isMicrosoftGraphConfigured()) {
    const err = new Error('Set MICROSOFT_REFRESH_TOKEN (run npm run microsoft-oauth-login)');
    err.code = 'MICROSOFT_NOT_CONFIGURED';
    throw err;
  }
}

async function sendEmail(to, subject, text, html = null) {
  assertEmailConfigured();
  const result = await sendMailViaGraph({ to, subject, text, html });
  console.log('Email sent:', result.response, 'to', to);
  return result;
}

const transporter = {
  async sendMail(mailOptions) {
    const { to, subject, text, html } = mailOptions;
    if (!to || !subject) {
      throw new Error('sendMail requires to and subject');
    }
    return sendEmail(to, subject, text || '', html || null);
  },
};

function getEmailConfig() {
  const { email, display } = getFromAddress();
  return {
    authMode: getAuthMode(),
    from: display,
    fromEmail: email,
    emailUser: (process.env.EMAIL_USER || email).trim(),
    microsoftOAuthConfigured: isMicrosoftGraphConfigured(),
    microsoftTenantId: (process.env.MICROSOFT_TENANT_ID || '').trim() || null,
    microsoftClientId: (process.env.MICROSOFT_CLIENT_ID || '').trim() || null,
    smtpHost: (process.env.SMTP_HOST || 'smtp.office365.com').trim(),
    smtpPort: Number(process.env.SMTP_PORT || 587),
  };
}

module.exports = {
  sendEmail,
  transporter,
  getEmailConfig,
  getAuthMode,
};
