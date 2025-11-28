const express = require('express');
const router = express.Router();
const SyncController = require('../controllers/SyncController');

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Webhook endpoint for Airtable automation
router.post('/webhook', async (req, res) => {
    try {
        console.log('Received webhook:', req.body);
        const result = await SyncController.processWebhook(req.body);
        
        // Check if result contains an error message
        if (result && result.error) {
            return res.status(400).json({ success: false, error: result.error });
        }
        
        res.json({ success: true, result });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get sync status
router.get('/status', (req, res) => {
    res.json({
        lastSyncTime: SyncController.getLastSyncTime(),
        nextSyncTime: SyncController.getNextSyncTime()
    });
});

module.exports = router; 