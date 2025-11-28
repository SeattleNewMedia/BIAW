const express = require('express');
const router = express.Router();

// Import controllers
const WebhookController = require('../controllers/webhookController');
const ClassController = require('../controllers/classController');
const WaitlistController = require('../controllers/waitlistController');
const PaymentController = require('../controllers/paymentController');
const AirtableWebhookController = require('../controllers/airtableWebhookController');
const CertificationController = require('../controllers/certificationController');
const CertificationCardMergeController = require('../controllers/certificationCardMergeController');
const PaymentStatusController = require('../controllers/paymentStatusController');

// Import route modules
const adminRoutes = require('./adminRoutes');

// Health check route
router.get("/", (req, res) => {
  res.send("Server is running and ready to accept requests.");
});


// Webhook routes
router.post('/webhook', WebhookController.handleStripeWebhook);
router.post('/webhook/airtable-class', WebhookController.handleAirtableClassWebhook);

// Admin routes
router.use('/api', adminRoutes);


// Class registration routes
router.post('/submit-class', ClassController.submitClass);
router.post('/register-class', ClassController.registerClass);

// Waitlist routes
router.post('/waitlist', WaitlistController.addToWaitlist);

// Payment routes
router.post('/cancel-payment', PaymentController.cancelPayment);
router.post('/api/mail', PaymentController.sendPaymentReminder);

// Airtable webhook routes
router.post("/api/endpoint", AirtableWebhookController.handleUpdateWebhook);
router.post("/api/unpublish", AirtableWebhookController.handleUnpublishWebhook);
router.post("/api/delete", AirtableWebhookController.handleDeleteWebhook);
router.post("/api/special", AirtableWebhookController.handleSpecialWebhook);
router.post("/api/category-sync", AirtableWebhookController.handleCategorySyncWebhook);

// Certification routes
router.post('/api/certification', CertificationController.generateCertificate);
router.post('/api/send-certificate-email', CertificationController.sendCertificateEmail);

// Certification card merge route
router.post('/api/merge-certification-cards', CertificationCardMergeController.mergeCertificationCards);

// Payment status update routes
router.post('/api/payment-status-update', PaymentStatusController.handlePaymentWebhook);
router.post('/api/payment-status-update/:recordId', PaymentStatusController.testPaymentStatusUpdate);

module.exports = router; 