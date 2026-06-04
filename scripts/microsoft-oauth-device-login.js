#!/usr/bin/env node
/**
 * One-time device login for support@biaw.com (BIAW tenant).
 * Copy MICROSOFT_REFRESH_TOKEN from output into .env
 */
require('dotenv').config();
const {
  getTenantId,
  getClientId,
  requestDeviceCode,
  pollDeviceCodeToken,
} = require('../services/microsoftMailAuth');

const POLL_INTERVAL_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!getTenantId() || !getClientId()) {
    console.error(
      'Set MICROSOFT_TENANT_ID and MICROSOFT_CLIENT_ID in .env before running this script.'
    );
    process.exit(1);
  }

  console.log('BIAW Microsoft Graph device login');
  console.log('Sign in as support@biaw.com when prompted.\n');

  const device = await requestDeviceCode();
  console.log(device.message);
  console.log(`Verification URL: ${device.verification_uri}`);
  console.log(`User code: ${device.user_code}\n`);

  const expiresAt = Date.now() + device.expires_in * 1000;

  while (Date.now() < expiresAt) {
    await sleep(POLL_INTERVAL_MS);
    const token = await pollDeviceCodeToken(device.device_code);

    if (token.access_token && token.refresh_token) {
      console.log('\nLogin successful. Add this line to your .env:\n');
      console.log(`MICROSOFT_REFRESH_TOKEN=${token.refresh_token}`);
      console.log('\nThen restart the server and run: npm run email:verify');
      process.exit(0);
    }

    if (token.error === 'authorization_pending') {
      process.stdout.write('.');
      continue;
    }

    if (token.error === 'slow_down') {
      await sleep(5000);
      continue;
    }

    console.error('\nToken error:', token.error, token.error_description || '');
    process.exit(1);
  }

  console.error('\nDevice code expired. Run the script again.');
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
