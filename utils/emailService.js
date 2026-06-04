require('dotenv').config();

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
  const { email } = getFromAddress();
  if (!email) {
    throw new Error('Set EMAIL_FROM or EMAIL_USER (e.g. support@biaw.com)');
  }
}

const sendEmail = async (recipientEmail, subject, body) => {
  try {
    assertEmailConfigured();
    const result = await sendMailViaGraph({
      to: recipientEmail,
      subject,
      text: body,
    });
    console.log('Email sent:', result.response, 'to', recipientEmail);
  } catch (error) {
    console.error('Error sending email:', error.message || error);
  }
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

async function sendTestEmail(to, subject, text, html = null) {
  assertEmailConfigured();
  return sendMailViaGraph({ to, subject, text, html });
}

module.exports = sendEmail;
module.exports.sendEmail = sendEmail;
module.exports.sendTestEmail = sendTestEmail;
module.exports.getEmailConfig = getEmailConfig;
module.exports.getAuthMode = getAuthMode;
