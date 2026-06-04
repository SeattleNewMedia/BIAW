const express = require('express');
const router = express.Router();
const emailConfig = require('../config/email');
const { sendGraphMail, isMicrosoftGraphConfigured } = require('../services/microsoftMailAuth');

router.get('/email/config', (req, res) => {
  res.json(emailConfig.getPublicConfig());
});

router.get('/email/verify-smtp', async (req, res) => {
  try {
    const result = await emailConfig.verifyConnection();
    const status = result.ok ? 200 : 503;
    res.status(status).json(result);
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error.message,
      microsoftOAuthConfigured: isMicrosoftGraphConfigured(),
    });
  }
});

router.post('/email/test-send', async (req, res) => {
  try {
    const to = req.body?.to;
    if (!to) {
      return res.status(400).json({ ok: false, error: 'Missing "to" in request body' });
    }

    if (!isMicrosoftGraphConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'MICROSOFT_NOT_CONFIGURED',
      });
    }

    const from = emailConfig.getFromAddress();
    const result = await sendGraphMail({
      to,
      subject: 'BIAW class module — test email',
      html: `<p>This is a test message from the class module API.</p><p>Sent as <strong>${from.email}</strong> via Microsoft Graph.</p>`,
    });

    res.json({
      ok: true,
      message: `Test email sent to ${to}`,
      from: from.display,
      response: result.response,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
