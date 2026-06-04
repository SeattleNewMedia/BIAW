const axios = require('axios');

const GRAPH_SEND_URL = 'https://graph.microsoft.com/v1.0/me/sendMail';
const GRAPH_SCOPE = 'https://graph.microsoft.com/Mail.Send offline_access User.Read';

function getTenantId() {
  return (process.env.MICROSOFT_TENANT_ID || '').trim();
}

function getClientId() {
  return (process.env.MICROSOFT_CLIENT_ID || '').trim();
}

function getRefreshToken() {
  return (process.env.MICROSOFT_REFRESH_TOKEN || '').trim();
}

function getFromAddress() {
  const email = (process.env.EMAIL_FROM || process.env.EMAIL_USER || '').trim();
  const name = 'BIAW Support';
  return { email, name, display: name ? `${name} <${email}>` : email };
}

function isMicrosoftGraphConfigured() {
  return Boolean(getTenantId() && getClientId() && getRefreshToken());
}

function tokenEndpoint() {
  const tenant = getTenantId();
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}

async function refreshAccessToken() {
  if (!isMicrosoftGraphConfigured()) {
    const err = new Error('MICROSOFT_NOT_CONFIGURED');
    err.code = 'MICROSOFT_NOT_CONFIGURED';
    throw err;
  }

  const params = new URLSearchParams({
    client_id: getClientId(),
    grant_type: 'refresh_token',
    refresh_token: getRefreshToken(),
    scope: GRAPH_SCOPE,
  });

  const clientSecret = (process.env.MICROSOFT_CLIENT_SECRET || '').trim();
  if (clientSecret) {
    params.set('client_secret', clientSecret);
  }

  try {
    const { data } = await axios.post(tokenEndpoint(), params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!data.access_token) {
      throw new Error('Token response missing access_token');
    }
    return data.access_token;
  } catch (error) {
    const msg =
      error.response?.data?.error_description ||
      error.response?.data?.error ||
      error.message;
    const err = new Error(`Microsoft token refresh failed: ${msg}`);
    err.code = error.response?.data?.error || 'TOKEN_REFRESH_FAILED';
    throw err;
  }
}

async function sendMailViaGraph({ to, subject, text, html }) {
  const accessToken = await refreshAccessToken();
  const { email: fromEmail, name: fromName, display: fromDisplay } = getFromAddress();

  const contentType = html ? 'HTML' : 'Text';
  const content = html || text || '';

  const payload = {
    message: {
      subject,
      body: { contentType, content },
      from: {
        emailAddress: { address: fromEmail, name: fromName },
      },
      sender: {
        emailAddress: { address: fromEmail, name: fromName },
      },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: true,
  };

  try {
    await axios.post(GRAPH_SEND_URL, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    return {
      accepted: true,
      response: 'graph /me/sendMail accepted',
      from: fromDisplay,
    };
  } catch (error) {
    const msg =
      error.response?.data?.error?.message ||
      error.response?.data?.error_description ||
      error.message;
    const err = new Error(`Microsoft Graph sendMail failed: ${msg}`);
    err.code = error.response?.data?.error?.code || 'GRAPH_SEND_FAILED';
    throw err;
  }
}

module.exports = {
  getFromAddress,
  isMicrosoftGraphConfigured,
  refreshAccessToken,
  sendMailViaGraph,
  GRAPH_SCOPE,
};
