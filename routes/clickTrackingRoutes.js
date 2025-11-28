const express = require('express');
const router = express.Router();
const { trackClick, getClickAnalytics } = require('../controllers/clickTrackingController');

// POST /track-click - Track user clicks
router.post('/track-click', trackClick);

// GET /analytics/clicks - Get click analytics
router.get('/analytics/clicks', getClickAnalytics);

module.exports = router;
