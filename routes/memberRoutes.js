// routes/memberRoutes.js

const express = require('express');
const router = express.Router();
const memberController = require('../controllers/memberController');

router.post('/send-otp', memberController.sendOtp);
router.post('/verify-otp', memberController.verifyOtp);
router.post('/set-password', memberController.setPassword);
router.post('/update-company-id', memberController.updateCompanyId);
router.post('/submit', memberController.submit);
router.post('/api/directors', memberController.handleDirectorsWebhook);
router.post('/api/create-memberstack-account', memberController.createMemberstackAccount);
router.post('/api/process-airtable-updates', memberController.processAirtableUpdates);

module.exports = router; 