require('dotenv').config();
const { getEmailConfig } = require('../services/emailService');
const { isMicrosoftGraphConfigured } = require('../services/microsoftMailAuth');

function main() {
  const config = getEmailConfig();
  console.log('Email configuration:');
  console.log(JSON.stringify(config, null, 2));

  if (!isMicrosoftGraphConfigured()) {
    console.error('\nMICROSOFT_NOT_CONFIGURED — run: npm run microsoft-oauth-login');
    process.exit(1);
  }

  console.log('\nSMTP OK (Microsoft Graph OAuth configured; no password SMTP required).');
  process.exit(0);
}

main();
