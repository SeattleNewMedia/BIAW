require('dotenv').config();
const axios = require('axios');
const { GRAPH_SCOPE } = require('../utils/microsoftMailAuth');

const tenantId = (process.env.MICROSOFT_TENANT_ID || '').trim();
const clientId = (process.env.MICROSOFT_CLIENT_ID || '').trim();

if (!tenantId || !clientId) {
  console.error('Set MICROSOFT_TENANT_ID and MICROSOFT_CLIENT_ID in .env first.');
  process.exit(1);
}

const deviceCodeUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`;
const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

async function main() {
  const { data: device } = await axios.post(
    deviceCodeUrl,
    new URLSearchParams({
      client_id: clientId,
      scope: GRAPH_SCOPE,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  console.log('\n--- Microsoft device login ---\n');
  console.log(device.message);
  console.log(`\nOpen: ${device.verification_uri}`);
  console.log(`Code: ${device.user_code}\n`);
  console.log('Sign in as support@biaw.com (or the mailbox that will send mail).\n');

  const intervalMs = (device.interval || 5) * 1000;
  const deadline = Date.now() + (device.expires_in || 900) * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const { data: token } = await axios.post(
        tokenUrl,
        new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          client_id: clientId,
          device_code: device.device_code,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      if (token.refresh_token) {
        console.log('\nSuccess. Add this to your .env (keep secret):\n');
        console.log(`MICROSOFT_REFRESH_TOKEN=${token.refresh_token}\n`);
        console.log('Then run: npm run email:verify\n');
        process.exit(0);
      }
    } catch (err) {
      const code = err.response?.data?.error;
      if (code === 'authorization_pending') continue;
      if (code === 'slow_down') {
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }
      console.error('Login failed:', err.response?.data || err.message);
      process.exit(1);
    }
  }

  console.error('Device code expired. Run this script again.');
  process.exit(1);
}

main().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
