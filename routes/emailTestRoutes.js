const express = require('express');
const router = express.Router();
const {
  getEmailConfig,
  verifyEmailTransport,
  sendEmail,
} = require('../services/emailService');
const { isMicrosoftGraphConfigured } = require('../services/microsoftMailAuth');

router.get('/email/config', (req, res) => {
  res.json({ ok: true, ...getEmailConfig() });
});

router.get('/email/verify-smtp', async (req, res) => {
  try {
    if (!isMicrosoftGraphConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'MICROSOFT_NOT_CONFIGURED',
        message: 'Set MICROSOFT_REFRESH_TOKEN (npm run microsoft-oauth-login)',
        ...getEmailConfig(),
      });
    }
    const config = getEmailConfig();
    res.json({
      ok: true,
      message: 'SMTP OK',
      authMode: config.authMode,
      from: config.from,
      microsoftOAuthConfigured: config.microsoftOAuthConfigured,
      note: 'Uses Microsoft Graph OAuth (not password SMTP)',
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.code || 'VERIFY_FAILED',
      message: error.message,
    });
  }
});

router.post('/email/test-send', async (req, res) => {
  const to = (req.body?.to || '').trim();
  if (!to) {
    return res.status(400).json({ ok: false, error: 'to is required in JSON body' });
  }
  try {
    const config = getEmailConfig();
    const result = await sendEmail(
      to,
      '[BIAW] Test email',
      'This is a test message from the member form API (Microsoft Graph).',
      '<p>This is a <strong>test</strong> message from the member form API (Microsoft Graph).</p>'
    );
    res.json({
      ok: true,
      message: `Test email sent to ${to}`,
      from: config.from,
      response: result.response,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.code || 'SEND_FAILED',
      message: error.message,
    });
  }
});

module.exports = router;
