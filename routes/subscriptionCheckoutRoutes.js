const express = require('express');
const router = express.Router();
const { createSubscriptionCheckout } = require('../controllers/RenewSubscriptionController');
const { createRenewalCheckout } = require('../controllers/NewRenewSubscriptionController');

// Create subscription checkout session
router.post('/create-checkout', createSubscriptionCheckout);

// Create renewal subscription checkout session
router.post('/create-renewal-checkout', createRenewalCheckout);

module.exports = router; 