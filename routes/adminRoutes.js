const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/adminController');

// Refund endpoints
router.post('/refund', AdminController.processRefund);
router.post('/roiicancel', AdminController.processROIICancellation);
router.post('/without', AdminController.processCancellationWithoutRefund);

// Manual trigger endpoints for automated operations
router.post('/trigger-bookings', AdminController.triggerAdminBookings);
router.post('/trigger-seats', AdminController.triggerSeatUpdates);
router.post('/trigger-coupons', AdminController.triggerDiscountCoupons);
router.post('/trigger-all', AdminController.triggerAllAdminOperations);

module.exports = router; 