const axios = require('axios');

const GRAPH_SCOPE =
  'https://graph.microsoft.com/Mail.Send offline_access User.Read openid';
const GRAPH_SEND_MAIL_URL = 'https://graph.microsoft.com/v1.0/me/sendMail';

function getTenantId() {
  return process.env.MICROSOFT_TENANT_ID;
}

function getClientId() {
  return process.env.MICROSOFT_CLIENT_ID;
}

function isMicrosoftGraphConfigured() {
  return (
    process.env.EMAIL_AUTH === 'microsoft-graph' &&
    Boolean(getTenantId()) &&
    Boolean(getClientId()) &&
    Boolean(process.env.MICROSOFT_REFRESH_TOKEN)
  );
}

function getFromAddress() {
  const name = process.env.EMAIL_FROM_NAME || 'BIAW';
  const email =
    process.env.EMAIL_FROM || process.env.EMAIL_USER || 'support@biaw.com';
  return {
    name,
    email,
    display: `"${name}" <${email}>`,
  };
}

function tokenEndpoint() {
  return `https://login.microsoftonline.com/${getTenantId()}/oauth2/v2.0/token`;
}

function deviceCodeEndpoint() {
  return `https://login.microsoftonline.com/${getTenantId()}/oauth2/v2.0/devicecode`;
}

async function fetchAccessToken() {
  if (!isMicrosoftGraphConfigured()) {
    throw new Error(
      'MICROSOFT_NOT_CONFIGURED: Set EMAIL_AUTH=microsoft-graph, MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, and MICROSOFT_REFRESH_TOKEN'
    );
  }

  const body = new URLSearchParams({
    client_id: getClientId(),
    grant_type: 'refresh_token',
    refresh_token: process.env.MICROSOFT_REFRESH_TOKEN,
    scope: GRAPH_SCOPE,
  });

  if (process.env.MICROSOFT_CLIENT_SECRET) {
    body.set('client_secret', process.env.MICROSOFT_CLIENT_SECRET);
  }

  const { data } = await axios.post(tokenEndpoint(), body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!data.access_token) {
    throw new Error('Microsoft token response did not include access_token');
  }

  return data.access_token;
}

async function requestDeviceCode() {
  const body = new URLSearchParams({
    client_id: getClientId(),
    scope: GRAPH_SCOPE,
  });

  const { data } = await axios.post(deviceCodeEndpoint(), body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return data;
}

async function pollDeviceCodeToken(deviceCode) {
  const body = new URLSearchParams({
    client_id: getClientId(),
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: deviceCode,
  });

  const { data } = await axios.post(tokenEndpoint(), body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    validateStatus: () => true,
  });

  return data;
}

function normalizeRecipients(to) {
  const list = Array.isArray(to) ? to : [to];
  return list.filter(Boolean).map((address) => ({
    emailAddress: { address: String(address).trim() },
  }));
}

async function fileAttachmentForGraph(attachment) {
  const source = attachment.path || attachment.href;
  if (!source) {
    return null;
  }

  const { data, headers } = await axios.get(source, {
    responseType: 'arraybuffer',
    timeout: 120000,
  });

  return {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: attachment.filename || 'attachment',
    contentType:
      headers['content-type'] || attachment.contentType || 'application/octet-stream',
    contentBytes: Buffer.from(data).toString('base64'),
  };
}

async function sendGraphMail({ to, subject, html, attachments = [] }) {
  const accessToken = await fetchAccessToken();

  const graphAttachments = [];
  for (const attachment of attachments) {
    const graphAttachment = await fileAttachmentForGraph(attachment);
    if (graphAttachment) {
      graphAttachments.push(graphAttachment);
    }
  }

  const payload = {
    message: {
      subject: subject || '',
      body: {
        contentType: 'HTML',
        content: html || '',
      },
      toRecipients: normalizeRecipients(to),
    },
    saveToSentItems: true,
  };

  if (graphAttachments.length > 0) {
    payload.message.attachments = graphAttachments;
  }

  await axios.post(GRAPH_SEND_MAIL_URL, payload, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  return { response: 'graph /me/sendMail accepted' };
}

module.exports = {
  GRAPH_SCOPE,
  getTenantId,
  getClientId,
  isMicrosoftGraphConfigured,
  getFromAddress,
  fetchAccessToken,
  requestDeviceCode,
  pollDeviceCodeToken,
  sendGraphMail,
};
