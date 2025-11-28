const express = require('express');
const router = express.Router();
const AwardsClassSyncController = require('../controllers/AwardsClassSyncController');
const AirtableModel = require('../models/AirtableModel');

// Health check
router.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Manual sync endpoint (sync all records for a given table and awardNameId)
router.post('/manual', async (req, res) => {
    const { tableName, awardNameId } = req.body;
    try {
        const records = await AirtableModel.getRecords(tableName);
        const result = await AwardsClassSyncController.syncAllRecords(records, awardNameId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Webhook endpoint (accepts flat payload)
router.post('/webhook', async (req, res) => {
    const { tableName, id, fields } = req.body;
    try {
        console.log('Webhook received:', req.body);
        const record = { id, fields };
        const awardNameId = tableName;
        const result = await AwardsClassSyncController.processWebhook(record, awardNameId);
        console.log('Controller result:', result);
        
        // Check if result contains an error message
        if (result && result.error) {
            return res.status(400).json(result);
        }
        
        res.json(result);
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 