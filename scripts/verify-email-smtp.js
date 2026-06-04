#!/usr/bin/env node
require('dotenv').config();
const emailConfig = require('../config/email');

async function main() {
  console.log('Verifying BIAW email configuration...\n');

  const result = await emailConfig.verifyConnection();
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.error(
      '\nFix: run npm run microsoft-oauth-login and set MICROSOFT_REFRESH_TOKEN in .env'
    );
    process.exit(1);
  }

  console.log('\nSMTP OK (Microsoft Graph OAuth — no password SMTP)');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
